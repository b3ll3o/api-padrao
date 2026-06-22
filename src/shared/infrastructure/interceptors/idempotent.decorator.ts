// BDD: N/A (cross-cutting / infraestrutura)
// SDD: .openspec/changes/observabilidade/cross-cutting.md:REQ-CC-IDEMPOTENT-001
// TDD: src/shared/infrastructure/interceptors/idempotent.decorator.spec.ts
// [REQ-CC-IDEMPOTENT-001.6] Decorator opt-in para marcar endpoints que
// devem aplicar idempotency. O IdempotencyInterceptor verifica esta
// metadata via Reflector e ativa o lock+cache apenas em rotas
// decoradas. Aplicação global (sem decorator) tem custo de cache.get
// em todo request — esta abordagem permite controle fino.

import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT_KEY = 'idempotent:enabled';

export interface IdempotentOptions {
  /**
   * Override do TTL em segundos para este endpoint específico.
   * Quando omitido, usa `AppConfig.idempotencyTtlSeconds` (24h default).
   */
  ttlSeconds?: number;
}

/**
 * Marca um endpoint como idempotente. O `IdempotencyInterceptor` lerá
 * esta metadata e ativará o lock+cache apenas em controllers/métodos
 * decorados. Para ativar globalmente, remova a checagem de metadata
 * do interceptor (não recomendado — performance hit em todo request).
 *
 * @example
 * ```ts
 * @Post('forgot-password')
 * @Idempotent()
 * async forgotPassword(...) {}
 *
 * // Ou com TTL custom (e.g. token de reset expira em 1h):
 * @Post('reset-password')
 * @Idempotent({ ttlSeconds: 3600 })
 * async resetPassword(...) {}
 * ```
 */
export const Idempotent = (options?: IdempotentOptions) =>
  SetMetadata(IDEMPOTENT_KEY, options ?? { ttlSeconds: undefined });
