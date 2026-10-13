import { Router } from 'express';
import { z } from 'zod';
import type { AppConfig } from '../config/env.js';
import { errors } from '../errors/app-error.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { validate } from '../middleware/validate.js';
import type { ServiceRepository } from '../repositories/service.repository.js';

const identifierSchema = z.object({ serviceId: z.string().uuid() });
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});
const serviceFields = {
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  durationMinutes: z.number().int().min(5).max(1440),
  priceCents: z.number().int().min(0).max(100_000_000),
  active: z.boolean().optional()
};
const createServiceSchema = z.object(serviceFields);
const updateServiceSchema = z
  .object({
    name: serviceFields.name.optional(),
    description: serviceFields.description,
    durationMinutes: serviceFields.durationMinutes.optional(),
    priceCents: serviceFields.priceCents.optional(),
    active: serviceFields.active
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export function createServiceRouter(services: ServiceRepository, config: AppConfig): Router {
  const router = Router();

  router.get(
    '/',
    validate(paginationSchema, 'query'),
    asyncHandler(async (request, response) => {
      const { page, limit } = request.query as unknown as { page: number; limit: number };
      response.json(await services.listActive(page, limit));
    })
  );

  router.get(
    '/:serviceId',
    validate(identifierSchema, 'params'),
    asyncHandler(async (request, response) => {
      const service = await services.findActiveById(request.params.serviceId as string);
      if (!service) throw errors.notFound('Service');
      response.json({ data: service });
    })
  );

  router.post(
    '/',
    authenticate(config),
    authorize('admin'),
    validate(createServiceSchema),
    asyncHandler(async (request, response) => {
      response.status(201).json({ data: await services.create(request.body) });
    })
  );

  router.patch(
    '/:serviceId',
    authenticate(config),
    authorize('admin'),
    validate(identifierSchema, 'params'),
    validate(updateServiceSchema),
    asyncHandler(async (request, response) => {
      const service = await services.update(request.params.serviceId as string, request.body);
      if (!service) throw errors.notFound('Service');
      response.json({ data: service });
    })
  );

  router.delete(
    '/:serviceId',
    authenticate(config),
    authorize('admin'),
    validate(identifierSchema, 'params'),
    asyncHandler(async (request, response) => {
      if (!(await services.deactivate(request.params.serviceId as string))) throw errors.notFound('Service');
      response.status(204).send();
    })
  );

  return router;
}
