import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '../config/env.js';
import { errors } from '../errors/app-error.js';
import type { UserRole } from '../types/domain.js';

type TokenPayload = {
  sub: string;
  role: UserRole;
};

export function signAccessToken(payload: TokenPayload, config: AppConfig): string {
  return jwt.sign({ role: payload.role }, config.jwtSecret, {
    subject: payload.sub,
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn']
  });
}

export function authenticate(config: AppConfig) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      next(errors.unauthorized('A Bearer access token is required.'));
      return;
    }

    try {
      const payload = jwt.verify(header.slice(7), config.jwtSecret) as jwt.JwtPayload;
      if (!payload.sub || (payload.role !== 'admin' && payload.role !== 'customer')) {
        next(errors.unauthorized('The access token payload is invalid.'));
        return;
      }
      request.auth = { userId: payload.sub, role: payload.role };
      next();
    } catch {
      next(errors.unauthorized('The access token is invalid or expired.'));
    }
  };
}

export function authorize(...roles: UserRole[]) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (!request.auth || !roles.includes(request.auth.role)) {
      next(errors.forbidden());
      return;
    }
    next();
  };
}
