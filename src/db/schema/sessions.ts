import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { classes, enrollments, rooms, students, teachers } from './classes';
import {
  attendanceStatus,
  core,
  reminderChannel,
  reminderStatus,
  sessionKind,
  sessionStatus,
} from './core';
import { payrollPeriods } from './payroll';
import { users } from './users';

export const classSchedules = core.table(
  'class_schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    // ISO: 1 = Monday, 7 = Sunday
    weekday: smallint('weekday').notNull(),
    startTime: time('start_time').notNull(),
    durationMin: integer('duration_min').notNull(),
    roomId: uuid('room_id').references(() => rooms.id),
    // must be one of the class's teachers (enforced by trigger)
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id),
    validFrom: date('valid_from').notNull(),
    validTo: date('valid_to'),
  },
  (t) => [
    check('class_schedules_weekday_chk', sql`${t.weekday} BETWEEN 1 AND 7`),
    check('class_schedules_duration_min_chk', sql`${t.durationMin} > 0`),
    check(
      'class_schedules_valid_dates_chk',
      sql`${t.validTo} IS NULL OR ${t.validTo} >= ${t.validFrom}`,
    ),
  ],
);

export const sessions = core.table(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id),
    // null = makeup / one-off session
    scheduleId: uuid('schedule_id').references(() => classSchedules.id),
    // teacher who ACTUALLY taught, may be a substitute from outside the class (PAY-07)
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id),
    roomId: uuid('room_id').references(() => rooms.id),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    durationMin: integer('duration_min').notNull(),
    kind: sessionKind('kind').notNull().default('regular'),
    status: sessionStatus('status').notNull().default('scheduled'),
    cancelReason: text('cancel_reason'),
    reminderEnabled: boolean('reminder_enabled').notNull().default(true),
    attendanceTakenAt: timestamp('attendance_taken_at', { withTimezone: true }),
    attendanceTakenBy: uuid('attendance_taken_by').references(() => users.id),
    // set on payroll approval → locks attendance
    payrollPeriodId: uuid('payroll_period_id').references(() => payrollPeriods.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // re-running the session generator job never creates duplicates
    unique('sessions_schedule_id_starts_at_key').on(t.scheduleId, t.startsAt),
    check('sessions_duration_min_chk', sql`${t.durationMin} > 0`),
    check(
      'sessions_cancel_reason_chk',
      sql`${t.status} = 'scheduled' OR ${t.cancelReason} IS NOT NULL`,
    ),
    index('sessions_class_time_idx').on(t.classId, t.startsAt),
    index('sessions_time_idx').on(t.startsAt),
    index('sessions_teacher_time_idx').on(t.teacherId, t.startsAt),
    // room clash warning (SCH-06)
    index('sessions_room_time_idx').on(t.roomId, t.startsAt),
  ],
);

export const attendanceRecords = core.table(
  'attendance_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => enrollments.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    status: attendanceStatus('status').notNull().default('present'),
    // required when absent, must be null when present/late (ATT-04)
    absenceExcused: boolean('absence_excused'),
    note: text('note'),
    updatedBy: uuid('updated_by').references(() => users.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('attendance_records_session_id_student_id_key').on(t.sessionId, t.studentId),
    check(
      'attendance_absent_excused_chk',
      sql`(${t.status} = 'absent') = (${t.absenceExcused} IS NOT NULL)`,
    ),
    index('attendance_student_idx').on(t.studentId),
  ],
);

export const reminderMessages = core.table(
  'reminder_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    // phone snapshot at enqueue time
    recipientPhone: text('recipient_phone').notNull(),
    channel: reminderChannel('channel').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    status: reminderStatus('status').notNull().default('queued'),
    // 1 attempt + 2 retries
    attempts: smallint('attempts').notNull().default(0),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('reminder_messages_attempts_chk', sql`${t.attempts} BETWEEN 0 AND 3`),
    index('reminder_queue_idx')
      .on(t.scheduledAt)
      .where(sql`${t.status} = 'queued'`),
  ],
);

export type ClassSchedule = typeof classSchedules.$inferSelect;
export type NewClassSchedule = typeof classSchedules.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type NewAttendanceRecord = typeof attendanceRecords.$inferInsert;
export type ReminderMessage = typeof reminderMessages.$inferSelect;
export type NewReminderMessage = typeof reminderMessages.$inferInsert;
