import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'provision')
    .default('development'),
  PORT: Joi.number().default(3001),
  DATABASE_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().min(32).required().messages({
    'string.min':
      'JWT_SECRET deve ter no mínimo 32 caracteres (HS256 recomenda 64).',
    'any.required': 'JWT_SECRET é obrigatório.',
  }),
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
  THROTTLER_SENSITIVE_LIMIT_FORGOT: Joi.number().default(5),
  THROTTLER_SENSITIVE_LIMIT_REFRESH: Joi.number().default(10),
  THROTTLER_SENSITIVE_LIMIT_RESET: Joi.number().default(10),
  // [Sprint1-HTTP] Trust proxy — usado pelo Fastify para confiar no
  // header X-Forwarded-For. Default 'loopback' (apenas o primeiro hop).
  // BDD: features/devsecops-sprint1-quick-wins.feature:Funcionalidade: HTTP Hardening
  // SDD: .openspec/changes/devsecops-sprint1-quick-wins/design.md#fase-1
  TRUST_PROXY: Joi.string().default('loopback'),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),
  PASSWORD_RESET_EXPIRES_MINUTES: Joi.number().default(60).min(1),
  ALLOWED_ORIGINS: Joi.string().optional(),
  // [email-notifications] Envs para feature de e-mails transacionais
  // BDD: features/email-notifications.feature
  // SDD: .openspec/changes/email-notifications/design.md:REQ-EM-N01
  EMAIL_NOTIFICATIONS_ENABLED: Joi.boolean().default(true),
  APP_NAME: Joi.string().default('API Padrão'),
  APP_LOGIN_URL: Joi.string().uri().default('http://localhost:3000'),
  EMAIL_NOTIFICATIONS_METRICS_ENABLED: Joi.boolean().default(false),
});
