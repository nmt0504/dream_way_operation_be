import { defineRelations } from 'drizzle-orm';

import * as schema from './schema';

// Actor columns (created_by, voided_by, approved_by...) are intentionally left out; add with `alias` when needed.
export const relations = defineRelations(schema, (r) => ({
  branches: {
    rooms: r.many.rooms(),
    classes: r.many.classes(),
    users: r.many.users({
      from: r.branches.id.through(r.userBranches.branchId),
      to: r.users.id.through(r.userBranches.userId),
    }),
  },
  rooms: {
    branch: r.one.branches({ from: r.rooms.branchId, to: r.branches.id, optional: false }),
  },
  users: {
    // empty for admins, who see every branch
    branches: r.many.branches(),
    notifications: r.many.notifications(),
  },
  teachers: {
    user: r.one.users({ from: r.teachers.userId, to: r.users.id }),
    classes: r.many.classes({
      from: r.teachers.id.through(r.classTeachers.teacherId),
      to: r.classes.id.through(r.classTeachers.classId),
    }),
    rates: r.many.teacherRates(),
    sessions: r.many.sessions(),
  },
  guardians: {
    user: r.one.users({ from: r.guardians.userId, to: r.users.id }),
    studentLinks: r.many.studentGuardians(),
  },
  classes: {
    branch: r.one.branches({ from: r.classes.branchId, to: r.branches.id, optional: false }),
    teachers: r.many.teachers(),
    enrollments: r.many.enrollments(),
    schedules: r.many.classSchedules(),
    sessions: r.many.sessions(),
    invoices: r.many.invoices(),
  },
  students: {
    user: r.one.users({ from: r.students.userId, to: r.users.id }),
    // via the junction table to keep `relation` / `is_primary`
    guardianLinks: r.many.studentGuardians(),
    enrollments: r.many.enrollments(),
    invoices: r.many.invoices(),
    attendanceRecords: r.many.attendanceRecords(),
  },
  studentGuardians: {
    student: r.one.students({
      from: r.studentGuardians.studentId,
      to: r.students.id,
      optional: false,
    }),
    guardian: r.one.guardians({
      from: r.studentGuardians.guardianId,
      to: r.guardians.id,
      optional: false,
    }),
  },
  enrollments: {
    student: r.one.students({ from: r.enrollments.studentId, to: r.students.id, optional: false }),
    class: r.one.classes({ from: r.enrollments.classId, to: r.classes.id, optional: false }),
    attendanceRecords: r.many.attendanceRecords(),
    invoices: r.many.invoices(),
  },
  classSchedules: {
    class: r.one.classes({ from: r.classSchedules.classId, to: r.classes.id, optional: false }),
    teacher: r.one.teachers({
      from: r.classSchedules.teacherId,
      to: r.teachers.id,
      optional: false,
    }),
    room: r.one.rooms({ from: r.classSchedules.roomId, to: r.rooms.id }),
    sessions: r.many.sessions(),
  },
  sessions: {
    class: r.one.classes({ from: r.sessions.classId, to: r.classes.id, optional: false }),
    schedule: r.one.classSchedules({ from: r.sessions.scheduleId, to: r.classSchedules.id }),
    teacher: r.one.teachers({ from: r.sessions.teacherId, to: r.teachers.id, optional: false }),
    room: r.one.rooms({ from: r.sessions.roomId, to: r.rooms.id }),
    payrollPeriod: r.one.payrollPeriods({
      from: r.sessions.payrollPeriodId,
      to: r.payrollPeriods.id,
    }),
    attendanceRecords: r.many.attendanceRecords(),
    reminders: r.many.reminderMessages(),
  },
  attendanceRecords: {
    session: r.one.sessions({
      from: r.attendanceRecords.sessionId,
      to: r.sessions.id,
      optional: false,
    }),
    enrollment: r.one.enrollments({
      from: r.attendanceRecords.enrollmentId,
      to: r.enrollments.id,
      optional: false,
    }),
    student: r.one.students({
      from: r.attendanceRecords.studentId,
      to: r.students.id,
      optional: false,
    }),
  },
  reminderMessages: {
    session: r.one.sessions({
      from: r.reminderMessages.sessionId,
      to: r.sessions.id,
      optional: false,
    }),
    student: r.one.students({
      from: r.reminderMessages.studentId,
      to: r.students.id,
      optional: false,
    }),
  },
  teacherRates: {
    teacher: r.one.teachers({ from: r.teacherRates.teacherId, to: r.teachers.id, optional: false }),
  },
  payrollPeriods: {
    items: r.many.payrollItems(),
    sessions: r.many.sessions(),
  },
  payrollItems: {
    period: r.one.payrollPeriods({
      from: r.payrollItems.periodId,
      to: r.payrollPeriods.id,
      optional: false,
    }),
    teacher: r.one.teachers({ from: r.payrollItems.teacherId, to: r.teachers.id, optional: false }),
  },
  invoices: {
    student: r.one.students({ from: r.invoices.studentId, to: r.students.id, optional: false }),
    class: r.one.classes({ from: r.invoices.classId, to: r.classes.id, optional: false }),
    enrollment: r.one.enrollments({ from: r.invoices.enrollmentId, to: r.enrollments.id }),
    payments: r.many.payments(),
  },
  payments: {
    invoice: r.one.invoices({ from: r.payments.invoiceId, to: r.invoices.id, optional: false }),
  },
  notifications: {
    user: r.one.users({ from: r.notifications.userId, to: r.users.id, optional: false }),
  },
}));
