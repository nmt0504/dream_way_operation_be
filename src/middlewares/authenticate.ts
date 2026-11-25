import type { Request, RequestHandler } from 'express';

import { db } from '../db';
import { AppError } from '../lib/app-error';
import { type OperationRole, isOperationRole } from '../lib/permissions';
import { verifyAccessToken } from '../lib/tokens';

export type AuthUser = {
  id: string;
  role: OperationRole;
  // empty for admins, who see every branch
  branchIds: string[];
  mustChangePassword: boolean;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

type Options = {
  // only /auth/password and /me are reachable before the forced password change
  allowPendingPasswordChange?: boolean;
};

export const authenticate =
  (options: Options = {}): RequestHandler =>
  async (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập');
    }
    const userId = await verifyAccessToken(header.slice('Bearer '.length));

    // Re-read on every request so lock / role change / password reset take effect immediately
    const user = await db.query.users.findFirst({
      where: { id: userId },
      columns: { id: true, role: true, status: true, mustChangePassword: true },
      with: { branches: { columns: { id: true } } },
    });
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập');
    if (user.status !== 'active') {
      throw new AppError(403, 'ACCOUNT_INACTIVE', 'Tài khoản đã bị khóa, vui lòng liên hệ Admin');
    }
    if (!isOperationRole(user.role)) {
      throw new AppError(403, 'ROLE_NOT_ALLOWED', 'Tài khoản này không dùng được app vận hành');
    }
    if (user.mustChangePassword && !options.allowPendingPasswordChange) {
      throw new AppError(
        403,
        'PASSWORD_CHANGE_REQUIRED',
        'Bạn cần đổi mật khẩu trước khi tiếp tục',
      );
    }

    req.user = {
      id: user.id,
      role: user.role,
      branchIds: user.branches.map((b) => b.id),
      mustChangePassword: user.mustChangePassword,
    };
    next();
  };

// For handlers mounted behind authenticate()
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw new AppError(401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập');
  return req.user;
}
