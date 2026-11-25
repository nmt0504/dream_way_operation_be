import { sql } from 'drizzle-orm';
import { bigint, index, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { core } from './core';
import { users } from './users';

// Shared infrastructure: both core and lms write here

export const auditLogs = core.table(
  'audit_logs',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    actorId: uuid('actor_id').references(() => users.id),
    // payment.void · payroll.approve · attendance.update ...
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_entity_idx').on(t.entityType, t.entityId),
    // nullsFirst: drizzle's .desc() emits NULLS LAST, which `ORDER BY created_at DESC` can't use without a sort
    index('audit_time_idx').on(t.createdAt.desc().nullsFirst()),
  ],
);

export const notifications = core.table(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    // {"href": "/hoc-phi/HD-2608-014"}
    payload: jsonb('payload')
      .notNull()
      .default(sql`'{}'::jsonb`),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_unread_idx')
      .on(t.userId, t.createdAt.desc().nullsFirst())
      .where(sql`${t.readAt} IS NULL`),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
