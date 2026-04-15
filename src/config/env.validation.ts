import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'provision')
    .default('development'),
  PORT: Joi.number().default(3001),
  DATABASE_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_DAYS: Joi.number().default(7),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  CACHE_TTL: Joi.number().default(600),
  THROTTLER_SHORT_TTL: Joi.number().default(1000),
  THROTTLER_SHORT_LIMIT: Joi.number().default(3),
  THROTTLER_MEDIUM_TTL: Joi.number().default(10000),
  THROTTLER_MEDIUM_LIMIT: Joi.number().default(20),
  THROTTLER_LONG_TTL: Joi.number().default(60000),
  THROTTLER_LONG_LIMIT: Joi.number().default(100),
  THROTTLER_SENSITIVE_TTL: Joi.number().default(60000),
  THROTTLER_SENSITIVE_LIMIT: Joi.number().default(10),
  ALLOWED_ORIGINS: Joi.string().optional(),
});
