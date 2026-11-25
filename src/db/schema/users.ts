import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  jsonb,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { core, recordStatus, reminderChannel, userRole } from './core';

// Stored as-is in jsonb, so keys stay snake_case
export type CenterSettings = {
  logo_url?: string | null;
  address?: string | null;
  reminder?: { channel: (typeof reminderChannel.enumValues)[number]; offset_min: number };
  revenue_target?: number | null;
};

// Center-wide settings: always exactly one row (id = true), inserted by the core_functions migration
export const settings = core.table(
  'settings',
  {
    id: boolean('id').primaryKey().default(true),
    centerName: text('center_name').notNull().default('DreamWay'),
    timezone: text('timezone').notNull().default('Asia/Ho_Chi_Minh'),
    // {"reminder": {"channel": "zalo", "offset_min": 60}, "revenue_target": 300000000}
    settings: jsonb('settings')
      .$type<CenterSettings>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('settings_singleton_chk', sql`${t.id}`)],
);

export const branches = core.table('branches', {
  id: uuid('id').primaryKey().defaultRandom(),
  // "Cơ sở Q.3"
  name: text('name').notNull(),
  address: text('address'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = core.table(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Login takes one "phone or username" field: 0xxxxxxxxx looks up phone, anything else username.
    // Guardians/staff/teachers log in by phone (username null). Students log in by username and by
    // convention keep phone null (it is unique and often the guardian's); contact phone is students.phone.
    phone: text('phone'),
    // defaults to the lowercased student code (e.g. "hv-0001"); never all digits so it can't look like a phone
    username: text('username'),
    fullName: text('full_name').notNull(),
    role: userRole('role').notNull(),
    status: recordStatus('status').notNull().default('active'),
    // bcrypt/argon2; null until a password is set
    passwordHash: text('password_hash'),
    // turned back on when an admin sets a temporary password
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    // temporary lock after 5 failed attempts
    failedLoginCount: smallint('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('users_phone_key').on(t.phone),
    unique('users_username_key').on(t.username),
    check('users_phone_format_chk', sql`${t.phone} ~ '^0[0-9]{9}$'`),
    check(
      'users_username_format_chk',
      sql`${t.username} ~ '^[a-z0-9._-]{3,32}$' AND ${t.username} !~ '^[0-9]+$'`,
    ),
    check('users_phone_required_chk', sql`${t.role} = 'student' OR ${t.phone} IS NOT NULL`),
    check('users_username_required_chk', sql`${t.role} <> 'student' OR ${t.username} IS NOT NULL`),
  ],
);

// Branch scope of staff and teachers. Admins need no rows here (they see the whole center).
export const userBranches = core.table(
  'user_branches',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.branchId] }),
    index('user_branches_branch_idx').on(t.branchId),
  ],
);

export type Settings = typeof settings.$inferSelect;
export type Branch = typeof branches.$inferSelect;
export type NewBranch = typeof branches.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserBranch = typeof userBranches.$inferSelect;
export type NewUserBranch = typeof userBranches.$inferInsert;
