import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().optional().default(''),
  JWT_ACCESS_SECRET: z.string().min(32),
  PII_ENCRYPTION_KEY: z.string().min(1),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  MFA_CHALLENGE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  APPLE_CLIENT_ID: z.string().optional().default(''),
  APP_WEB_URL: z.string().url().default('http://localhost:3000'),
  WEB_ROOT: z.string().optional().default(''),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default(''),
  FIREBASE_PROJECT_ID: z.string().optional().default(''),
  FIREBASE_CLIENT_EMAIL: z.string().optional().default(''),
  FIREBASE_PRIVATE_KEY: z.string().optional().default(''),
  FIREBASE_STORAGE_BUCKET: z.string().optional().default(''),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: Record<string, unknown>): Env {
  return envSchema.parse(raw);
}
