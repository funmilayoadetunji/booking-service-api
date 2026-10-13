import path from 'node:path';
import type { Express } from 'express';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import { createApp } from '../../src/app.js';
import type { AppConfig } from '../../src/config/env.js';
import { runMigrations } from '../../src/db/migrate.js';
import { request } from './http.js';

export const testConfig: AppConfig = {
  nodeEnv: 'test',
  port: 3001,
  databaseUrl: 'postgresql://test:test@localhost:5432/booking_test',
  jwtSecret: 'test-secret-that-is-long-enough-for-jwt-signing',
  jwtExpiresIn: '1h',
  corsOrigin: 'http://localhost:3000'
};

export type TestContext = { app: Express; pool: Pool };

export async function createTestContext(): Promise<TestContext> {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = db.adapters.createPg();
  const pool = new adapter.Pool() as unknown as Pool;
  await runMigrations(pool, path.resolve(process.cwd(), 'src/db/migrations'));
  return { app: createApp(pool, testConfig), pool };
}

export async function createUser(app: Express, overrides: Partial<{ email: string; password: string }> = {}) {
  const credentials = {
    email: overrides.email ?? `user-${crypto.randomUUID()}@example.com`,
    password: overrides.password ?? 'SecurePass123!'
  };
  const response = await request(app).post('/api/v1/auth/register').send(credentials).expect(201);
  return { ...credentials, token: response.body.accessToken, user: response.body.user };
}

export async function createAdmin(context: TestContext) {
  const account = await createUser(context.app, { email: `admin-${crypto.randomUUID()}@example.com` });
  await context.pool.query('UPDATE users SET role = $1 WHERE id = $2', ['admin', account.user.id]);
  const login = await request(context.app)
    .post('/api/v1/auth/login')
    .send({ email: account.email, password: account.password })
    .expect(200);
  return { ...account, token: login.body.accessToken, user: login.body.user };
}

export async function createService(context: TestContext, adminToken: string, overrides: Record<string, unknown> = {}) {
  const response = await request(context.app)
    .post('/api/v1/services')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Consultation', durationMinutes: 30, priceCents: 5000, ...overrides })
    .expect(201);
  return response.body.data;
}

export function futureIso(hours = 72): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}
