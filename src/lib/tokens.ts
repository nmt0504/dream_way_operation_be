import { createHash, randomBytes } from 'node:crypto';

import { SignJWT, errors, jwtVerify } from 'jose';

import { env } from '../config/env';
import { AppError } from './app-error';

export const ACCESS_TOKEN_TTL_SEC = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const secret = new TextEncoder().encode(env.jwtAccessSecret);

// Only `sub` is trusted; role/status are re-read from the DB on every request.
export const signAccessToken = (userId: string) =>
  new SignJWT()
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SEC}s`)
    .sign(secret);

export async function verifyAccessToken(token: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    if (!payload.sub) throw new Error('missing sub');
    return payload.sub;
  } catch (err) {
    if (err instanceof errors.JWTExpired) {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Phiên đăng nhập đã hết hạn, vui lòng tải lại');
    }
    throw new AppError(401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập');
  }
}

export const generateRefreshToken = () => randomBytes(32).toString('base64url');

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
