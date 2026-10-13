import { errors } from '../errors/app-error.js';
import type { BookingRepository } from '../repositories/booking.repository.js';
import type { ServiceRepository } from '../repositories/service.repository.js';
import type { Booking, BookingStatus } from '../types/domain.js';

export class BookingService {
  constructor(
    private readonly bookings: BookingRepository,
    private readonly services: ServiceRepository
  ) {}

  async create(input: { customerId: string; serviceId: string; startsAt: Date; notes?: string }): Promise<Booking> {
    this.assertFuture(input.startsAt);
    const service = await this.services.findActiveById(input.serviceId);
    if (!service) throw errors.notFound('Active service');

    const endsAt = new Date(input.startsAt.getTime() + service.durationMinutes * 60_000);
    if (await this.bookings.hasConflict(input.customerId, input.startsAt, endsAt)) {
      throw errors.conflict('This booking overlaps one of the customer\'s existing bookings.');
    }
    return this.bookings.create({ ...input, endsAt });
  }

  async get(id: string): Promise<Booking> {
    const booking = await this.bookings.findById(id);
    if (!booking) throw errors.notFound('Booking');
    return booking;
  }

  async update(input: {
    bookingId: string;
    requester: { userId: string; role: 'admin' | 'customer' };
    startsAt?: Date;
    notes?: string | null;
    status?: BookingStatus;
  }): Promise<Booking> {
    const booking = await this.get(input.bookingId);
    const isAdmin = input.requester.role === 'admin';
    if (!isAdmin && booking.customerId !== input.requester.userId) throw errors.forbidden();

    if (!isAdmin) {
      if (input.status && input.status !== 'cancelled') {
        throw errors.forbidden('Customers may only cancel a booking.');
      }
      if ((input.startsAt || input.notes !== undefined) && booking.status !== 'pending') {
        throw errors.conflict('Only pending bookings may be amended by customers.');
      }
    }

    const update: { startsAt?: Date; endsAt?: Date; notes?: string | null; status?: BookingStatus } = {
      notes: input.notes,
      status: input.status
    };
    if (input.startsAt) {
      this.assertFuture(input.startsAt);
      const duration = booking.durationMinutes;
      if (!duration) throw errors.badRequest('Booking service duration is unavailable.');
      const endsAt = new Date(input.startsAt.getTime() + duration * 60_000);
      if (await this.bookings.hasConflict(booking.customerId, input.startsAt, endsAt, booking.id)) {
        throw errors.conflict('This booking overlaps one of the customer\'s existing bookings.');
      }
      update.startsAt = input.startsAt;
      update.endsAt = endsAt;
    }

    const updated = await this.bookings.update(booking.id, update);
    if (!updated) throw errors.notFound('Booking');
    return updated;
  }

  private assertFuture(startsAt: Date): void {
    if (startsAt.getTime() <= Date.now()) {
      throw errors.badRequest('Booking start time must be in the future.');
    }
  }
}
