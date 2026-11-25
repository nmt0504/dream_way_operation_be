import { and, eq, gt, isNull, sql } from 'drizzle-orm';

import { db } from '../../db';
import { refreshTokens, users } from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { hashPassword, verifyPassword } from '../../lib/password';
import { isOperationRole } from '../../lib/permissions';
import {
  ACCESS_TOKEN_TTL_SEC,
  REFRESH_TOKEN_TTL_MS,
  generateRefreshToken,
  sha256,
  signAccessToken,
} from '../../lib/tokens';

const MAX_FAILED_LOGINS = 5;
const PHONE_RE = /^0[0-9]{9}$/;

const invalidCredentials = () =>
  new AppError(
    401,
    'INVALID_CREDENTIALS',
    'Số điện thoại / tên đăng nhập hoặc mật khẩu không đúng',
  );

const accountLocked = (until: Date) =>
  new AppError(
    423,
    'ACCOUNT_LOCKED',
    `Tài khoản bị khóa tạm do nhập sai mật khẩu ${MAX_FAILED_LOGINS} lần. Thử lại sau 15 phút.`,
    undefined,
    { locked_until: until.toISOString() },
  );

const sessionExpired = () =>
  new AppError(401, 'UNAUTHENTICATED', 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
  mustChangePassword: boolean;
};

async function issueTokens(userId: string, mustChangePassword: boolean): Promise<IssuedTokens> {
  const refreshToken = generateRefreshToken();
  await db.insert(refreshTokens).values({
    userId,
    tokenHash: sha256(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
  return { accessToken: await signAccessToken(userId), refreshToken, mustChangePassword };
}

export const tokenResponse = (t: IssuedTokens) => ({
  data: {
    access_token: t.accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SEC,
    must_change_password: t.mustChangePassword,
  },
});

export async function login(loginId: string, password: string): Promise<IssuedTokens> {
  const user = await db.query.users.findFirst({
    where: PHONE_RE.test(loginId) ? { phone: loginId } : { username: loginId.toLowerCase() },
  });
  if (!user?.passwordHash) throw invalidCredentials();
  if (user.lockedUntil && user.lockedUntil > new Date()) throw accountLocked(user.lockedUntil);

  if (!(await verifyPassword(user.passwordHash, password))) {
    // Atomic increment; the 5th failure locks for 15 minutes and resets the counter
    const reachesMax = sql`${users.failedLoginCount} + 1 >= ${MAX_FAILED_LOGINS}`;
    const [row] = await db
      .update(users)
      .set({
        failedLoginCount: sql`CASE WHEN ${reachesMax} THEN 0 ELSE ${users.failedLoginCount} + 1 END`,
        lockedUntil: sql`CASE WHEN ${reachesMax} THEN now() + interval '15 minutes' END`,
      })
      .where(eq(users.id, user.id))
      .returning({ lockedUntil: users.lockedUntil });
    if (row?.lockedUntil) throw accountLocked(row.lockedUntil);
    throw invalidCredentials();
  }

  if (user.status !== 'active') {
    throw new AppError(403, 'ACCOUNT_INACTIVE', 'Tài khoản đã bị khóa, vui lòng liên hệ Admin');
  }
  if (!isOperationRole(user.role)) {
    throw new AppError(403, 'ROLE_NOT_ALLOWED', 'Tài khoản này không dùng được app vận hành');
  }

  await db
    .update(users)
    .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(users.id, user.id));
  return issueTokens(user.id, user.mustChangePassword);
}

// Rotation: the presented token is revoked and a new one issued
export async function refresh(rawToken: string | undefined): Promise<IssuedTokens> {
  if (!rawToken) throw sessionExpired();
  const [old] = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.tokenHash, sha256(rawToken)),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: refreshTokens.userId });
  if (!old) throw sessionExpired();

  const user = await db.query.users.findFirst({
    where: { id: old.userId },
    columns: { id: true, role: true, status: true, mustChangePassword: true },
  });
  if (!user || user.status !== 'active' || !isOperationRole(user.role)) throw sessionExpired();
  return issueTokens(user.id, user.mustChangePassword);
}

export async function logout(rawToken: string | undefined) {
  if (!rawToken) return;
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, sha256(rawToken)), isNull(refreshTokens.revokedAt)));
}

export async function changePassword(userId: string, current: string, next: string) {
  const user = await db.query.users.findFirst({
    where: { id: userId },
    columns: { passwordHash: true },
  });
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, current))) {
    throw new AppError(422, 'INVALID_PASSWORD', 'Mật khẩu hiện tại không đúng', 'current_password');
  }
  if (current === next) {
    throw new AppError(
      422,
      'PASSWORD_UNCHANGED',
      'Mật khẩu mới phải khác mật khẩu hiện tại',
      'new_password',
    );
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next), mustChangePassword: false })
    .where(eq(users.id, userId));
}

// Used when an account is disabled or its password is reset by an admin
export const revokeAllRefreshTokens = (userId: string, tx: Pick<typeof db, 'update'> = db) =>
  tx
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
