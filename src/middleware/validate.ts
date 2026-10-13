import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { errors } from '../errors/app-error.js';

type RequestPart = 'body' | 'params' | 'query';

export function validate(schema: ZodType, part: RequestPart = 'body') {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const result = schema.safeParse(request[part]);
    if (!result.success) {
      next(errors.badRequest('Request validation failed.', result.error.flatten()));
      return;
    }

    Object.assign(request[part], result.data);
    next();
  };
}
