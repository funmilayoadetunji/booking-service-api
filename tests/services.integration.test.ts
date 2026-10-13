import { afterEach, describe, expect, it } from 'vitest';
import { createAdmin, createService, createTestContext, createUser, type TestContext } from './helpers/app.js';
import { request } from './helpers/http.js';

describe('Services API', () => {
  let context: TestContext | undefined;
  afterEach(async () => {
    await context?.pool.end();
  });

  it('enforces admin role and supports the complete service lifecycle', async () => {
    context = await createTestContext();
    const customer = await createUser(context.app);
    await request(context.app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ name: 'Massage', durationMinutes: 60, priceCents: 8000 })
      .expect(403);

    const admin = await createAdmin(context);
    const created = await createService(context, admin.token, {
      name: 'Deep tissue massage',
      description: 'A focused session',
      durationMinutes: 60,
      priceCents: 8000
    });
    expect(created.name).toBe('Deep tissue massage');

    const list = await request(context.app).get('/api/v1/services?page=1&limit=1').expect(200);
    expect(list.body).toMatchObject({ meta: { page: 1, limit: 1, total: 1, totalPages: 1 } });
    expect(list.body.data[0].id).toBe(created.id);

    const fetched = await request(context.app).get(`/api/v1/services/${created.id}`).expect(200);
    expect(fetched.body.data.priceCents).toBe(8000);

    const updated = await request(context.app)
      .patch(`/api/v1/services/${created.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ priceCents: 9000, active: true })
      .expect(200);
    expect(updated.body.data.priceCents).toBe(9000);

    await request(context.app)
      .delete(`/api/v1/services/${created.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(204);
    await request(context.app).get(`/api/v1/services/${created.id}`).expect(404);
  });

  it('validates pagination and resource payloads', async () => {
    context = await createTestContext();
    const admin = await createAdmin(context);
    await request(context.app).get('/api/v1/services?page=0').expect(400);
    await request(context.app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'X', durationMinutes: 1, priceCents: -1 })
      .expect(400);
    await request(context.app)
      .patch('/api/v1/services/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({})
      .expect(400);
  });
});
