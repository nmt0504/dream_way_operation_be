import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db, pool } from '../../src/db';
import { users } from '../../src/db/schema';
import { PASSWORD, api, bearer, createUser, resetDb } from '../helpers/api';

beforeEach(resetDb);
afterAll(() => pool.end());

const login = (loginId: string, password = PASSWORD) =>
  api().post('/api/v1/auth/login').send({ login: loginId, password });

const refreshCookie = (res: { headers: Record<string, unknown> }) => {
  const cookies = res.headers['set-cookie'] as string[] | undefined;
  const cookie = cookies?.find((c) => c.startsWith('refresh_token='));
  if (!cookie) throw new Error('no refresh_token cookie');
  return cookie.split(';')[0]!;
};

describe('POST /auth/login', () => {
  it('logs in by phone and sets an httpOnly refresh cookie', async () => {
    const admin = await createUser({ role: 'admin' });
    const res = await login(admin.phone!);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ token_type: 'Bearer', expires_in: 900 });
    expect(typeof res.body.data.access_token).toBe('string');
    const cookie = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(cookie).toMatch(/refresh_token=.+HttpOnly/);
  });

  it('rejects a wrong password or unknown login with INVALID_CREDENTIALS', async () => {
    const admin = await createUser();
    for (const res of [await login(admin.phone!, 'wrong-pass'), await login('0999999999')]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    }
  });

  it('locks the account for 15 minutes after 5 wrong passwords (ACCOUNT_LOCKED)', async () => {
    const staff = await createUser({ role: 'staff' });
    for (let i = 0; i < 4; i++) expect((await login(staff.phone!, 'wrong-pass')).status).toBe(401);

    const fifth = await login(staff.phone!, 'wrong-pass');
    expect(fifth.status).toBe(423);
    expect(fifth.body.error.code).toBe('ACCOUNT_LOCKED');
    const until = new Date(fifth.body.error.locked_until).getTime();
    expect(until - Date.now()).toBeGreaterThan(14 * 60_000);

    // even the right password is refused while locked
    const correct = await login(staff.phone!);
    expect(correct.status).toBe(423);
    expect(correct.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('refuses parent and student accounts (ROLE_NOT_ALLOWED)', async () => {
    const parent = await createUser({ role: 'parent' });
    const student = await createUser({ role: 'student', username: 'hv-0001' });
    for (const res of [await login(parent.phone!), await login('HV-0001')]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ROLE_NOT_ALLOWED');
    }
    expect(student.username).toBe('hv-0001');
  });

  it('refuses a disabled account (ACCOUNT_INACTIVE)', async () => {
    const staff = await createUser({ role: 'staff', status: 'inactive' });
    const res = await login(staff.phone!);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('returns 400 VALIDATION_ERROR with the field name', async () => {
    const res = await api().post('/api/v1/auth/login').send({ login: '0900000000' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'password' });
  });
});

describe('forced password change', () => {
  it('blocks other endpoints with PASSWORD_CHANGE_REQUIRED until /auth/password is called', async () => {
    const admin = await createUser({ role: 'admin', mustChangePassword: true });
    const res = await login(admin.phone!);
    expect(res.body.data.must_change_password).toBe(true);
    const auth = bearer(res.body.data.access_token);

    const blocked = await api().get('/api/v1/users').set(auth);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

    // /me stays reachable so the app knows to show the change-password screen
    const me = await api().get('/api/v1/me').set(auth);
    expect(me.status).toBe(200);
    expect(me.body.data.must_change_password).toBe(true);

    const changed = await api()
      .post('/api/v1/auth/password')
      .set(auth)
      .send({ current_password: PASSWORD, new_password: 'NewPassword456' });
    expect(changed.status).toBe(204);

    expect((await api().get('/api/v1/users').set(auth)).status).toBe(200);
    expect((await login(admin.phone!, 'NewPassword456')).status).toBe(200);
  });

  it('rejects a wrong current password (INVALID_PASSWORD) or an unchanged one (PASSWORD_UNCHANGED)', async () => {
    const staff = await createUser({ role: 'staff' });
    const wrong = await api()
      .post('/api/v1/auth/password')
      .set(bearer(staff.token))
      .send({ current_password: 'nope-nope', new_password: 'NewPassword456' });
    expect(wrong.status).toBe(422);
    expect(wrong.body.error).toMatchObject({ code: 'INVALID_PASSWORD', field: 'current_password' });

    const same = await api()
      .post('/api/v1/auth/password')
      .set(bearer(staff.token))
      .send({ current_password: PASSWORD, new_password: PASSWORD });
    expect(same.status).toBe(422);
    expect(same.body.error.code).toBe('PASSWORD_UNCHANGED');
  });
});

describe('access token', () => {
  it('returns 401 UNAUTHENTICATED without or with a bad token', async () => {
    for (const res of [
      await api().get('/api/v1/me'),
      await api().get('/api/v1/me').set(bearer('not-a-jwt')),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('takes a disabled account out immediately, even with a valid token', async () => {
    const staff = await createUser({ role: 'staff' });
    await db.update(users).set({ status: 'inactive' }).where(eq(users.id, staff.id));
    const res = await api().get('/api/v1/me').set(bearer(staff.token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
  });
});

describe('POST /auth/refresh and /auth/logout', () => {
  it('rotates the refresh token: the old one cannot be used twice', async () => {
    const admin = await createUser();
    const first = refreshCookie(await login(admin.phone!));

    const refreshed = await api().post('/api/v1/auth/refresh').set('Cookie', first);
    expect(refreshed.status).toBe(200);
    expect(typeof refreshed.body.data.access_token).toBe('string');
    const second = refreshCookie(refreshed);
    expect(second).not.toBe(first);

    const reused = await api().post('/api/v1/auth/refresh').set('Cookie', first);
    expect(reused.status).toBe(401);
    expect(reused.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('logout revokes the refresh token', async () => {
    const admin = await createUser();
    const cookie = refreshCookie(await login(admin.phone!));

    expect((await api().post('/api/v1/auth/logout').set('Cookie', cookie)).status).toBe(204);
    expect((await api().post('/api/v1/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });

  it('refresh fails without a cookie', async () => {
    expect((await api().post('/api/v1/auth/refresh')).status).toBe(401);
  });
});
