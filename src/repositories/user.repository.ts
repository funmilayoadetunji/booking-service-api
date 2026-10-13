import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { PublicUser, User, UserRole } from '../types/domain.js';

const userColumns = `
  id, email, password_hash AS "passwordHash", role,
  first_name AS "firstName", last_name AS "lastName",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

export class UserRepository {
  constructor(private readonly database: Pick<Pool, 'query'>) {}

  async create(input: {
    email: string;
    passwordHash: string;
    firstName?: string;
    lastName?: string;
    role?: UserRole;
  }): Promise<User> {
    const result = await this.database.query<User>(
      `INSERT INTO users (id, email, password_hash, role, first_name, last_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${userColumns}`,
      [
        randomUUID(),
        input.email.toLowerCase(),
        input.passwordHash,
        input.role ?? 'customer',
        input.firstName ?? null,
        input.lastName ?? null
      ]
    );
    return result.rows[0];
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.database.query<User>(`SELECT ${userColumns} FROM users WHERE email = $1`, [
      email.toLowerCase()
    ]);
    return result.rows[0] ?? null;
  }

  async findById(id: string): Promise<User | null> {
    const result = await this.database.query<User>(`SELECT ${userColumns} FROM users WHERE id = $1`, [id]);
    return result.rows[0] ?? null;
  }
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}
