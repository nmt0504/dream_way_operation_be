import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { app } from '../src/app';

describe('GET /api/v1/health', () => {
  it('returns status ok', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
    expect(typeof res.body.uptime).toBe('number');
  });
});

describe('unknown route', () => {
  it('returns 404 in the standard error format', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({
      code: 'NOT_FOUND',
      message: 'Không tìm thấy đường dẫn GET /api/v1/does-not-exist',
    });
  });
});
