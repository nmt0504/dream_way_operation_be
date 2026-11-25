import { sql } from 'drizzle-orm';
import { index, jsonb, primaryKey, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { core } from './core';
import { users } from './users';

// Refresh token (httpOnly cookie, 30 days). Only the SHA-256 of the token is stored; rotated on every refresh.
export const refreshTokens = core.table(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique('refresh_tokens_token_hash_key'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('refresh_tokens_user_idx')
      .on(t.userId)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);

// Idempotency-Key header: replaying the same key within 24 hours returns the first response.
export const idempotencyKeys = core.table(
  'idempotency_keys',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    // SHA-256 of method + path + body; a different hash means the key was reused for another request
    requestHash: text('request_hash').notNull(),
    // null while the first request is still running
    statusCode: smallint('status_code'),
    response: jsonb('response'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
