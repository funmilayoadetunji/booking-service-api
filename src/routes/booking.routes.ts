import { Router } from 'express';
import { z } from 'zod';
import type { AppConfig } from '../config/env.js';
import { errors } from '../errors/app-error.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { validate } from '../middleware/validate.js';
import type { BookingRepository } from '../repositories/booking.repository.js';
import type { BookingService } from '../services/booking.service.js';

const identifierSchema = z.object({ bookingId: z.string().uuid() });
const dateTime = z.string().datetime({ offset: true }).transform((value) => new Date(value));
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'confirmed', 'cancelled']).optional()
});
const createBookingSchema = z.object({
  serviceId: z.string().uuid(),
  startsAt: dateTime,
  notes: z.string().trim().max(1000).optional()
});
const updateBookingSchema = z
  .object({
    startsAt: dateTime.optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    status: z.enum(['pending', 'confirmed', 'cancelled']).optional()
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export function createBookingRouter(
  bookings: BookingRepository,
  bookingService: BookingService,
  config: AppConfig
): Router {
  const router = Router();
  router.use(authenticate(config));

  router.get(
    '/',
    validate(paginationSchema, 'query'),
    asyncHandler(async (request, response) => {
      const { page, limit, status } = request.query as unknown as {
        page: number;
        limit: number;
        status?: 'pending' | 'confirmed' | 'cancelled';
      };
      const customerId = request.auth!.role === 'customer' ? request.auth!.userId : undefined;
      response.json(await bookings.list({ page, limit, status, customerId }));
    })
  );

  router.post(
    '/',
    validate(createBookingSchema),
    asyncHandler(async (request, response) => {
      const booking = await bookingService.create({ customerId: request.auth!.userId, ...request.body });
      response.status(201).json({ data: booking });
    })
  );

  router.get(
    '/:bookingId',
    validate(identifierSchema, 'params'),
    asyncHandler(async (request, response) => {
      const booking = await bookingService.get(request.params.bookingId as string);
      if (request.auth!.role !== 'admin' && booking.customerId !== request.auth!.userId) throw errors.forbidden();
      response.json({ data: booking });
    })
  );

  router.patch(
    '/:bookingId',
    validate(identifierSchema, 'params'),
    validate(updateBookingSchema),
    asyncHandler(async (request, response) => {
      const booking = await bookingService.update({
        bookingId: request.params.bookingId as string,
        requester: request.auth!,
        ...request.body
      });
      response.json({ data: booking });
    })
  );

  router.delete(
    '/:bookingId',
    authorize('admin'),
    validate(identifierSchema, 'params'),
    asyncHandler(async (request, response) => {
      const result = await bookings.delete(request.params.bookingId as string);
      if (!result) throw errors.notFound('Booking');
      response.status(204).send();
    })
  );

  return router;
}
