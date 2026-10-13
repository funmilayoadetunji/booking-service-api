import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Booking, BookingStatus, Paginated } from '../types/domain.js';

const bookingColumns = `
  b.id, b.customer_id AS "customerId", b.service_id AS "serviceId",
  b.starts_at AS "startsAt", b.ends_at AS "endsAt", b.status, b.notes,
  b.created_at AS "createdAt", b.updated_at AS "updatedAt",
  s.name AS "serviceName", s.duration_minutes AS "durationMinutes"
`;

export type BookingUpdateInput = {
  startsAt?: Date;
  endsAt?: Date;
  notes?: string | null;
  status?: BookingStatus;
};

export class BookingRepository {
  constructor(private readonly database: Pick<Pool, 'query'>) {}

  async create(input: {
    customerId: string;
    serviceId: string;
    startsAt: Date;
    endsAt: Date;
    notes?: string;
  }): Promise<Booking> {
    const result = await this.database.query<Booking>(
      `INSERT INTO bookings (id, customer_id, service_id, starts_at, ends_at, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, customer_id AS "customerId", service_id AS "serviceId",
                 starts_at AS "startsAt", ends_at AS "endsAt", status, notes,
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [randomUUID(), input.customerId, input.serviceId, input.startsAt, input.endsAt, input.notes ?? null]
    );
    return result.rows[0];
  }

  async findById(id: string): Promise<Booking | null> {
    const result = await this.database.query<Booking>(
      `SELECT ${bookingColumns} FROM bookings b JOIN services s ON s.id = b.service_id WHERE b.id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async list(input: {
    page: number;
    limit: number;
    customerId?: string;
    status?: BookingStatus;
  }): Promise<Paginated<Booking>> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (input.customerId) {
      values.push(input.customerId);
      conditions.push(`b.customer_id = $${values.length}`);
    }
    if (input.status) {
      values.push(input.status);
      conditions.push(`b.status = $${values.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (input.page - 1) * input.limit;
    const rowsValues = [...values, input.limit, offset];
    const [items, count] = await Promise.all([
      this.database.query<Booking>(
        `SELECT ${bookingColumns} FROM bookings b JOIN services s ON s.id = b.service_id
         ${where} ORDER BY b.starts_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        rowsValues
      ),
      this.database.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM bookings b ${where}`,
        values
      )
    ]);
    const total = count.rows[0].total;
    return { data: items.rows, meta: { page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) } };
  }

  async hasConflict(customerId: string, startsAt: Date, endsAt: Date, excludeBookingId?: string): Promise<boolean> {
    const values: unknown[] = [customerId, startsAt, endsAt];
    let exclude = '';
    if (excludeBookingId) {
      values.push(excludeBookingId);
      exclude = 'AND id <> $4';
    }
    const result = await this.database.query<{ id: string }>(
      `SELECT id FROM bookings
       WHERE customer_id = $1 AND status <> 'cancelled'
         AND starts_at < $3 AND ends_at > $2 ${exclude}
       LIMIT 1`,
      values
    );
    return result.rows.length > 0;
  }

  async update(id: string, input: BookingUpdateInput): Promise<Booking | null> {
    const columnValues: Array<[string, unknown]> = [];
    if (input.startsAt !== undefined) columnValues.push(['starts_at', input.startsAt]);
    if (input.endsAt !== undefined) columnValues.push(['ends_at', input.endsAt]);
    if (input.notes !== undefined) columnValues.push(['notes', input.notes]);
    if (input.status !== undefined) columnValues.push(['status', input.status]);
    if (!columnValues.length) return this.findById(id);

    const sets = columnValues.map(([column], index) => `${column} = $${index + 1}`);
    sets.push('updated_at = NOW()');
    const updated = await this.database.query<Booking>(
      `UPDATE bookings SET ${sets.join(', ')} WHERE id = $${columnValues.length + 1}
       RETURNING id`,
      [...columnValues.map(([, value]) => value), id]
    );
    if (!updated.rows[0]) return null;
    return this.findById(updated.rows[0].id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.database.query('DELETE FROM bookings WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }
}
