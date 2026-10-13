import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Paginated, Service } from '../types/domain.js';

const serviceColumns = `
  id, name, description, duration_minutes AS "durationMinutes",
  price_cents AS "priceCents", active,
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

export type ServiceInput = {
  name: string;
  description?: string | null;
  durationMinutes: number;
  priceCents: number;
  active?: boolean;
};

export class ServiceRepository {
  constructor(private readonly database: Pick<Pool, 'query'>) {}

  async create(input: ServiceInput): Promise<Service> {
    const result = await this.database.query<Service>(
      `INSERT INTO services (id, name, description, duration_minutes, price_cents, active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${serviceColumns}`,
      [
        randomUUID(),
        input.name,
        input.description ?? null,
        input.durationMinutes,
        input.priceCents,
        input.active ?? true
      ]
    );
    return result.rows[0];
  }

  async listActive(page: number, limit: number): Promise<Paginated<Service>> {
    const offset = (page - 1) * limit;
    const [items, count] = await Promise.all([
      this.database.query<Service>(
        `SELECT ${serviceColumns} FROM services WHERE active = TRUE
         ORDER BY name ASC, id ASC LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      this.database.query<{ total: number }>('SELECT COUNT(*)::int AS total FROM services WHERE active = TRUE')
    ]);
    const total = count.rows[0].total;
    return { data: items.rows, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string): Promise<Service | null> {
    const result = await this.database.query<Service>(`SELECT ${serviceColumns} FROM services WHERE id = $1`, [id]);
    return result.rows[0] ?? null;
  }

  async findActiveById(id: string): Promise<Service | null> {
    const result = await this.database.query<Service>(
      `SELECT ${serviceColumns} FROM services WHERE id = $1 AND active = TRUE`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async update(id: string, input: Partial<ServiceInput>): Promise<Service | null> {
    const columnValues: Array<[string, unknown]> = [];
    if (input.name !== undefined) columnValues.push(['name', input.name]);
    if (input.description !== undefined) columnValues.push(['description', input.description]);
    if (input.durationMinutes !== undefined) columnValues.push(['duration_minutes', input.durationMinutes]);
    if (input.priceCents !== undefined) columnValues.push(['price_cents', input.priceCents]);
    if (input.active !== undefined) columnValues.push(['active', input.active]);

    if (!columnValues.length) return this.findById(id);

    const sets = columnValues.map(([column], index) => `${column} = $${index + 1}`);
    sets.push('updated_at = NOW()');
    const result = await this.database.query<Service>(
      `UPDATE services SET ${sets.join(', ')} WHERE id = $${columnValues.length + 1}
       RETURNING ${serviceColumns}`,
      [...columnValues.map(([, value]) => value), id]
    );
    return result.rows[0] ?? null;
  }

  async deactivate(id: string): Promise<boolean> {
    const result = await this.database.query('UPDATE services SET active = FALSE, updated_at = NOW() WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }
}
