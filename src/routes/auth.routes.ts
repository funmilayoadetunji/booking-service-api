import { Router } from 'express';
import { z } from 'zod';
import type { AppConfig } from '../config/env.js';
import { errors } from '../errors/app-error.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { validate } from '../middleware/validate.js';
import type { UserRepository} from '../repositories/user.repository.js';
import { toPublicUser } from '../repositories/user.repository.js';
import { AuthService } from '../services/auth.service.js';

const registerSchema = z.object({
  email: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
  password: z.string().min(8).max(128),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional()
});

const loginSchema = z.object({
  email: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(128)
});

export function createAuthRouter(users: UserRepository, config: AppConfig): Router {
  const router = Router();
  const auth = new AuthService(users, config);

  router.post(
    '/register',
    validate(registerSchema),
    asyncHandler(async (request, response) => {
      const result = await auth.register(request.body);
      response.status(201).json(result);
    })
  );

  router.post(
    '/login',
    validate(loginSchema),
    asyncHandler(async (request, response) => {
      const result = await auth.login(request.body);
      response.json(result);
    })
  );

  router.get(
    '/me',
    authenticate(config),
    asyncHandler(async (request, response) => {
      const user = await users.findById(request.auth!.userId);
      if (!user) throw errors.unauthorized('The account for this token no longer exists.');
      response.json({ user: toPublicUser(user) });
    })
  );

  return router;
}
