import bcrypt from 'bcryptjs';
import type { AppConfig } from '../config/env.js';
import { errors } from '../errors/app-error.js';
import { signAccessToken } from '../middleware/auth.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { toPublicUser } from '../repositories/user.repository.js';
import type { PublicUser } from '../types/domain.js';

export type AuthResponse = { accessToken: string; user: PublicUser };

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly config: AppConfig
  ) {}

  async register(input: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }): Promise<AuthResponse> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) throw errors.conflict('An account with this email already exists.');

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await this.users.create({ ...input, passwordHash });
    return this.issueToken(user);
  }

  async login(input: { email: string; password: string }): Promise<AuthResponse> {
    const user = await this.users.findByEmail(input.email);
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw errors.unauthorized('Email or password is incorrect.');
    }
    return this.issueToken(user);
  }

  private issueToken(user: Parameters<typeof toPublicUser>[0]): AuthResponse {
    return {
      accessToken: signAccessToken({ sub: user.id, role: user.role }, this.config),
      user: toPublicUser(user)
    };
  }
}
