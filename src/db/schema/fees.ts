import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { classes, enrollments, students } from './classes';
import { core, invoiceSource, invoiceStatus, paymentMethod } from './core';
import { users } from './users';

// Shared code counter: scope 'student' (period '') → HV-NNNN; scope 'invoice' (period 'YYMM') → HD-YYMM-NNNN
export const codeSequences = core.table(
  'code_sequences',
  {
    scope: text('scope').notNull(),
    period: text('period').notNull().default(''),
    lastNo: integer('last_no').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.scope, t.period] })],
);

export const invoices = core.table(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id),
    // null for some manual invoices
    enrollmentId: uuid('enrollment_id').references(() => enrollments.id),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    dueDate: date('due_date').notNull(),
    totalAmount: bigint('total_amount', { mode: 'number' }).notNull(),
    // denormalized, maintained by trigger
    paidAmount: bigint('paid_amount', { mode: 'number' }).notNull().default(0),
    // computed by trigger
    status: invoiceStatus('status').notNull().default('unpaid'),
    source: invoiceSource('source').notNull().default('auto'),
    note: text('note'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: uuid('cancelled_by').references(() => users.id),
    cancelReason: text('cancel_reason'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('invoices_code_key').on(t.code),
    check('invoices_code_format_chk', sql`${t.code} ~ '^HD-[0-9]{4}-[0-9]{3,}$'`),
    check('invoices_total_amount_chk', sql`${t.totalAmount} > 0`),
    check('invoices_period_chk', sql`${t.periodEnd} >= ${t.periodStart}`),
    check('invoices_paid_amount_chk', sql`${t.paidAmount} BETWEEN 0 AND ${t.totalAmount}`),
    check('invoices_cancel_chk', sql`(${t.cancelledAt} IS NULL) = (${t.cancelReason} IS NULL)`),
    // all payments must be voided before cancelling the invoice
    check(
      'invoices_cancel_requires_no_payment_chk',
      sql`${t.cancelledAt} IS NULL OR ${t.paidAmount} = 0`,
    ),
    // prevents duplicate auto invoices for the same enrollment and period
    uniqueIndex('invoices_one_per_period')
      .on(t.enrollmentId, t.periodStart)
      .where(sql`${t.cancelledAt} IS NULL`),
    // FEE-03
    index('invoices_list_idx').on(t.status, t.dueDate),
    index('invoices_student_idx').on(t.studentId),
  ],
);

export const payments = core.table(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    method: paymentMethod('method').notNull(),
    paidOn: date('paid_on').notNull(),
    receiptNo: text('receipt_no').notNull(),
    note: text('note'),
    collectedBy: uuid('collected_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: uuid('voided_by').references(() => users.id),
    voidReason: text('void_reason'),
  },
  (t) => [
    unique('payments_receipt_no_key').on(t.receiptNo),
    check('payments_amount_chk', sql`${t.amount} > 0`),
    check(
      'payments_void_chk',
      sql`(${t.voidedAt} IS NULL) = (${t.voidReason} IS NULL) AND (${t.voidedAt} IS NULL) = (${t.voidedBy} IS NULL)`,
    ),
    index('payments_invoice_idx').on(t.invoiceId),
    index('payments_paid_on_idx').on(t.paidOn),
  ],
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
