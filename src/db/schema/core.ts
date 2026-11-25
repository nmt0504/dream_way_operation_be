import { pgSchema } from 'drizzle-orm/pg-core';

// Schema `core` must never reference schema `lms`.
// Money: bigint (VND). Time: timestamptz, all calculations in Asia/Ho_Chi_Minh.
// Functions, triggers and views live in custom migrations (drizzle/*_core_functions, *_core_views) and
// reference tables/columns by name. drizzle-kit does not track them: renaming or retyping a column here
// needs a matching custom migration, and v_sessions (SELECT s.*) blocks type changes on core.sessions.
export const core = pgSchema('core');

// student: only logs in to the LMS site
export const userRole = core.enum('user_role', ['admin', 'staff', 'teacher', 'parent', 'student']);
export const recordStatus = core.enum('record_status', ['active', 'inactive']);
export const honorific = core.enum('honorific', ['co', 'thay']);
export const feeCycle = core.enum('fee_cycle', ['month', 'course']);
export const classStatus = core.enum('class_status', ['open', 'closed']);
export const studentStatus = core.enum('student_status', ['active', 'left']);
export const enrollmentStatus = core.enum('enrollment_status', ['active', 'paused', 'ended']);
export const sessionKind = core.enum('session_kind', ['regular', 'makeup', 'extra']);
export const sessionStatus = core.enum('session_status', ['scheduled', 'cancelled']);
export const attendanceStatus = core.enum('attendance_status', ['present', 'absent', 'late']);
export const reminderChannel = core.enum('reminder_channel', ['zalo', 'sms']);
export const reminderStatus = core.enum('reminder_status', [
  'queued',
  'sent',
  'failed',
  'cancelled',
]);
export const rateType = core.enum('rate_type', ['hour', 'session']);
export const payrollStatus = core.enum('payroll_status', ['pending', 'approved']);
export const invoiceStatus = core.enum('invoice_status', [
  'unpaid',
  'partial',
  'overdue',
  'paid',
  'cancelled',
]);
export const invoiceSource = core.enum('invoice_source', ['auto', 'manual']);
export const paymentMethod = core.enum('payment_method', ['cash', 'transfer']);
