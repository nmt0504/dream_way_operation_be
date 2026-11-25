import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db, pool } from '../../src/db';
import { auditLogs, teachers } from '../../src/db/schema';
import {
  PASSWORD,
  api,
  bearer,
  createBranch,
  createUser,
  nextPhone,
  resetDb,
} from '../helpers/api';

beforeEach(resetDb);
afterAll(() => pool.end());

const auditOf = (entityId: string) =>
  db.select().from(auditLogs).where(eq(auditLogs.entityId, entityId)).orderBy(asc(auditLogs.id));

async function createTeacherProfile(name = 'Cô Lan') {
  const [t] = await db.insert(teachers).values({ fullName: name, honorific: 'co' }).returning();
  return t!;
}

describe('role permission (step 1)', () => {
  it('staff and teacher get 403 FORBIDDEN on admin-only endpoints', async () => {
    const staff = await createUser({ role: 'staff' });
    const teacher = await createUser({ role: 'teacher' });
    for (const u of [staff, teacher]) {
      for (const req of [
        api().get('/api/v1/users'),
        api().get('/api/v1/roles'),
        api().get('/api/v1/settings'),
        api().post('/api/v1/branches').send({ name: 'X' }),
      ]) {
        const res = await req.set(bearer(u.token));
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
    }
  });
});

describe('POST /users', () => {
  it('creates an account with a temporary password that must be changed', async () => {
    const admin = await createUser();
    const phone = nextPhone();
    const res = await api()
      .post('/api/v1/users')
      .set(bearer(admin.token))
      .send({ full_name: 'Chị Hoa', phone, role: 'staff', password: 'TempPass123' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      full_name: 'Chị Hoa',
      phone,
      role: 'staff',
      status: 'active',
      must_change_password: true,
      teacher_id: null,
    });
    expect(res.body.data).not.toHaveProperty('password_hash');

    const login = await api()
      .post('/api/v1/auth/login')
      .send({ login: phone, password: 'TempPass123' });
    expect(login.body.data.must_change_password).toBe(true);
  });

  it('returns 409 PHONE_TAKEN on a duplicate phone', async () => {
    const admin = await createUser();
    const res = await api()
      .post('/api/v1/users')
      .set(bearer(admin.token))
      .send({ full_name: 'Trùng', phone: admin.phone, role: 'staff', password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'PHONE_TAKEN', field: 'phone' });
  });

  it('rejects roles outside the operations app', async () => {
    const admin = await createUser();
    const res = await api()
      .post('/api/v1/users')
      .set(bearer(admin.token))
      .send({ full_name: 'PH', phone: nextPhone(), role: 'parent', password: PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'role' });
  });

  it('links a teacher profile; a second account for it gets 409 TEACHER_HAS_ACCOUNT', async () => {
    const admin = await createUser();
    const profile = await createTeacherProfile();
    const create = (phone: string) =>
      api().post('/api/v1/users').set(bearer(admin.token)).send({
        full_name: 'Cô Lan',
        phone,
        role: 'teacher',
        password: PASSWORD,
        teacher_id: profile.id,
      });

    const first = await create(nextPhone());
    expect(first.status).toBe(201);
    expect(first.body.data.teacher_id).toBe(profile.id);

    const second = await create(nextPhone());
    expect(second.status).toBe(409);
    expect(second.body.error).toMatchObject({ code: 'TEACHER_HAS_ACCOUNT', field: 'teacher_id' });
  });

  it('rejects teacher_id for a non-teacher role (TEACHER_ROLE_REQUIRED) and unknown ids (TEACHER_NOT_FOUND)', async () => {
    const admin = await createUser();
    const profile = await createTeacherProfile();
    const base = { full_name: 'A', password: PASSWORD };

    const wrongRole = await api()
      .post('/api/v1/users')
      .set(bearer(admin.token))
      .send({ ...base, phone: nextPhone(), role: 'staff', teacher_id: profile.id });
    expect(wrongRole.status).toBe(422);
    expect(wrongRole.body.error.code).toBe('TEACHER_ROLE_REQUIRED');

    const unknown = await api()
      .post('/api/v1/users')
      .set(bearer(admin.token))
      .send({ ...base, phone: nextPhone(), role: 'teacher', teacher_id: crypto.randomUUID() });
    expect(unknown.status).toBe(422);
    expect(unknown.body.error.code).toBe('TEACHER_NOT_FOUND');
  });
});

describe('Idempotency-Key', () => {
  it('replays the first response and does not create a second record', async () => {
    const admin = await createUser();
    const body = { full_name: 'Idem', phone: nextPhone(), role: 'staff', password: PASSWORD };
    const send = (b: object) =>
      api().post('/api/v1/users').set(bearer(admin.token)).set('Idempotency-Key', 'key-1').send(b);

    const first = await send(body);
    const replay = await send(body);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);

    const list = await api().get('/api/v1/users').set(bearer(admin.token));
    expect(list.body.meta.total).toBe(2);

    const otherBody = await send({ ...body, full_name: 'Khác' });
    expect(otherBody.status).toBe(422);
    expect(otherBody.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });
});

describe('GET /users', () => {
  it('paginates and hides parent/student accounts', async () => {
    const admin = await createUser();
    await createUser({ role: 'staff' });
    await createUser({ role: 'teacher' });
    await createUser({ role: 'parent' });

    const res = await api().get('/api/v1/users?page=1&page_size=2').set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, page_size: 2, total: 3 });
    expect(res.body.data).toHaveLength(2);

    const tooBig = await api().get('/api/v1/users?page_size=101').set(bearer(admin.token));
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.error.field).toBe('page_size');
  });
});

describe('PATCH /users/:id + audit log', () => {
  it('changing the role writes one audit row with the acting admin', async () => {
    const admin = await createUser();
    const staff = await createUser({ role: 'staff' });

    const res = await api()
      .patch(`/api/v1/users/${staff.id}`)
      .set(bearer(admin.token))
      .send({ role: 'teacher' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('teacher');

    const logs = await auditOf(staff.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actorId: admin.id,
      action: 'user.role_change',
      oldValue: { role: 'staff' },
      newValue: { role: 'teacher' },
    });
  });

  it('locking an account logs it and revokes its sessions', async () => {
    const admin = await createUser();
    const staff = await createUser({ role: 'staff' });
    const login = await api()
      .post('/api/v1/auth/login')
      .send({ login: staff.phone, password: PASSWORD });
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;

    await api()
      .patch(`/api/v1/users/${staff.id}`)
      .set(bearer(admin.token))
      .send({ status: 'inactive' });

    expect((await auditOf(staff.id)).map((l) => l.action)).toEqual(['user.status_change']);
    expect((await api().post('/api/v1/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });

  it('changing the role away from teacher unlinks the teacher profile', async () => {
    const admin = await createUser();
    const teacher = await createUser({ role: 'teacher' });
    const profile = await createTeacherProfile();
    await db.update(teachers).set({ userId: teacher.id }).where(eq(teachers.id, profile.id));

    const res = await api()
      .patch(`/api/v1/users/${teacher.id}`)
      .set(bearer(admin.token))
      .send({ role: 'staff' });
    expect(res.body.data.teacher_id).toBeNull();
  });

  it('returns 404 USER_NOT_FOUND for unknown ids and 400 for a non-uuid', async () => {
    const admin = await createUser();
    const unknown = await api()
      .patch(`/api/v1/users/${crypto.randomUUID()}`)
      .set(bearer(admin.token))
      .send({ full_name: 'X' });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('USER_NOT_FOUND');

    const bad = await api()
      .patch('/api/v1/users/abc')
      .set(bearer(admin.token))
      .send({ full_name: 'X' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.field).toBe('id');
  });
});

describe('POST /users/:id/reset-password', () => {
  it('sets a temporary password, forces a change, clears the lock and logs it', async () => {
    const admin = await createUser();
    const staff = await createUser({ role: 'staff' });

    const res = await api()
      .post(`/api/v1/users/${staff.id}/reset-password`)
      .set(bearer(admin.token))
      .send({ password: 'TempPass999' });
    expect(res.status).toBe(204);

    const login = await api()
      .post('/api/v1/auth/login')
      .send({ login: staff.phone, password: 'TempPass999' });
    expect(login.body.data.must_change_password).toBe(true);

    const logs = await auditOf(staff.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ actorId: admin.id, action: 'user.password_reset' });
  });
});

describe('PUT /users/:id/branches', () => {
  it('assigns branches, logs only the differences', async () => {
    const admin = await createUser();
    const staff = await createUser({ role: 'staff' });
    const [q3, q7] = [await createBranch('Cơ sở Q.3'), await createBranch('Cơ sở Q.7')];
    const put = (ids: string[]) =>
      api()
        .put(`/api/v1/users/${staff.id}/branches`)
        .set(bearer(admin.token))
        .send({ branch_ids: ids });

    const first = await put([q3.id]);
    expect(first.status).toBe(200);
    expect(first.body.data.map((b: { id: string }) => b.id)).toEqual([q3.id]);

    await put([q7.id]);
    const get = await api().get(`/api/v1/users/${staff.id}/branches`).set(bearer(admin.token));
    expect(get.body.data).toEqual([{ id: q7.id, name: 'Cơ sở Q.7', address: null }]);

    expect((await auditOf(staff.id)).map((l) => l.action)).toEqual([
      'user.branch_add',
      'user.branch_remove',
      'user.branch_add',
    ]);
  });

  it('returns 422 BRANCH_NOT_FOUND for an unknown branch', async () => {
    const admin = await createUser();
    const staff = await createUser({ role: 'staff' });
    const res = await api()
      .put(`/api/v1/users/${staff.id}/branches`)
      .set(bearer(admin.token))
      .send({ branch_ids: [crypto.randomUUID()] });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'BRANCH_NOT_FOUND', field: 'branch_ids' });
  });
});
