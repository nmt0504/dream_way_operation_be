import { and, eq, lt, sql } from 'drizzle-orm';
import type { RequestHandler } from 'express';

import { db } from '../db';
import { idempotencyKeys } from '../db/schema';
import { AppError } from '../lib/app-error';
import { sha256 } from '../lib/tokens';
import { currentUser } from './authenticate';

/**
 * Idempotency-Key: the first request claims the key; a replay within 24h with the same body gets the
 * stored response. Mount after authenticate(). Only responses sent with res.json() are stored.
 */
export const idempotency: RequestHandler = async (req, res, next) => {
  const key = req.header('Idempotency-Key');
  if (!key) return next();
  if (key.length > 255) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Idempotency-Key tối đa 255 ký tự',
      'Idempotency-Key',
    );
  }

  const userId = currentUser(req).id;
  const requestHash = sha256(
    `${req.method} ${req.originalUrl}\n${JSON.stringify(req.body ?? null)}`,
  );
  const thisKey = and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key));

  await db
    .delete(idempotencyKeys)
    .where(and(thisKey, lt(idempotencyKeys.createdAt, sql`now() - interval '24 hours'`)));
  const [claimed] = await db
    .insert(idempotencyKeys)
    .values({ userId, key, requestHash })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key });

  if (!claimed) {
    const [existing] = await db.select().from(idempotencyKeys).where(thisKey);
    if (existing && existing.requestHash !== requestHash) {
      throw new AppError(
        422,
        'IDEMPOTENCY_KEY_REUSED',
        'Idempotency-Key đã được dùng cho một yêu cầu khác',
        'Idempotency-Key',
      );
    }
    if (!existing || existing.statusCode === null) {
      throw new AppError(
        409,
        'IDEMPOTENCY_IN_PROGRESS',
        'Yêu cầu trước đó đang được xử lý, vui lòng thử lại sau',
      );
    }
    res.status(existing.statusCode).json(existing.response);
    return;
  }

  const sendJson = res.json.bind(res);
  res.json = (body: unknown) => {
    // 5xx: release the key so the client can retry; otherwise store the response before sending it
    const store =
      res.statusCode >= 500
        ? db.delete(idempotencyKeys).where(thisKey)
        : db
            .update(idempotencyKeys)
            .set({ statusCode: res.statusCode, response: body })
            .where(thisKey);
    Promise.resolve(store)
      .catch((err: unknown) => req.log.error({ err }, 'Failed to store idempotent response'))
      .finally(() => sendJson(body));
    return res;
  };
  next();
};
