import { afterEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './helpers/app.js';
import { request } from './helpers/http.js';

describe('Authentication API', () => {
  let context: TestContext | undefined;
  afterEach(async () => {
    await context?.pool.end();
  });

  it('registers, authenticates, and returns the current user', async () => {
    context = await createTestContext();
    const registration = await request(context.app)
      .post('/api/v1/auth/register')
      .send({ email: '  PERSON@Example.com ', password: 'SecurePass123!', firstName: 'Ada', lastName: 'Lovelace' })
      .expect(201);

    expect(registration.body.user).toMatchObject({ email: 'person@example.com', role: 'customer', firstName: 'Ada' });
    expect(registration.body.user.passwordHash).toBeUndefined();
    expect(registration.body.accessToken).toEqual(expect.any(String));

    const me = await request(context.app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${registration.body.accessToken}`)
      .expect(200);
    expect(me.body.user.id).toBe(registration.body.user.id);

    const login = await request(context.app)
      .post('/api/v1/auth/login')
      .send({ email: 'person@example.com', password: 'SecurePass123!' })
      .expect(200);
    expect(login.body.user.email).toBe('person@example.com');
  });

  it('rejects invalid payloads, duplicate emails, bad credentials, and invalid tokens', async () => {
    context = await createTestContext();
    await request(context.app).post('/api/v1/auth/register').send({ email: 'nope', password: 'tiny' }).expect(400);

    const first = await request(context.app)
      .post('/api/v1/auth/register')
      .send({ email: 'taken@example.com', password: 'SecurePass123!' })
      .expect(201);
    expect(first.body.user.role).toBe('customer');

    const duplicate = await request(context.app)
      .post('/api/v1/auth/register')
      .send({ email: 'taken@example.com', password: 'SecurePass123!' })
      .expect(409);
    expect(duplicate.body.error.code).toBe('CONFLICT');

    await request(context.app)
      .post('/api/v1/auth/login')
      .send({ email: 'taken@example.com', password: 'incorrect' })
      .expect(401);
    await request(context.app).get('/api/v1/auth/me').expect(401);
    await request(context.app).get('/api/v1/auth/me').set('Authorization', 'Bearer invalid').expect(401);
  });
});
