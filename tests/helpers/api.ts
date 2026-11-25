import { sql } from 'drizzle-orm';
import request from 'supertest';

import { app } from '../../src/app';
import { db } from '../../src/db';
import { branches, rooms, userBranches, users } from '../../src/db/schema';
import { hashPassword } from '../../src/lib/password';
import { signAccessToken } from '../../src/lib/tokens';

export const api = () => request(app);
export const PASSWORD = 'Password123';

// Wipes everything the API tests touch; core.settings is a singleton, so it is reset instead.
export async function resetDb() {
  await db.execute(
    sql`TRUNCATE core.users, core.branches, core.teachers, core.audit_logs RESTART IDENTITY CASCADE`,
  );
  await db.execute(
    sql`UPDATE core.settings SET center_name = 'DreamWay', settings = '{}'::jsonb, updated_at = now()`,
  );
}

let phoneSeq = 0;
export const nextPhone = () => `09${String(++phoneSeq).padStart(8, '0')}`;

type UserOpts = {
  role?: 'admin' | 'staff' | 'teacher' | 'parent' | 'student';
  mustChangePassword?: boolean;
  branchIds?: string[];
  status?: 'active' | 'inactive';
  username?: string;
};

// Inserts an account directly; `token` is a valid access token for it.
export async function createUser(opts: UserOpts = {}) {
  const role = opts.role ?? 'admin';
  const phone = role === 'student' ? null : nextPhone();
  const [user] = await db
    .insert(users)
    .values({
      phone,
      username: opts.username ?? (role === 'student' ? `hv-${phoneSeq++}` : null),
      fullName: `Test ${role}`,
      role,
      status: opts.status ?? 'active',
      passwordHash: await hashPassword(PASSWORD),
      mustChangePassword: opts.mustChangePassword ?? false,
    })
    .returning();
  if (!user) throw new Error('user not created');
  if (opts.branchIds?.length) {
    await db
      .insert(userBranches)
      .values(opts.branchIds.map((branchId) => ({ userId: user.id, branchId })));
  }
  return { ...user, token: await signAccessToken(user.id) };
}

export async function createBranch(name: string) {
  const [branch] = await db.insert(branches).values({ name }).returning();
  if (!branch) throw new Error('branch not created');
  return branch;
}

export async function createRoom(branchId: string, name: string) {
  const [room] = await db.insert(rooms).values({ branchId, name }).returning();
  if (!room) throw new Error('room not created');
  return room;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
