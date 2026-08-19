import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  AUTH_DISABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  OIDC_ISSUER: z.string().url().optional(),
  OIDC_AUDIENCE: z.string().optional(),
  OIDC_JWKS_URL: z.string().url().optional(),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('continuum-files'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

let cached: AppConfig | undefined;

export function config(): AppConfig {
  cached ??= ConfigSchema.parse(process.env);
  if (cached.NODE_ENV === 'production' && cached.AUTH_DISABLED) {
    throw new Error('AUTH_DISABLED cannot be enabled in production');
  }
  if (!cached.AUTH_DISABLED && (!cached.OIDC_ISSUER || !cached.OIDC_AUDIENCE || !cached.OIDC_JWKS_URL)) {
    throw new Error('OIDC_ISSUER, OIDC_AUDIENCE, and OIDC_JWKS_URL are required when auth is enabled');
  }
  return cached;
}
