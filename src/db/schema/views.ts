import {
  bigint,
  boolean,
  date,
  integer,
  numeric,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { core, rateType, sessionKind, sessionStatus } from './core';

// Views are created by drizzle/*_core_views/migration.sql; .existing() keeps drizzle-kit from managing them.
// Keep these column lists in sync with that SQL — drizzle-kit cannot detect drift here.

export const vSessions = core
  .view('v_sessions', {
    id: uuid('id').notNull(),
    classId: uuid('class_id').notNull(),
    scheduleId: uuid('schedule_id'),
    teacherId: uuid('teacher_id').notNull(),
    roomId: uuid('room_id'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    durationMin: integer('duration_min').notNull(),
    kind: sessionKind('kind').notNull(),
    status: sessionStatus('status').notNull(),
    cancelReason: text('cancel_reason'),
    reminderEnabled: boolean('reminder_enabled').notNull(),
    attendanceTakenAt: timestamp('attendance_taken_at', { withTimezone: true }),
    attendanceTakenBy: uuid('attendance_taken_by'),
    payrollPeriodId: uuid('payroll_period_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    localDate: date('local_date').notNull(),
    displayStatus: text('display_status')
      .$type<'cancelled' | 'attended' | 'in_progress' | 'not_attended'>()
      .notNull(),
    // DB-02: start time reached but attendance not saved
    needsAttendance: boolean('needs_attendance').notNull(),
    // attendance opens 15 minutes before start
    attendanceOpen: boolean('attendance_open').notNull(),
  })
  .existing();

// ATT-05, ATT-08, STU-02
export const vEnrollmentAttendance = core
  .view('v_enrollment_attendance', {
    enrollmentId: uuid('enrollment_id').notNull(),
    studentId: uuid('student_id').notNull(),
    sessionsTaken: bigint('sessions_taken', { mode: 'number' }).notNull(),
    presentCount: bigint('present_count', { mode: 'number' }).notNull(),
    lateCount: bigint('late_count', { mode: 'number' }).notNull(),
    absentExcused: bigint('absent_excused', { mode: 'number' }).notNull(),
    absentUnexcused: bigint('absent_unexcused', { mode: 'number' }).notNull(),
    attendanceRate: numeric('attendance_rate', { mode: 'number' }),
  })
  .existing();

export const vStudentFeeStatus = core
  .view('v_student_fee_status', {
    studentId: uuid('student_id').notNull(),
    feeStatus: text('fee_status').$type<'overdue' | 'owing' | 'paid'>().notNull(),
    outstanding: bigint('outstanding', { mode: 'number' }).notNull(),
  })
  .existing();

// PAY-02..05; rate/rateType/amount are null when the teacher has no rate for the period
export const vPayrollPreview = core
  .view('v_payroll_preview', {
    period: date('period').notNull(),
    teacherId: uuid('teacher_id').notNull(),
    sessionsCount: bigint('sessions_count', { mode: 'number' }).notNull(),
    hours: numeric('hours', { mode: 'number' }).notNull(),
    rateType: rateType('rate_type'),
    rate: bigint('rate', { mode: 'number' }),
    amount: bigint('amount', { mode: 'number' }),
  })
  .existing();

export type VSession = typeof vSessions.$inferSelect;
export type VEnrollmentAttendance = typeof vEnrollmentAttendance.$inferSelect;
export type VStudentFeeStatus = typeof vStudentFeeStatus.$inferSelect;
export type VPayrollPreview = typeof vPayrollPreview.$inferSelect;
