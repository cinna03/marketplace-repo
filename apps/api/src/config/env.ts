import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  PII_ENCRYPTION_KEY: z.string().min(1),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  MFA_CHALLENGE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  APPLE_CLIENT_ID: z.string().optional().default(''),
  APP_WEB_URL: z.string().url().default('http://localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: Record<string, unknown>): Env {
  return envSchema.parse(raw);
}
