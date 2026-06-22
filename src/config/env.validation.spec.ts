// BDD: N/A (cross-cutting / infraestrutura)
// SDD: N/A
// TDD: src/config/env.validation.spec.ts

import { envValidationSchema } from './env.validation';

/**
 * Cobertura unitária do Joi schema de validação de env vars.
 *
 * Estratégia: testa o schema diretamente (sem NestJS ConfigModule) passando
 * objetos in-memory — mais rápido, sem mock de process.env global, e isola
 * o contrato do schema do comportamento de runtime.
 *
 * NOTA: O método `validate()` do Joi retorna `{ value, error }`.
 * Quando `convert: true` (default), o Joi faz coercion automática
 * (string "3001" -> number 3001, "true" -> boolean true, etc.).
 */
describe('envValidationSchema', () => {
  /**
   * Helper: monta um objeto de env válido "completo" e retorna mutações
   * a partir dele, evitando repetir ~30 chaves em cada teste.
   */
  const buildValidEnv = (
    overrides: Record<string, string | undefined> = {},
  ): Record<string, string> => {
    const base: Record<string, string> = {
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      JWT_SECRET: 'a'.repeat(32), // exatamente o mínimo
      NODE_ENV: 'development',
      PORT: '3001',
      JWT_ACCESS_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_DAYS: '7',
      REDIS_HOST: 'localhost',
      REDIS_PORT: '6379',
      CACHE_TTL: '600',
      THROTTLER_SHORT_TTL: '1000',
      THROTTLER_SHORT_LIMIT: '3',
      THROTTLER_MEDIUM_TTL: '10000',
      THROTTLER_MEDIUM_LIMIT: '20',
      THROTTLER_LONG_TTL: '60000',
      THROTTLER_LONG_LIMIT: '100',
      THROTTLER_SENSITIVE_TTL: '60000',
      THROTTLER_SENSITIVE_LIMIT: '10',
      THROTTLER_SENSITIVE_LIMIT_FORGOT: '5',
      THROTTLER_SENSITIVE_LIMIT_REFRESH: '10',
      THROTTLER_SENSITIVE_LIMIT_RESET: '10',
      TRUST_PROXY: 'loopback',
      FRONTEND_URL: 'http://localhost:3000',
      PASSWORD_RESET_EXPIRES_MINUTES: '60',
      EMAIL_NOTIFICATIONS_ENABLED: 'true',
      APP_NAME: 'API Padrão',
      APP_LOGIN_URL: 'http://localhost:3000',
      EMAIL_NOTIFICATIONS_METRICS_ENABLED: 'false',
    };
    // remove chaves com valor undefined (simula "ausência")
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) {
        delete base[k];
      } else {
        base[k] = v;
      }
    }
    return base;
  };

  describe('caso feliz', () => {
    it('valida com todas as env vars obrigatórias e opcionais presentes', () => {
      const env = buildValidEnv();
      const { value, error } = envValidationSchema.validate(env);

      expect(error).toBeUndefined();
      expect(value).toBeDefined();
      expect(value.DATABASE_URL).toBe(env.DATABASE_URL);
      expect(value.JWT_SECRET).toBe(env.JWT_SECRET);
    });

    it('valida apenas com as obrigatórias (DATABASE_URL + JWT_SECRET)', () => {
      const env = buildValidEnv({
        NODE_ENV: undefined,
        PORT: undefined,
        JWT_ACCESS_EXPIRES_IN: undefined,
        JWT_REFRESH_EXPIRES_DAYS: undefined,
        REDIS_HOST: undefined,
        REDIS_PORT: undefined,
        CACHE_TTL: undefined,
        THROTTLER_SHORT_TTL: undefined,
        THROTTLER_SHORT_LIMIT: undefined,
        THROTTLER_MEDIUM_TTL: undefined,
        THROTTLER_MEDIUM_LIMIT: undefined,
        THROTTLER_LONG_TTL: undefined,
        THROTTLER_LONG_LIMIT: undefined,
        THROTTLER_SENSITIVE_TTL: undefined,
        THROTTLER_SENSITIVE_LIMIT: undefined,
        THROTTLER_SENSITIVE_LIMIT_FORGOT: undefined,
        THROTTLER_SENSITIVE_LIMIT_REFRESH: undefined,
        THROTTLER_SENSITIVE_LIMIT_RESET: undefined,
        TRUST_PROXY: undefined,
        FRONTEND_URL: undefined,
        PASSWORD_RESET_EXPIRES_MINUTES: undefined,
        EMAIL_NOTIFICATIONS_ENABLED: undefined,
        APP_NAME: undefined,
        APP_LOGIN_URL: undefined,
        EMAIL_NOTIFICATIONS_METRICS_ENABLED: undefined,
      });
      const { value, error } = envValidationSchema.validate(env);

      expect(error).toBeUndefined();
      expect(value).toBeDefined();
    });
  });

  describe('env vars obrigatórias', () => {
    it('retorna erro quando DATABASE_URL está ausente', () => {
      const env = buildValidEnv({ DATABASE_URL: undefined });
      const { error } = envValidationSchema.validate(env);

      expect(error).toBeDefined();
      expect(error?.message).toMatch(/DATABASE_URL/);
      expect(error?.details[0].type).toBe('any.required');
    });

    it('retorna erro quando JWT_SECRET está ausente', () => {
      const env = buildValidEnv({ JWT_SECRET: undefined });
      const { error } = envValidationSchema.validate(env);

      expect(error).toBeDefined();
      expect(error?.message).toMatch(/JWT_SECRET é obrigatório/);
      expect(error?.details[0].type).toBe('any.required');
    });

    it('retorna erro quando ambas obrigatórias estão ausentes', () => {
      const env = buildValidEnv({
        DATABASE_URL: undefined,
        JWT_SECRET: undefined,
      });
      // abortEarly: false força o Joi a reportar todas as violações, não só a primeira
      const { error } = envValidationSchema.validate(env, {
        abortEarly: false,
      });

      expect(error).toBeDefined();
      const keys = (error?.details ?? []).map((d) => d.path[0]);
      expect(keys).toEqual(
        expect.arrayContaining(['DATABASE_URL', 'JWT_SECRET']),
      );
    });

    it('retorna erro quando DATABASE_URL é string vazia', () => {
      const env = buildValidEnv({ DATABASE_URL: '' });
      const { error } = envValidationSchema.validate(env);

      expect(error).toBeDefined();
      // Joi trata '' como ausente por padrão em strings required
      expect(error?.details[0].type).toMatch(/required|empty/);
    });
  });

  describe('JWT_SECRET', () => {
    it('aceita JWT_SECRET com exatamente 32 caracteres', () => {
      const env = buildValidEnv({ JWT_SECRET: 'x'.repeat(32) });
      const { value, error } = envValidationSchema.validate(env);

      expect(error).toBeUndefined();
      expect(value.JWT_SECRET).toHaveLength(32);
    });

    it('aceita JWT_SECRET com mais de 32 caracteres', () => {
      const env = buildValidEnv({ JWT_SECRET: 'y'.repeat(64) });
      const { value, error } = envValidationSchema.validate(env);

      expect(error).toBeUndefined();
      expect(value.JWT_SECRET).toHaveLength(64);
    });

    it('retorna erro custom quando JWT_SECRET tem menos de 32 caracteres', () => {
      const env = buildValidEnv({ JWT_SECRET: 'short_secret' }); // 12 chars
      const { error } = envValidationSchema.validate(env);

      expect(error).toBeDefined();
      expect(error?.details[0].type).toBe('string.min');
      // mensagem custom definida no schema
      expect(error?.message).toMatch(
        /JWT_SECRET deve ter no mínimo 32 caracteres/,
      );
    });

    it('retorna erro com 31 caracteres (boundary)', () => {
      const env = buildValidEnv({ JWT_SECRET: 'z'.repeat(31) });
      const { error } = envValidationSchema.validate(env);

      expect(error).toBeDefined();
      expect(error?.details[0].type).toBe('string.min');
    });
  });

  describe('NODE_ENV', () => {
    it('aceita development', () => {
      const env = buildValidEnv({ NODE_ENV: 'development' });
      const { value, error } = envValidationSchema.validate(env);

      expect(error).toBeUndefined();
      expect(value.NODE_ENV).toBe('development');
    });

    it('aceita production', () => {
      // Em production, OTEL_EXPORTER_OTLP_ENDPOINT é obrigatório (https://)
      const env = buildValidEnv({
        NODE_ENV: 'production',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel.example.com',
      });
      const { value, error } = envValidationSchema.validate(env);

      expect(error).toBeUndefined();
      expect(value.NODE_ENV).toBe('production');
    });

    it('aceita test', () => {
      const env = buildValidEnv({ NODE_ENV: 'test' });
      const { value, error } = envValidationSchema.validate(env);

      expect(error).toBeUndefined();
      expect(value.NODE_ENV).toBe('test');
    });

    it('aceita provision', () => {
      const env = buildValidEnv({ NODE_ENV: 'provision' });
      const { value, error } = envValidationSchema.validate(env);

      expect(error).toBeUndefined();
      expect(value.NODE_ENV).toBe('provision');
    });

    it('retorna erro quando NODE_ENV tem valor inválido', () => {
      const env = buildValidEnv({ NODE_ENV: 'production_typo' });
      const { error } = envValidationSchema.validate(env);

      expect(error).toBeDefined();
      expect(error?.details[0].type).toBe('any.only');
      expect(error?.message).toMatch(/NODE_ENV/);
    });

    it('aplica default "development" quando NODE_ENV ausente', () => {
      const env = buildValidEnv({ NODE_ENV: undefined });
      const { value, error } = envValidationSchema.validate(env);

      expect(error).toBeUndefined();
      expect(value.NODE_ENV).toBe('development');
    });
  });

  describe('transforms / coerção de tipos', () => {
    it('coage PORT de string para number', () => {
      const env = buildValidEnv({ PORT: '8080' });
      const { value, error } = envValidationSchema.validate(env);

      expect(error).toBeUndefined();
      expect(value.PORT).toBe(8080);
      expect(typeof value.PORT).toBe('number');
    });

    it('coage REDIS_PORT de string para number', () => {
      const env = buildValidEnv({ REDIS_PORT: '6380' });
      const { value, error } = envValidationSchema.validate(env);

      expect(error).toBeUndefined();
      expect(value.REDIS_PORT).toBe(6380);
      expect(typeof value.REDIS_PORT).toBe('number');
    });

    it('coage CACHE_TTL de string para number', () => {
      const env = buildValidEnv({ CACHE_TTL: '1200' });
      const { value, error } = envValidationSchema.validate(env);

      expect(error).toBeUndefined();
      expect(value.CACHE_TTL).toBe(1200);
      expect(typeof value.CACHE_TTL).toBe('number');
    });

    it('coage todos os throttler TTL/limit para number', () => {
      const env = buildValidEnv({
        THROTTLER_SHORT_TTL: '500',
        THROTTLER_SHORT_LIMIT: '5',
        THROTTLER_MEDIUM_TTL: '20000',
        THROTTLER_MEDIUM_LIMIT: '50',
        THROTTLER_LONG_TTL: '120000',
        THROTTLER_LONG_LIMIT: '200',
        THROTTLER_SENSITIVE_TTL: '30000',
        THROTTLER_SENSITIVE_LIMIT: '20',
      });
      const { value, error } = envValidationSchema.validate(env);

      expect(error).toBeUndefined();
      expect(value.THROTTLER_SHORT_TTL).toBe(500);
      expect(value.THROTTLER_SHORT_LIMIT).toBe(5);
      expect(value.THROTTLER_MEDIUM_TTL).toBe(20000);
      expect(value.THROTTLER_MEDIUM_LIMIT).toBe(50);
      expect(value.THROTTLER_LONG_TTL).toBe(120000);
      expect(value.THROTTLER_LONG_LIMIT).toBe(200);
      expect(value.THROTTLER_SENSITIVE_TTL).toBe(30000);
      expect(value.THROTTLER_SENSITIVE_LIMIT).toBe(20);
    });

    it('coage EMAIL_NOTIFICATIONS_ENABLED "true" para boolean true', () => {
      const env = buildValidEnv({ EMAIL_NOTIFICATIONS_ENABLED: 'true' });
      const { value, error } = envValidationSchema.validate(env);

      expect(error).toBeUndefined();
      expect(value.EMAIL_NOTIFICATIONS_ENABLED).toBe(true);
      expect(typeof value.EMAIL_NOTIFICATIONS_ENABLED).toBe('boolean');
    });

    it('coage EMAIL_NOTIFICATIONS_ENABLED "false" para boolean false', () => {
      const env = buildValidEnv({ EMAIL_NOTIFICATIONS_ENABLED: 'false' });
      const { value, error } = envValidationSchema.validate(env);

      expect(error).toBeUndefined();
      expect(value.EMAIL_NOTIFICATIONS_ENABLED).toBe(false);
    });

    it('retorna erro quando PORT não é número válido', () => {
      const env = buildValidEnv({ PORT: 'not-a-number' });
      const { error } = envValidationSchema.validate(env);

      expect(error).toBeDefined();
      expect(error?.details[0].type).toBe('number.base');
    });
  });

  describe('default values', () => {
    /**
     * Helper: valida com todas as opcionais removidas e checa o valor default.
     */
    const validateMinimal = (): { value: any; error: any } => {
      const env = buildValidEnv({
        NODE_ENV: undefined,
        PORT: undefined,
        JWT_ACCESS_EXPIRES_IN: undefined,
        JWT_REFRESH_EXPIRES_DAYS: undefined,
        REDIS_HOST: undefined,
        REDIS_PORT: undefined,
        CACHE_TTL: undefined,
        THROTTLER_SHORT_TTL: undefined,
        THROTTLER_SHORT_LIMIT: undefined,
        THROTTLER_MEDIUM_TTL: undefined,
        THROTTLER_MEDIUM_LIMIT: undefined,
        THROTTLER_LONG_TTL: undefined,
        THROTTLER_LONG_LIMIT: undefined,
        THROTTLER_SENSITIVE_TTL: undefined,
        THROTTLER_SENSITIVE_LIMIT: undefined,
        THROTTLER_SENSITIVE_LIMIT_FORGOT: undefined,
        THROTTLER_SENSITIVE_LIMIT_REFRESH: undefined,
        THROTTLER_SENSITIVE_LIMIT_RESET: undefined,
        TRUST_PROXY: undefined,
        FRONTEND_URL: undefined,
        PASSWORD_RESET_EXPIRES_MINUTES: undefined,
        EMAIL_NOTIFICATIONS_ENABLED: undefined,
        APP_NAME: undefined,
        APP_LOGIN_URL: undefined,
        EMAIL_NOTIFICATIONS_METRICS_ENABLED: undefined,
      });
      return envValidationSchema.validate(env);
    };

    it('NODE_ENV default = "development"', () => {
      const { value } = validateMinimal();
      expect(value.NODE_ENV).toBe('development');
    });

    it('PORT default = 3001', () => {
      const { value } = validateMinimal();
      expect(value.PORT).toBe(3001);
    });

    it('JWT_ACCESS_EXPIRES_IN default = "15m"', () => {
      const { value } = validateMinimal();
      expect(value.JWT_ACCESS_EXPIRES_IN).toBe('15m');
    });

    it('JWT_REFRESH_EXPIRES_DAYS default = 7', () => {
      const { value } = validateMinimal();
      expect(value.JWT_REFRESH_EXPIRES_DAYS).toBe(7);
    });

    it('REDIS_HOST default = "localhost"', () => {
      const { value } = validateMinimal();
      expect(value.REDIS_HOST).toBe('localhost');
    });

    it('REDIS_PORT default = 6379', () => {
      const { value } = validateMinimal();
      expect(value.REDIS_PORT).toBe(6379);
    });

    it('CACHE_TTL default = 600', () => {
      const { value } = validateMinimal();
      expect(value.CACHE_TTL).toBe(600);
    });

    it('THROTTLER_SHORT_TTL default = 1000', () => {
      const { value } = validateMinimal();
      expect(value.THROTTLER_SHORT_TTL).toBe(1000);
    });

    it('THROTTLER_SHORT_LIMIT default = 3', () => {
      const { value } = validateMinimal();
      expect(value.THROTTLER_SHORT_LIMIT).toBe(3);
    });

    it('THROTTLER_MEDIUM_TTL default = 10000', () => {
      const { value } = validateMinimal();
      expect(value.THROTTLER_MEDIUM_TTL).toBe(10000);
    });

    it('THROTTLER_MEDIUM_LIMIT default = 20', () => {
      const { value } = validateMinimal();
      expect(value.THROTTLER_MEDIUM_LIMIT).toBe(20);
    });

    it('THROTTLER_LONG_TTL default = 60000', () => {
      const { value } = validateMinimal();
      expect(value.THROTTLER_LONG_TTL).toBe(60000);
    });

    it('THROTTLER_LONG_LIMIT default = 100', () => {
      const { value } = validateMinimal();
      expect(value.THROTTLER_LONG_LIMIT).toBe(100);
    });

    it('THROTTLER_SENSITIVE_TTL default = 60000', () => {
      const { value } = validateMinimal();
      expect(value.THROTTLER_SENSITIVE_TTL).toBe(60000);
    });

    it('THROTTLER_SENSITIVE_LIMIT default = 10', () => {
      const { value } = validateMinimal();
      expect(value.THROTTLER_SENSITIVE_LIMIT).toBe(10);
    });

    it('TRUST_PROXY default = "loopback"', () => {
      const { value } = validateMinimal();
      expect(value.TRUST_PROXY).toBe('loopback');
    });

    it('FRONTEND_URL default = "http://localhost:3000"', () => {
      const { value } = validateMinimal();
      expect(value.FRONTEND_URL).toBe('http://localhost:3000');
    });

    it('PASSWORD_RESET_EXPIRES_MINUTES default = 60', () => {
      const { value } = validateMinimal();
      expect(value.PASSWORD_RESET_EXPIRES_MINUTES).toBe(60);
    });

    it('EMAIL_NOTIFICATIONS_ENABLED default = true', () => {
      const { value } = validateMinimal();
      expect(value.EMAIL_NOTIFICATIONS_ENABLED).toBe(true);
    });

    it('APP_NAME default = "API Padrão"', () => {
      const { value } = validateMinimal();
      expect(value.APP_NAME).toBe('API Padrão');
    });

    it('APP_LOGIN_URL default = "http://localhost:3000"', () => {
      const { value } = validateMinimal();
      expect(value.APP_LOGIN_URL).toBe('http://localhost:3000');
    });

    it('EMAIL_NOTIFICATIONS_METRICS_ENABLED default = false', () => {
      const { value } = validateMinimal();
      expect(value.EMAIL_NOTIFICATIONS_METRICS_ENABLED).toBe(false);
    });
  });

  describe('FRONTEND_URL / APP_LOGIN_URL — validação de URI', () => {
    it('retorna erro quando FRONTEND_URL não é URI válida', () => {
      const env = buildValidEnv({ FRONTEND_URL: 'not-a-valid-url' });
      const { error } = envValidationSchema.validate(env);

      expect(error).toBeDefined();
      expect(error?.details[0].type).toMatch(/uri/);
    });

    it('retorna erro quando APP_LOGIN_URL não é URI válida', () => {
      const env = buildValidEnv({ APP_LOGIN_URL: 'not a url at all' });
      const { error } = envValidationSchema.validate(env);

      expect(error).toBeDefined();
      expect(error?.details[0].type).toMatch(/uri/);
    });

    it('aceita FRONTEND_URL https', () => {
      const env = buildValidEnv({ FRONTEND_URL: 'https://app.example.com' });
      const { value, error } = envValidationSchema.validate(env);

      expect(error).toBeUndefined();
      expect(value.FRONTEND_URL).toBe('https://app.example.com');
    });
  });

  describe('PASSWORD_RESET_EXPIRES_MINUTES — min(1)', () => {
    it('retorna erro quando PASSWORD_RESET_EXPIRES_MINUTES = 0', () => {
      const env = buildValidEnv({ PASSWORD_RESET_EXPIRES_MINUTES: '0' });
      const { error } = envValidationSchema.validate(env);

      expect(error).toBeDefined();
      expect(error?.details[0].type).toBe('number.min');
    });

    it('aceita PASSWORD_RESET_EXPIRES_MINUTES = 1', () => {
      const env = buildValidEnv({ PASSWORD_RESET_EXPIRES_MINUTES: '1' });
      const { value, error } = envValidationSchema.validate(env);

      expect(error).toBeUndefined();
      expect(value.PASSWORD_RESET_EXPIRES_MINUTES).toBe(1);
    });
  });

  describe('ALLOWED_ORIGINS — opcional', () => {
    it('valida sem ALLOWED_ORIGINS quando ausente', () => {
      const env = buildValidEnv({ ALLOWED_ORIGINS: undefined });
      const { value, error } = envValidationSchema.validate(env);

      expect(error).toBeUndefined();
      // Joi omite chaves com valor undefined e sem default
      expect(value.ALLOWED_ORIGINS).toBeUndefined();
    });

    it('aceita ALLOWED_ORIGINS quando presente', () => {
      const env = buildValidEnv({
        ALLOWED_ORIGINS: 'http://a.com,http://b.com',
      });
      const { value, error } = envValidationSchema.validate(env);

      expect(error).toBeUndefined();
      expect(value.ALLOWED_ORIGINS).toBe('http://a.com,http://b.com');
    });
  });

  describe('OTEL_EXPORTER_OTLP_ENDPOINT — conditional por NODE_ENV', () => {
    it('em production, aceita https://', () => {
      const env = buildValidEnv({
        NODE_ENV: 'production',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel.example.com',
      });
      const { value, error } = envValidationSchema.validate(env);

      expect(error).toBeUndefined();
      expect(value.OTEL_EXPORTER_OTLP_ENDPOINT).toBe(
        'https://otel.example.com',
      );
    });

    it('em production, rejeita http:// (PII em cleartext)', () => {
      const env = buildValidEnv({
        NODE_ENV: 'production',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel.example.com',
      });
      const { error } = envValidationSchema.validate(env);

      expect(error).toBeDefined();
      // mensagem custom de segurança
      expect(error?.message).toMatch(/https/);
    });

    it('em production, OTEL endpoint é obrigatório', () => {
      const env = buildValidEnv({
        NODE_ENV: 'production',
        OTEL_EXPORTER_OTLP_ENDPOINT: undefined,
      });
      const { error } = envValidationSchema.validate(env);

      expect(error).toBeDefined();
      expect(error?.details[0].type).toBe('any.required');
    });

    it('em development, aceita http:// para collector local', () => {
      const env = buildValidEnv({
        NODE_ENV: 'development',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
      });
      const { value, error } = envValidationSchema.validate(env);

      expect(error).toBeUndefined();
      expect(value.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://localhost:4318');
    });

    it('em development, OTEL endpoint é opcional', () => {
      const env = buildValidEnv({
        NODE_ENV: 'development',
        OTEL_EXPORTER_OTLP_ENDPOINT: undefined,
      });
      const { error } = envValidationSchema.validate(env);

      expect(error).toBeUndefined();
    });

    it('em test, aceita http://', () => {
      const env = buildValidEnv({
        NODE_ENV: 'test',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector.test:4318',
      });
      const { error } = envValidationSchema.validate(env);

      expect(error).toBeUndefined();
    });
  });
});
