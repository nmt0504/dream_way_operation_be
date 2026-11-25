import { and, asc, count, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import type { z } from 'zod';

import { db } from '../../db';
import { branches, teachers, userBranches, users } from '../../db/schema';
import { type Tx, withActor } from '../../db/tx';
import { AppError, notFoundError } from '../../lib/app-error';
import { type Pagination, offsetOf, paged } from '../../lib/pagination';
import { hashPassword } from '../../lib/password';
import { OPERATION_ROLES } from '../../lib/permissions';
import { revokeAllRefreshTokens } from '../auth/auth.service';
import type { createUserBody, updateUserBody } from './users.schemas';

// Only operation-app accounts are managed here; parent/student accounts are treated as not found
const isOperationAccount = inArray(users.role, [...OPERATION_ROLES]);

const userColumns = {
  id: users.id,
  fullName: users.fullName,
  phone: users.phone,
  username: users.username,
  role: users.role,
  status: users.status,
  mustChangePassword: users.mustChangePassword,
  lockedUntil: users.lockedUntil,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
  teacherId: teachers.id,
};

const selectUsers = (tx: Tx | typeof db) =>
  tx.select(userColumns).from(users).leftJoin(teachers, eq(teachers.userId, users.id));

type UserRow = Awaited<ReturnType<typeof selectUsers>>[number];

const toDto = (u: UserRow) => ({
  id: u.id,
  full_name: u.fullName,
  phone: u.phone,
  username: u.username,
  role: u.role,
  status: u.status,
  must_change_password: u.mustChangePassword,
  locked_until: u.lockedUntil,
  last_login_at: u.lastLoginAt,
  created_at: u.createdAt,
  teacher_id: u.teacherId,
});

const userNotFound = () => notFoundError('USER_NOT_FOUND', 'Không tìm thấy tài khoản');

const teacherRoleRequired = () =>
  new AppError(
    422,
    'TEACHER_ROLE_REQUIRED',
    'Chỉ tài khoản vai trò Giáo viên mới gắn được hồ sơ giáo viên',
    'teacher_id',
  );

async function getUser(tx: Tx | typeof db, id: string) {
  const [row] = await selectUsers(tx).where(and(eq(users.id, id), isOperationAccount));
  if (!row) throw userNotFound();
  return row;
}

// One teacher profile <-> at most one account (teachers.user_id is unique)
async function linkTeacher(tx: Tx, userId: string, teacherId: string) {
  await tx
    .update(teachers)
    .set({ userId: null })
    .where(and(eq(teachers.userId, userId), ne(teachers.id, teacherId)));
  const [linked] = await tx
    .update(teachers)
    .set({ userId })
    .where(
      and(eq(teachers.id, teacherId), or(isNull(teachers.userId), eq(teachers.userId, userId))),
    )
    .returning({ id: teachers.id });
  if (linked) return;

  const [exists] = await tx
    .select({ id: teachers.id })
    .from(teachers)
    .where(eq(teachers.id, teacherId));
  if (exists) {
    throw new AppError(409, 'TEACHER_HAS_ACCOUNT', 'Giáo viên này đã có tài khoản', 'teacher_id');
  }
  throw new AppError(422, 'TEACHER_NOT_FOUND', 'Không tìm thấy giáo viên', 'teacher_id');
}

const unlinkTeacher = (tx: Tx, userId: string) =>
  tx.update(teachers).set({ userId: null }).where(eq(teachers.userId, userId));

export async function listUsers(p: Pagination) {
  const [rows, [total]] = await Promise.all([
    selectUsers(db)
      .where(isOperationAccount)
      .orderBy(desc(users.createdAt), asc(users.id))
      .limit(p.page_size)
      .offset(offsetOf(p)),
    db.select({ value: count() }).from(users).where(isOperationAccount),
  ]);
  return paged(rows.map(toDto), total?.value ?? 0, p);
}

export async function createUser(actorId: string, body: z.infer<typeof createUserBody>) {
  if (body.teacher_id && body.role !== 'teacher') throw teacherRoleRequired();
  const passwordHash = await hashPassword(body.password);

  return withActor(actorId, async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({ fullName: body.full_name, phone: body.phone, role: body.role, passwordHash })
      .returning({ id: users.id });
    if (!created) throw new Error('insert returned no row');
    if (body.teacher_id) await linkTeacher(tx, created.id, body.teacher_id);
    return toDto(await getUser(tx, created.id));
  });
}

export async function updateUser(
  actorId: string,
  id: string,
  body: z.infer<typeof updateUserBody>,
) {
  return withActor(actorId, async (tx) => {
    const current = await getUser(tx, id);
    const role = body.role ?? current.role;
    if (body.teacher_id && role !== 'teacher') throw teacherRoleRequired();

    if (body.full_name !== undefined || body.role !== undefined || body.status !== undefined) {
      await tx
        .update(users)
        .set({ fullName: body.full_name, role: body.role, status: body.status })
        .where(eq(users.id, id));
    }

    if (role !== 'teacher' || body.teacher_id === null) await unlinkTeacher(tx, id);
    else if (body.teacher_id) await linkTeacher(tx, id, body.teacher_id);

    if (body.status === 'inactive') await revokeAllRefreshTokens(id, tx);
    return toDto(await getUser(tx, id));
  });
}

const branchesOf = (tx: Tx | typeof db, userId: string) =>
  tx
    .select({ id: branches.id, name: branches.name, address: branches.address })
    .from(userBranches)
    .innerJoin(branches, eq(branches.id, userBranches.branchId))
    .where(eq(userBranches.userId, userId))
    .orderBy(asc(branches.name));

export async function getUserBranches(id: string) {
  await getUser(db, id);
  return branchesOf(db, id);
}

// Replaces the assignment; only the difference is written so the audit log shows real changes
export async function setUserBranches(actorId: string, id: string, branchIds: string[]) {
  const wanted = new Set(branchIds);
  return withActor(actorId, async (tx) => {
    await getUser(tx, id);
    const current = await tx
      .select({ branchId: userBranches.branchId })
      .from(userBranches)
      .where(eq(userBranches.userId, id));
    const currentIds = new Set(current.map((r) => r.branchId));

    const toRemove = [...currentIds].filter((b) => !wanted.has(b));
    const toAdd = [...wanted].filter((b) => !currentIds.has(b));
    if (toRemove.length) {
      await tx
        .delete(userBranches)
        .where(and(eq(userBranches.userId, id), inArray(userBranches.branchId, toRemove)));
    }
    if (toAdd.length) {
      await tx.insert(userBranches).values(toAdd.map((branchId) => ({ userId: id, branchId })));
    }
    return branchesOf(tx, id);
  });
}

export async function resetPassword(actorId: string, id: string, password: string) {
  const passwordHash = await hashPassword(password);
  await withActor(actorId, async (tx) => {
    await getUser(tx, id);
    await tx
      .update(users)
      .set({ passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null })
      .where(eq(users.id, id));
    await revokeAllRefreshTokens(id, tx);
  });
}
