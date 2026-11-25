import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  classStatus,
  core,
  enrollmentStatus,
  feeCycle,
  honorific,
  recordStatus,
  studentStatus,
} from './core';
import { branches, users } from './users';

export const teachers = core.table('teachers', {
  id: uuid('id').primaryKey().defaultRandom(),
  // null until the teacher has an account
  userId: uuid('user_id')
    .unique('teachers_user_id_key')
    .references(() => users.id),
  fullName: text('full_name').notNull(),
  honorific: honorific('honorific').notNull(),
  subject: text('subject'),
  status: recordStatus('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const guardians = core.table(
  'guardians',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // null until the guardian has an account
    userId: uuid('user_id')
      .unique('guardians_user_id_key')
      .references(() => users.id),
    fullName: text('full_name').notNull(),
    phone: text('phone').notNull(),
    zaloId: text('zalo_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('guardians_phone_format_chk', sql`${t.phone} ~ '^0[0-9]{9}$'`),
    index('guardians_phone_idx').on(t.phone),
  ],
);

export const rooms = core.table(
  'rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    name: text('name').notNull(),
    capacity: integer('capacity'),
  },
  (t) => [
    unique('rooms_branch_id_name_key').on(t.branchId, t.name),
    check('rooms_capacity_chk', sql`${t.capacity} > 0`),
  ],
);

export const classes = core.table(
  'classes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    // "Toán 9A · Luyện thi vào 10"
    name: text('name').notNull(),
    subject: text('subject'),
    feeCycle: feeCycle('fee_cycle').notNull().default('month'),
    feeAmount: bigint('fee_amount', { mode: 'number' }).notNull(),
    dueDay: smallint('due_day').notNull().default(10),
    color: text('color').notNull().default('#2563EB'),
    status: classStatus('status').notNull().default('open'),
    startsOn: date('starts_on'),
    endsOn: date('ends_on'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('classes_fee_amount_chk', sql`${t.feeAmount} >= 0`),
    check('classes_due_day_chk', sql`${t.dueDay} BETWEEN 1 AND 28`),
    check('classes_color_chk', sql`${t.color} ~ '^#[0-9A-Fa-f]{6}$'`),
    check(
      'classes_dates_chk',
      sql`${t.endsOn} IS NULL OR ${t.startsOn} IS NULL OR ${t.endsOn} >= ${t.startsOn}`,
    ),
    index('classes_branch_idx').on(t.branchId, t.status),
  ],
);

// A class has many teachers and a teacher teaches many classes.
// Every assigned teacher can view the class, take attendance, assign and grade homework.
export const classTeachers = core.table(
  'class_teachers',
  {
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.classId, t.teacherId] }),
    index('class_teachers_teacher_idx').on(t.teacherId),
  ],
);

export const students = core.table(
  'students',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // LMS login account (null until issued)
    userId: uuid('user_id')
      .unique('students_user_id_key')
      .references(() => users.id),
    // HV-NNNN, never reused
    code: text('code').notNull(),
    fullName: text('full_name').notNull(),
    // name + class + phone + guardian name, lowercase WITHOUT diacritics; app updates it when sources change
    searchText: text('search_text').notNull().default(''),
    dob: date('dob'),
    // may be shared (siblings)
    phone: text('phone'),
    status: studentStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('students_code_key').on(t.code),
    check('students_code_format_chk', sql`${t.code} ~ '^HV-[0-9]{4,}$'`),
    check('students_phone_format_chk', sql`${t.phone} IS NULL OR ${t.phone} ~ '^0[0-9]{9}$'`),
    index('students_search_trgm_idx').using('gin', t.searchText.op('gin_trgm_ops')),
    index('students_phone_idx').on(t.phone),
  ],
);

export const studentGuardians = core.table(
  'student_guardians',
  {
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    guardianId: uuid('guardian_id')
      .notNull()
      .references(() => guardians.id, { onDelete: 'cascade' }),
    // "Mẹ", "Bố"...
    relation: text('relation'),
    // preferred reminder recipient
    isPrimary: boolean('is_primary').notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.studentId, t.guardianId] }),
    uniqueIndex('student_guardians_one_primary')
      .on(t.studentId)
      .where(sql`${t.isPrimary}`),
  ],
);

export const enrollments = core.table(
  'enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    status: enrollmentStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('enrollments_dates_chk', sql`${t.endDate} IS NULL OR ${t.endDate} >= ${t.startDate}`),
    // a student has at most one live enrollment per class
    uniqueIndex('enrollments_one_live')
      .on(t.studentId, t.classId)
      .where(sql`${t.status} <> 'ended'`),
    index('enrollments_class_idx').on(t.classId, t.status),
  ],
);

export type Teacher = typeof teachers.$inferSelect;
export type NewTeacher = typeof teachers.$inferInsert;
export type Guardian = typeof guardians.$inferSelect;
export type NewGuardian = typeof guardians.$inferInsert;
export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
export type Class = typeof classes.$inferSelect;
export type NewClass = typeof classes.$inferInsert;
export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;
export type Enrollment = typeof enrollments.$inferSelect;
export type NewEnrollment = typeof enrollments.$inferInsert;
