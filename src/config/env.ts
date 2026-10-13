import 'dotenv/config';
import { z } from 'zod';

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url().default('postgresql://postgres:postgres@localhost:5432/booking_service'),
  JWT_SECRET: z.string().min(32).default('development-only-secret-change-this-value-32'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000')
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  corsOrigin: string;
};

export function getConfig(input: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = rawEnvSchema.parse(input);

  if (parsed.NODE_ENV === 'production' && parsed.JWT_SECRET.includes('development-only')) {
    throw new Error('JWT_SECRET must be explicitly configured in production.');
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    jwtSecret: parsed.JWT_SECRET,
    jwtExpiresIn: parsed.JWT_EXPIRES_IN,
    corsOrigin: parsed.CORS_ORIGIN
  };
}

export const config = getConfig();
