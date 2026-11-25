import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../../src/db';
import { api, bearer, createBranch, createRoom, createUser, resetDb } from '../helpers/api';

beforeEach(resetDb);
afterAll(() => pool.end());

const ids = (body: { data: { id: string }[] }) => body.data.map((x) => x.id);

describe('phase 0 walkthrough', () => {
  it('admin creates 2 branches, a room in each, and a staff account assigned to one branch', async () => {
    const admin = await createUser();
    const auth = bearer(admin.token);

    const q3 = await api()
      .post('/api/v1/branches')
      .set(auth)
      .send({ name: 'Cơ sở Q.3', address: '12 Lê Văn Sỹ' });
    const q7 = await api().post('/api/v1/branches').set(auth).send({ name: 'Cơ sở Q.7' });
    expect([q3.status, q7.status]).toEqual([201, 201]);

    const r1 = await api()
      .post('/api/v1/rooms')
      .set(auth)
      .send({ branch_id: q3.body.data.id, name: 'P.101', capacity: 20 });
    const r2 = await api()
      .post('/api/v1/rooms')
      .set(auth)
      .send({ branch_id: q7.body.data.id, name: 'P.101' });
    expect([r1.status, r2.status]).toEqual([201, 201]);
    expect(r1.body.data).toMatchObject({ branch_id: q3.body.data.id, name: 'P.101', capacity: 20 });

    const staff = await api()
      .post('/api/v1/users')
      .set(auth)
      .send({ full_name: 'Chị Hoa', phone: '0911111111', role: 'staff', password: 'TempPass123' });
    const assign = await api()
      .put(`/api/v1/users/${staff.body.data.id}/branches`)
      .set(auth)
      .send({ branch_ids: [q3.body.data.id] });
    expect(assign.status).toBe(200);

    const rooms = await api().get('/api/v1/rooms').set(auth);
    expect(rooms.body.meta.total).toBe(2);
  });
});

describe('branch scope (step 2)', () => {
  it('staff only sees assigned branches and their rooms', async () => {
    const [q3, q7] = [await createBranch('Cơ sở Q.3'), await createBranch('Cơ sở Q.7')];
    const [r3] = [await createRoom(q3.id, 'P.101'), await createRoom(q7.id, 'P.201')];
    const staff = await createUser({ role: 'staff', branchIds: [q3.id] });
    const admin = await createUser();

    const branches = await api().get('/api/v1/branches').set(bearer(staff.token));
    expect(ids(branches.body)).toEqual([q3.id]);
    expect(branches.body.meta.total).toBe(1);

    const rooms = await api().get('/api/v1/rooms').set(bearer(staff.token));
    expect(ids(rooms.body)).toEqual([r3!.id]);

    const all = await api().get('/api/v1/branches').set(bearer(admin.token));
    expect(all.body.meta.total).toBe(2);
  });

  it('staff passing an unassigned branch_id gets 403 BRANCH_NOT_ASSIGNED', async () => {
    const [q3, q7] = [await createBranch('Cơ sở Q.3'), await createBranch('Cơ sở Q.7')];
    const staff = await createUser({ role: 'staff', branchIds: [q3.id] });

    const res = await api().get(`/api/v1/rooms?branch_id=${q7.id}`).set(bearer(staff.token));
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: 'BRANCH_NOT_ASSIGNED', field: 'branch_id' });

    expect(
      (await api().get(`/api/v1/rooms?branch_id=${q3.id}`).set(bearer(staff.token))).status,
    ).toBe(200);
  });

  it('a teacher with no branch sees nothing', async () => {
    await createBranch('Cơ sở Q.3');
    const teacher = await createUser({ role: 'teacher' });
    const res = await api().get('/api/v1/branches').set(bearer(teacher.token));
    expect(res.body).toEqual({ data: [], meta: { page: 1, page_size: 20, total: 0 } });
  });
});

describe('branches and rooms writes', () => {
  it('PATCH /branches/:id updates; unknown id -> 404 BRANCH_NOT_FOUND', async () => {
    const admin = await createUser();
    const q3 = await createBranch('Cơ sở Q.3');
    const ok = await api()
      .patch(`/api/v1/branches/${q3.id}`)
      .set(bearer(admin.token))
      .send({ address: '1 Nguyễn Huệ' });
    expect(ok.body.data).toMatchObject({ name: 'Cơ sở Q.3', address: '1 Nguyễn Huệ' });

    const missing = await api()
      .patch(`/api/v1/branches/${crypto.randomUUID()}`)
      .set(bearer(admin.token))
      .send({ name: 'X' });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('BRANCH_NOT_FOUND');
  });

  it('room names are unique per branch (409 ROOM_NAME_TAKEN)', async () => {
    const admin = await createUser();
    const q3 = await createBranch('Cơ sở Q.3');
    await createRoom(q3.id, 'P.101');
    const res = await api()
      .post('/api/v1/rooms')
      .set(bearer(admin.token))
      .send({ branch_id: q3.id, name: 'P.101' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'ROOM_NAME_TAKEN', field: 'name' });
  });

  it('room in an unknown branch -> 422 BRANCH_NOT_FOUND; unknown room -> 404 ROOM_NOT_FOUND', async () => {
    const admin = await createUser();
    const res = await api()
      .post('/api/v1/rooms')
      .set(bearer(admin.token))
      .send({ branch_id: crypto.randomUUID(), name: 'P.1' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'BRANCH_NOT_FOUND', field: 'branch_id' });

    const missing = await api()
      .patch(`/api/v1/rooms/${crypto.randomUUID()}`)
      .set(bearer(admin.token))
      .send({ name: 'X' });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('ROOM_NOT_FOUND');
  });

  it('staff cannot create rooms (403 FORBIDDEN)', async () => {
    const q3 = await createBranch('Cơ sở Q.3');
    const staff = await createUser({ role: 'staff', branchIds: [q3.id] });
    const res = await api()
      .post('/api/v1/rooms')
      .set(bearer(staff.token))
      .send({ branch_id: q3.id, name: 'P.1' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
