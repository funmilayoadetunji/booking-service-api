import { readFileSync } from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import type { Pool } from 'pg';
import swaggerUi, { type JsonObject } from 'swagger-ui-express';
import YAML from 'yaml';
import type { AppConfig } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { BookingRepository } from './repositories/booking.repository.js';
import { ServiceRepository } from './repositories/service.repository.js';
import { UserRepository } from './repositories/user.repository.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createBookingRouter } from './routes/booking.routes.js';
import { createServiceRouter } from './routes/service.routes.js';
import { BookingService } from './services/booking.service.js';

function loadOpenApiDocument(): JsonObject {
  return YAML.parse(readFileSync(path.resolve(process.cwd(), 'openapi.yaml'), 'utf8')) as JsonObject;
}

export function createApp(database: Pick<Pool, 'query'>, config: AppConfig) {
  const app = express();
  const users = new UserRepository(database);
  const services = new ServiceRepository(database);
  const bookings = new BookingRepository(database);
  const bookingService = new BookingService(bookings, services);

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '64kb' }));

  app.get('/health', (_request, response) => response.json({ status: 'ok' }));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(loadOpenApiDocument(), { explorer: true }));
  app.get('/openapi.yaml', (_request, response) =>
    response.type('application/yaml').send(readFileSync(path.resolve(process.cwd(), 'openapi.yaml')))
  );

  const api = express.Router();
  api.use('/auth', createAuthRouter(users, config));
  api.use('/services', createServiceRouter(services, config));
  api.use('/bookings', createBookingRouter(bookings, bookingService, config));
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
