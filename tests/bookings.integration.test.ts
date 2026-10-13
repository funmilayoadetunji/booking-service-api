import { afterEach, describe, expect, it } from 'vitest';
import {
  createAdmin,
  createService,
  createTestContext,
  createUser,
  futureIso,
  type TestContext
} from './helpers/app.js';
import { request } from './helpers/http.js';

describe('Bookings API', () => {
  let context: TestContext | undefined;
  afterEach(async () => {
    await context?.pool.end();
  });

  it('creates, reads, updates, lists, cancels, and deletes bookings with role and ownership checks', async () => {
    context = await createTestContext();
    const admin = await createAdmin(context);
    const service = await createService(context, admin.token, { durationMinutes: 30 });
    const customer = await createUser(context.app, { email: 'customer@example.com' });
    const otherCustomer = await createUser(context.app, { email: 'other@example.com' });

    await request(context.app)
      .post('/api/v1/bookings')
      .send({ serviceId: service.id, startsAt: futureIso() })
      .expect(401);

    const created = await request(context.app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ serviceId: service.id, startsAt: futureIso(72), notes: 'Window seat, please' })
      .expect(201);
    const booking = created.body.data;
    expect(new Date(booking.endsAt).getTime() - new Date(booking.startsAt).getTime()).toBe(30 * 60 * 1000);
    expect(booking.status).toBe('pending');

    const ownList = await request(context.app)
      .get('/api/v1/bookings?status=pending')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(ownList.body).toMatchObject({ meta: { total: 1 }, data: [{ id: booking.id, serviceName: 'Consultation' }] });

    const allList = await request(context.app)
      .get('/api/v1/bookings?page=1&limit=10')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);
    expect(allList.body.meta.total).toBe(1);

    await request(context.app)
      .get(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${otherCustomer.token}`)
      .expect(403);
    await request(context.app)
      .get(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);

    const amended = await request(context.app)
      .patch(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ startsAt: futureIso(120), notes: 'Updated notes' })
      .expect(200);
    expect(amended.body.data.notes).toBe('Updated notes');

    await request(context.app)
      .patch(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ status: 'confirmed' })
      .expect(403);

    await request(context.app)
      .patch(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'confirmed' })
      .expect(200);

    await request(context.app)
      .patch(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ notes: 'Cannot amend confirmed' })
      .expect(409);

    await request(context.app)
      .patch(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ status: 'cancelled' })
      .expect(200);

    await request(context.app)
      .delete(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(403);
    await request(context.app)
      .delete(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(204);
  });

  it('rejects conflicting, past, malformed, and unavailable-service bookings', async () => {
    context = await createTestContext();
    const admin = await createAdmin(context);
    const service = await createService(context, admin.token, { durationMinutes: 60 });
    const customer = await createUser(context.app);
    const timestamp = futureIso(100);

    await request(context.app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ serviceId: service.id, startsAt: timestamp })
      .expect(201);

    const conflict = await request(context.app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ serviceId: service.id, startsAt: futureIso(100.5) })
      .expect(409);
    expect(conflict.body.error.code).toBe('CONFLICT');

    await request(context.app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ serviceId: service.id, startsAt: new Date(Date.now() - 60_000).toISOString() })
      .expect(400);
    await request(context.app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ serviceId: 'not-a-uuid', startsAt: 'tomorrow' })
      .expect(400);
    await request(context.app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ serviceId: '00000000-0000-0000-0000-000000000000', startsAt: futureIso(200) })
      .expect(404);
  });
});
