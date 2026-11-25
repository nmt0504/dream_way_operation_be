import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  integer,
  numeric,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { teachers } from './classes';
import { core, payrollStatus, rateType } from './core';
import { users } from './users';

export const payrollPeriods = core.table(
  'payroll_periods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // first day of the month
    period: date('period').notNull(),
    status: payrollStatus('status').notNull().default('pending'),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('payroll_periods_period_key').on(t.period),
    check('payroll_periods_period_chk', sql`${t.period} = date_trunc('month', ${t.period})::date`),
    check(
      'payroll_periods_approved_chk',
      sql`${t.status} = 'pending' OR (${t.approvedBy} IS NOT NULL AND ${t.approvedAt} IS NOT NULL)`,
    ),
  ],
);

export const teacherRates = core.table(
  'teacher_rates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id),
    rateType: rateType('rate_type').notNull(),
    rate: bigint('rate', { mode: 'number' }).notNull(),
    effectiveFrom: date('effective_from').notNull(),
  },
  (t) => [
    unique('teacher_rates_teacher_id_effective_from_key').on(t.teacherId, t.effectiveFrom),
    check('teacher_rates_rate_chk', sql`${t.rate} > 0`),
  ],
);

export const payrollItems = core.table(
  'payroll_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    periodId: uuid('period_id')
      .notNull()
      .references(() => payrollPeriods.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id),
    sessionsCount: integer('sessions_count').notNull(),
    hours: numeric('hours', { precision: 7, scale: 2, mode: 'number' }).notNull(),
    // rate_type and rate are snapshots taken at approval
    rateType: rateType('rate_type').notNull(),
    rate: bigint('rate', { mode: 'number' }).notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
  },
  (t) => [unique('payroll_items_period_id_teacher_id_key').on(t.periodId, t.teacherId)],
);

export type PayrollPeriod = typeof payrollPeriods.$inferSelect;
export type NewPayrollPeriod = typeof payrollPeriods.$inferInsert;
export type TeacherRate = typeof teacherRates.$inferSelect;
export type NewTeacherRate = typeof teacherRates.$inferInsert;
export type PayrollItem = typeof payrollItems.$inferSelect;
export type NewPayrollItem = typeof payrollItems.$inferInsert;
