import { describe, expect, it } from 'vitest';
import { getConfig } from '../src/config/env.js';
import { createTestContext } from './helpers/app.js';
import { request } from './helpers/http.js';

describe('Application configuration and HTTP surface', () => {
  it('uses safe defaults and rejects the development secret in production', () => {
    const defaults = getConfig({});
    expect(defaults.port).toBe(3000);
    expect(defaults.jwtExpiresIn).toBe('1h');
    expect(() => getConfig({ NODE_ENV: 'production' })).toThrow('JWT_SECRET must be explicitly configured');
  });

  it('provides health and OpenAPI endpoints and a structured route-not-found response', async () => {
    const context = await createTestContext();
    try {
      await request(context.app).get('/health').expect(200, { status: 'ok' });
      const spec = await request(context.app).get('/openapi.yaml').expect(200);
      expect(spec.text).toContain('Booking Service API');
      const docs = await request(context.app).get('/docs').expect(301);
      expect(docs.headers.location).toBe('/docs/');
      const missing = await request(context.app).get('/not-real').expect(404);
      expect(missing.body.error.code).toBe('ROUTE_NOT_FOUND');
    } finally {
      await context.pool.end();
    }
  });
});
