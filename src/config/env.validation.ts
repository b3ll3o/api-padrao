// BDD: N/A (cross-cutting / infraestrutura)
// SDD: N/A
// TDD: src/config/env.validation.spec.ts

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
  // [L4] Reduzido de 7d para 2d (DevSecOps sweep 2026-06-21). Janela
  // menor de exposição em caso de refresh token leak; access tokens
  // continuam com 15min (acima). Override por env para prod se necessário.
  JWT_REFRESH_EXPIRES_DAYS: Joi.number().default(2),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  // [DevSecOps-Sprint1] Body size limit (1 MiB default). Previne DoS por
  // payloads enormes; override via BODY_LIMIT_BYTES env var.
  // REQ-SEC-BODY-001 (devsecops-sprint-1/design.md).
  BODY_LIMIT_BYTES: Joi.number()
    .integer()
    .min(1024)
    .default(1024 * 1024),
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
  // [REQ-CC-IDEMPOTENT-001.3] TTL configurável para cache de responses
  // idempotentes (default 24h). Lock de processamento separado (60s).
  // Min 60s para evitar window < 1 min em prod (curto demais para
  // retries B2B reais); sem max (operacionalmente é armazenamento
  // Redis, não janela de exposição de credenciais).
  IDEMPOTENCY_TTL_SECONDS: Joi.number().integer().min(60).default(86400),
  IDEMPOTENCY_LOCK_TTL_SECONDS: Joi.number().integer().min(10).default(60),
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
  // [SEC-006] OTEL_EXPORTER_OTLP_ENDPOINT — em produção, OTel exporter
  // PRECISA usar HTTPS. Traces contêm PII (user IDs, emails) e vazam
  // em cleartext via HTTP. A02 Cryptographic Failures / A09 Logging
  // Failures (CWE-319). Em dev/test aceita HTTP para collector local.
  OTEL_EXPORTER_OTLP_ENDPOINT: Joi.string()
    .uri()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string()
        .uri({ scheme: ['https'] })
        .required()
        .messages({
          'string.uriCustomScheme':
            'OTEL_EXPORTER_OTLP_ENDPOINT deve ser https:// em produção (tracing de PII em cleartext).',
        }),
      otherwise: Joi.string().uri().optional(),
    }),
});
