// Integration tests for the business rules enforced inside Postgres (triggers, functions, views).
// Requires the docker-compose database with migrations applied (`pnpm db:migrate`).
// Every test runs in a transaction that is rolled back, so the database is left untouched.
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../../src/db';
import { relations } from '../../src/db/relations';
import * as s from '../../src/db/schema';

let client: PoolClient;
const connect = (c: PoolClient) => drizzle({ client: c, relations });
let tx: ReturnType<typeof connect>;

beforeEach(async () => {
  client = await pool.connect();
  await client.query('BEGIN');
  tx = connect(client);
});

afterEach(async () => {
  await client.query('ROLLBACK');
  client.release();
});

afterAll(() => pool.end());

// Runs fn inside a savepoint and returns the Postgres error message (drizzle wraps it in `cause`).
async function dbError(fn: () => Promise<unknown>): Promise<string> {
  await client.query('SAVEPOINT expect_error');
  try {
    await fn();
  } catch (e) {
    await client.query('ROLLBACK TO SAVEPOINT expect_error');
    const err = e as { message: string; cause?: { message: string } };
    return err.cause?.message ?? err.message;
  }
  throw new Error('Expected a database error, but the query succeeded');
}

async function seed() {
  const [branch] = await tx.insert(s.branches).values({ name: 'Cơ sở Q.3' }).returning();
  const [admin] = await tx
    .insert(s.users)
    .values({ phone: '0900000001', fullName: 'Admin', role: 'admin' })
    .returning();
  const [teacher, outsider] = await tx
    .insert(s.teachers)
    .values([
      { fullName: 'Cô Lan', honorific: 'co' },
      { fullName: 'Thầy Nam', honorific: 'thay' },
    ])
    .returning();
  const [klass] = await tx
    .insert(s.classes)
    .values({ branchId: branch!.id, name: 'Toán 9A', feeAmount: 1_000_000 })
    .returning();
  await tx.insert(s.classTeachers).values({ classId: klass!.id, teacherId: teacher!.id });
  const [student] = await tx
    .insert(s.students)
    .values({ code: 'HV-0001', fullName: 'Nguyễn Văn A' })
    .returning();
  const [enrollment] = await tx
    .insert(s.enrollments)
    .values({ studentId: student!.id, classId: klass!.id, startDate: '2026-01-01' })
    .returning();
  return {
    branch: branch!,
    admin: admin!,
    teacher: teacher!,
    outsider: outsider!,
    klass: klass!,
    student: student!,
    enrollment: enrollment!,
  };
}

async function createInvoice(d: Awaited<ReturnType<typeof seed>>, dueDate = '2999-12-31') {
  const [invoice] = await tx
    .insert(s.invoices)
    .values({
      code: 'HD-2601-0001',
      studentId: d.student.id,
      classId: d.klass.id,
      enrollmentId: d.enrollment.id,
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      dueDate,
      totalAmount: 1_000_000,
    })
    .returning();
  return invoice!;
}

async function pay(invoiceId: string, amount: number, no = 'PT-1') {
  const [payment] = await tx
    .insert(s.payments)
    .values({ invoiceId, amount, method: 'cash', paidOn: '2026-01-05', receiptNo: no })
    .returning();
  return payment!;
}

const getInvoice = async (id: string) =>
  (await tx.select().from(s.invoices).where(eq(s.invoices.id, id)))[0]!;

describe('invoices & payments', () => {
  it('derives status from payments: unpaid → partial → paid', async () => {
    const d = await seed();
    const invoice = await createInvoice(d);
    expect(invoice.status).toBe('unpaid');

    await pay(invoice.id, 400_000, 'PT-1');
    expect(await getInvoice(invoice.id)).toMatchObject({ paidAmount: 400_000, status: 'partial' });

    await pay(invoice.id, 600_000, 'PT-2');
    expect(await getInvoice(invoice.id)).toMatchObject({ paidAmount: 1_000_000, status: 'paid' });
  });

  it('marks an unpaid invoice past its due date as overdue', async () => {
    const d = await seed();
    const invoice = await createInvoice(d, '2020-01-10');
    expect(invoice.status).toBe('overdue');
  });

  it('rejects a payment larger than the outstanding amount', async () => {
    const d = await seed();
    const invoice = await createInvoice(d);
    await pay(invoice.id, 900_000);

    expect(await dbError(() => pay(invoice.id, 200_000, 'PT-2'))).toContain('lớn hơn số còn thiếu');
  });

  it('forbids editing or deleting a payment', async () => {
    const d = await seed();
    const invoice = await createInvoice(d);
    const payment = await pay(invoice.id, 500_000);

    expect(
      await dbError(() =>
        tx.update(s.payments).set({ amount: 1 }).where(eq(s.payments.id, payment.id)),
      ),
    ).toContain('Không được sửa thanh toán');
    expect(
      await dbError(() => tx.delete(s.payments).where(eq(s.payments.id, payment.id))),
    ).toContain('Không được xóa thanh toán');
  });

  it('voiding a payment restores the balance and writes an audit log', async () => {
    const d = await seed();
    const invoice = await createInvoice(d);
    const payment = await pay(invoice.id, 500_000);

    await tx
      .update(s.payments)
      .set({ voidedAt: new Date(), voidedBy: d.admin.id, voidReason: 'Nhập sai' })
      .where(eq(s.payments.id, payment.id));

    expect(await getInvoice(invoice.id)).toMatchObject({ paidAmount: 0, status: 'unpaid' });
    const logs = await tx.select().from(s.auditLogs).where(eq(s.auditLogs.entityId, payment.id));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: 'payment.void', actorId: d.admin.id });
  });

  it('rejects a payment on a cancelled invoice', async () => {
    const d = await seed();
    const invoice = await createInvoice(d);
    await tx
      .update(s.invoices)
      .set({ cancelledAt: new Date(), cancelReason: 'Trùng' })
      .where(eq(s.invoices.id, invoice.id));

    expect(await dbError(() => pay(invoice.id, 100_000))).toContain('đã hủy');
  });
});

describe('schedules', () => {
  it('only accepts a teacher assigned to the class', async () => {
    const d = await seed();
    const schedule = {
      classId: d.klass.id,
      weekday: 2,
      startTime: '18:00',
      durationMin: 90,
      validFrom: '2026-01-01',
    };

    await tx.insert(s.classSchedules).values({ ...schedule, teacherId: d.teacher.id });
    expect(
      await dbError(() =>
        tx.insert(s.classSchedules).values({ ...schedule, teacherId: d.outsider.id }),
      ),
    ).toContain('phải là giáo viên phụ trách lớp');
  });
});

describe('rooms stay within the class branch', () => {
  async function seedRooms() {
    const d = await seed();
    const [other] = await tx.insert(s.branches).values({ name: 'Cơ sở Q.7' }).returning();
    const [ownRoom, otherRoom] = await tx
      .insert(s.rooms)
      .values([
        { branchId: d.branch.id, name: 'P101' },
        { branchId: other!.id, name: 'P201' },
      ])
      .returning();
    return { ...d, other: other!, ownRoom: ownRoom!, otherRoom: otherRoom! };
  }

  const scheduleOf = (d: Awaited<ReturnType<typeof seed>>, roomId: string) => ({
    classId: d.klass.id,
    teacherId: d.teacher.id,
    roomId,
    weekday: 2,
    startTime: '18:00',
    durationMin: 90,
    validFrom: '2026-01-01',
  });
  const sessionOf = (d: Awaited<ReturnType<typeof seed>>, roomId: string) => ({
    classId: d.klass.id,
    teacherId: d.teacher.id,
    roomId,
    startsAt: new Date('2026-01-06T11:00:00Z'),
    durationMin: 90,
  });

  it('rejects a room from another branch on schedules and sessions', async () => {
    const d = await seedRooms();

    await tx.insert(s.classSchedules).values(scheduleOf(d, d.ownRoom.id));
    await tx.insert(s.sessions).values(sessionOf(d, d.ownRoom.id));
    expect(
      await dbError(() => tx.insert(s.classSchedules).values(scheduleOf(d, d.otherRoom.id))),
    ).toContain('cùng cơ sở với lớp');
    expect(
      await dbError(() => tx.insert(s.sessions).values(sessionOf(d, d.otherRoom.id))),
    ).toContain('cùng cơ sở với lớp');
  });

  it('blocks moving a class or a room to another branch while rooms are in use', async () => {
    const d = await seedRooms();
    await tx.insert(s.sessions).values(sessionOf(d, d.ownRoom.id));

    expect(
      await dbError(() =>
        tx.update(s.classes).set({ branchId: d.other.id }).where(eq(s.classes.id, d.klass.id)),
      ),
    ).toContain('Không thể đổi cơ sở');
    expect(
      await dbError(() =>
        tx.update(s.rooms).set({ branchId: d.other.id }).where(eq(s.rooms.id, d.ownRoom.id)),
      ),
    ).toContain('Không thể đổi cơ sở');
    // an unused room can still move
    await tx.update(s.rooms).set({ branchId: d.branch.id }).where(eq(s.rooms.id, d.otherRoom.id));
  });
});

describe('payroll & attendance lock', () => {
  // One attended 90-minute session in Jan 2026 at 200k/hour, plus a pending payroll period for that month
  async function seedPayroll() {
    const d = await seed();
    await tx.insert(s.teacherRates).values({
      teacherId: d.teacher.id,
      rateType: 'hour',
      rate: 200_000,
      effectiveFrom: '2026-01-01',
    });
    const [session] = await tx
      .insert(s.sessions)
      .values({
        classId: d.klass.id,
        teacherId: d.teacher.id,
        // 18:00 on 2026-01-06, Vietnam time
        startsAt: new Date('2026-01-06T11:00:00Z'),
        durationMin: 90,
        attendanceTakenAt: new Date('2026-01-06T12:30:00Z'),
      })
      .returning();
    const [record] = await tx
      .insert(s.attendanceRecords)
      .values({ sessionId: session!.id, enrollmentId: d.enrollment.id, studentId: d.student.id })
      .returning();
    const [period] = await tx.insert(s.payrollPeriods).values({ period: '2026-01-01' }).returning();
    return { ...d, record: record!, period: period! };
  }

  const markAbsent = (recordId: string) =>
    tx
      .update(s.attendanceRecords)
      .set({ status: 'absent', absenceExcused: true })
      .where(eq(s.attendanceRecords.id, recordId));

  it('approve_payroll snapshots the preview and locks attendance of the period', async () => {
    const d = await seedPayroll();

    const preview = await tx
      .select()
      .from(s.vPayrollPreview)
      .where(eq(s.vPayrollPreview.teacherId, d.teacher.id));
    expect(preview).toEqual([
      expect.objectContaining({
        period: '2026-01-01',
        sessionsCount: 1,
        hours: 1.5,
        amount: 300_000,
      }),
    ]);

    await tx.execute(sql`select core.approve_payroll(${d.period.id}, ${d.admin.id})`);

    const items = await tx.query.payrollItems.findMany({
      where: { periodId: d.period.id },
      with: { teacher: true },
    });
    expect(items).toEqual([
      expect.objectContaining({
        amount: 300_000,
        hours: 1.5,
        teacher: expect.objectContaining({ id: d.teacher.id }),
      }),
    ]);
    expect(await dbError(() => markAbsent(d.record.id))).toContain('kỳ lương đã duyệt');
  });

  it('reopen_payroll requires a reason, unlocks attendance and writes an audit log', async () => {
    const d = await seedPayroll();
    await tx.execute(sql`select core.approve_payroll(${d.period.id}, ${d.admin.id})`);

    expect(
      await dbError(() =>
        tx.execute(sql`select core.reopen_payroll(${d.period.id}, ${d.admin.id}, ${'  '})`),
      ),
    ).toContain('Phải ghi lý do');

    await tx.execute(
      sql`select core.reopen_payroll(${d.period.id}, ${d.admin.id}, ${'Sai đơn giá'})`,
    );

    const [period] = await tx
      .select()
      .from(s.payrollPeriods)
      .where(eq(s.payrollPeriods.id, d.period.id));
    expect(period).toMatchObject({ status: 'pending', approvedBy: null, approvedAt: null });
    await markAbsent(d.record.id);
    const logs = await tx
      .select()
      .from(s.auditLogs)
      .where(eq(s.auditLogs.entityId, d.period.id))
      .orderBy(s.auditLogs.id);
    expect(logs.map((l) => l.action)).toEqual(['payroll.approve', 'payroll.reopen']);
    expect(logs[1]!.oldValue).toMatchObject({ total: 300_000 });
  });

  it('reopen_payroll rejects a period that is not approved', async () => {
    const d = await seedPayroll();
    expect(
      await dbError(() =>
        tx.execute(sql`select core.reopen_payroll(${d.period.id}, ${d.admin.id}, ${'x'})`),
      ),
    ).toContain('chưa được duyệt');
  });
});

describe('monthly reports by branch', () => {
  type ReportRow = { revenue_recognized: string; collected: string; payroll_total: string };
  const report = async (branchId?: string) => {
    const res = await tx.execute<ReportRow>(
      branchId
        ? sql`select * from core.monthly_report('2026-01-01', ${branchId})`
        : sql`select * from core.monthly_report('2026-01-01')`,
    );
    const row = res.rows[0]!;
    // bigint columns come back from pg as strings
    return {
      revenue: Number(row.revenue_recognized),
      collected: Number(row.collected),
      payroll: Number(row.payroll_total),
    };
  };

  // Branch A: 1,000,000 invoice (400,000 paid), 90-minute session.
  // Branch B: 2,000,000 invoice (unpaid), 60-minute session. Same teacher at 200,000/hour.
  async function seedTwoBranches() {
    const d = await seed();
    const [branchB] = await tx.insert(s.branches).values({ name: 'Cơ sở Q.7' }).returning();
    const [classB] = await tx
      .insert(s.classes)
      .values({ branchId: branchB!.id, name: 'Anh 6B', feeAmount: 2_000_000 })
      .returning();
    const [enrollmentB] = await tx
      .insert(s.enrollments)
      .values({ studentId: d.student.id, classId: classB!.id, startDate: '2026-01-01' })
      .returning();
    await tx.insert(s.teacherRates).values({
      teacherId: d.teacher.id,
      rateType: 'hour',
      rate: 200_000,
      effectiveFrom: '2026-01-01',
    });
    const invoice = (code: string, classId: string, enrollmentId: string, totalAmount: number) => ({
      code,
      studentId: d.student.id,
      classId,
      enrollmentId,
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      dueDate: '2999-12-31',
      totalAmount,
    });
    const [invoiceA] = await tx
      .insert(s.invoices)
      .values([
        invoice('HD-2601-0001', d.klass.id, d.enrollment.id, 1_000_000),
        invoice('HD-2601-0002', classB!.id, enrollmentB!.id, 2_000_000),
      ])
      .returning();
    await pay(invoiceA!.id, 400_000);
    const session = (classId: string, durationMin: number) => ({
      classId,
      teacherId: d.teacher.id,
      startsAt: new Date('2026-01-06T11:00:00Z'),
      durationMin,
      attendanceTakenAt: new Date('2026-01-06T13:00:00Z'),
    });
    await tx.insert(s.sessions).values([session(d.klass.id, 90), session(classB!.id, 60)]);
    const [period] = await tx.insert(s.payrollPeriods).values({ period: '2026-01-01' }).returning();
    await tx.execute(sql`select core.approve_payroll(${period!.id}, ${d.admin.id})`);
    return { ...d, branchB: branchB!, period: period! };
  }

  it('splits revenue, collections and approved payroll by the class branch', async () => {
    const d = await seedTwoBranches();

    expect(await report()).toEqual({ revenue: 3_000_000, collected: 400_000, payroll: 500_000 });
    expect(await report(d.branch.id)).toEqual({
      revenue: 1_000_000,
      collected: 400_000,
      payroll: 300_000,
    });
    expect(await report(d.branchB.id)).toEqual({
      revenue: 2_000_000,
      collected: 0,
      payroll: 200_000,
    });

    const classes = await tx.execute<{ class_name: string }>(
      sql`select * from core.monthly_class_report('2026-01-01', ${d.branchB.id})`,
    );
    expect(classes.rows.map((r) => r.class_name)).toEqual(['Anh 6B']);
  });

  it('leaves a reopened payroll period out of payroll_total', async () => {
    const d = await seedTwoBranches();
    await tx.execute(sql`select core.reopen_payroll(${d.period.id}, ${d.admin.id}, ${'Sai giờ'})`);

    expect((await report()).payroll).toBe(0);
    expect((await report(d.branch.id)).payroll).toBe(0);
  });
});

describe('user login identifiers', () => {
  const student = (username: string | null) => ({
    username,
    fullName: 'Học viên',
    role: 'student' as const,
  });

  it('requires a username for students and accepts the student-code default', async () => {
    await tx.insert(s.users).values(student('hv-0001'));
    expect(await dbError(() => tx.insert(s.users).values(student(null)))).toContain(
      'users_username_required_chk',
    );
  });

  it('rejects usernames that are all digits, uppercase or malformed', async () => {
    for (const bad of ['0901234567', 'HV-0001', 'ab', 'tên có dấu']) {
      expect(await dbError(() => tx.insert(s.users).values(student(bad)))).toContain(
        'users_username_format_chk',
      );
    }
  });

  it('lets guardians log in by phone without a username', async () => {
    await tx.insert(s.users).values({ phone: '0901234567', fullName: 'Phụ huynh', role: 'parent' });
  });
});
