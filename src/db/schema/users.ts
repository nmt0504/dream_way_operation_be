import { sql } from 'drizzle-orm';
import { check, pgSchema, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const core = pgSchema('core');

export const userRole = core.enum('user_role', ['admin', 'manager', 'teacher', 'student']);
export const recordStatus = core.enum('record_status', ['active', 'inactive']);

export const users = core.table(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // TODO: add FK to core.centers(id) once the centers table exists
    centerId: uuid('center_id').notNull(),
    // Students may not have their own phone number
    phone: text('phone'),
    fullName: text('full_name').notNull(),
    role: userRole('role').notNull(),
    status: recordStatus('status').notNull().default('active'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('users_center_id_phone_key').on(t.centerId, t.phone),
    check('users_phone_format_chk', sql`${t.phone} ~ '^0[0-9]{9}$'`),
    check('users_phone_required_chk', sql`${t.role} = 'student' OR ${t.phone} IS NOT NULL`),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
