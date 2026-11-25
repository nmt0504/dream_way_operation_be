import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db, pool } from '../../src/db';
import { classTeachers, classes, teachers } from '../../src/db/schema';
import { api, bearer, createBranch, createUser, resetDb } from '../helpers/api';

beforeEach(resetDb);
afterAll(() => pool.end());

describe('GET /me', () => {
  it('teacher: assigned branches, teacher_id, classes and permission codes', async () => {
    const q3 = await createBranch('Cơ sở Q.3');
    await createBranch('Cơ sở Q.7');
    const user = await createUser({ role: 'teacher', branchIds: [q3.id] });
    const [teacher] = await db
      .insert(teachers)
      .values({ fullName: 'Cô Lan', honorific: 'co', userId: user.id })
      .returning();
    const [klass] = await db
      .insert(classes)
      .values({ branchId: q3.id, name: 'Toán 9A', feeAmount: 1_000_000 })
      .returning();
    await db.insert(classTeachers).values({ classId: klass!.id, teacherId: teacher!.id });

    const res = await api().get('/api/v1/me').set(bearer(user.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: user.id,
      role: 'teacher',
      teacher_id: teacher!.id,
      branches: [{ id: q3.id, name: 'Cơ sở Q.3' }],
      classes: [{ id: klass!.id, name: 'Toán 9A', status: 'open' }],
      permissions: ['branches.read', 'rooms.read'],
    });
  });

  it('admin sees every branch and has no teacher_id', async () => {
    await createBranch('Cơ sở Q.3');
    await createBranch('Cơ sở Q.7');
    const admin = await createUser();
    const res = await api().get('/api/v1/me').set(bearer(admin.token));
    expect(res.body.data.branches).toHaveLength(2);
    expect(res.body.data.teacher_id).toBeNull();
    expect(res.body.data.permissions).toContain('users.manage');
  });
});

describe('GET /roles', () => {
  it('lists the three roles with their permission codes', async () => {
    const admin = await createUser();
    const res = await api().get('/api/v1/roles').set(bearer(admin.token));
    expect(res.body.data.map((r: { code: string }) => r.code)).toEqual([
      'admin',
      'staff',
      'teacher',
    ]);
  });
});

describe('/settings', () => {
  it('reads and patches center settings, keeping untouched keys', async () => {
    const admin = await createUser();
    const auth = bearer(admin.token);

    const initial = await api().get('/api/v1/settings').set(auth);
    expect(initial.body.data).toMatchObject({
      center_name: 'DreamWay',
      logo_url: null,
      address: null,
      revenue_target: null,
    });

    await api().patch('/api/v1/settings').set(auth).send({ revenue_target: 300_000_000 });
    const res = await api()
      .patch('/api/v1/settings')
      .set(auth)
      .send({ center_name: 'DreamWay English', logo_url: 'https://cdn.example.com/logo.png' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      center_name: 'DreamWay English',
      logo_url: 'https://cdn.example.com/logo.png',
      revenue_target: 300_000_000,
    });
  });

  it('rejects an empty patch and a bad logo url', async () => {
    const admin = await createUser();
    const empty = await api().patch('/api/v1/settings').set(bearer(admin.token)).send({});
    expect(empty.status).toBe(400);
    const bad = await api()
      .patch('/api/v1/settings')
      .set(bearer(admin.token))
      .send({ logo_url: 'nope' });
    expect(bad.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'logo_url' });
  });
});
