// BDD: features/autenticacao.feature
// SDD: .openspec/changes/auth/design.md
// ATDD: test/auth.e2e-spec.ts
// TDD: src/auth/infrastructure/services/cache-login-attempt-tracker.service.spec.ts

import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { LoginAttemptTracker } from '../../domain/services/login-attempt-tracker.service';

/**
 * Adapter Redis (via `cache-manager-redis-yet`) para `LoginAttemptTracker`.
 *
 * Estratégia:
 * - Chave: `auth:login:attempts:<email>`.
 * - TTL: 900s (15 min) — mesma janela do lockout.
 * - Limite: 5 tentativas (constante abaixo, configurável futuramente).
 *
 * Em caso de falha no Redis, degrada **aberta** (não bloqueia) — o
 * throttler global por IP continua protegendo contra abuso de massa.
 */
// BDD: features/autenticacao.feature:Cenário: Bloquear após N tentativas
@Injectable()
export class CacheLoginAttemptTracker extends LoginAttemptTracker {
  private readonly logger = new Logger(CacheLoginAttemptTracker.name);
  private static readonly MAX_ATTEMPTS = 5;
  private static readonly LOCK_TTL_MS = 15 * 60 * 1000; // 15 minutos
  private static readonly KEY_PREFIX = 'auth:login:attempts:';

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {
    super();
  }

  private key(email: string): string {
    return `${CacheLoginAttemptTracker.KEY_PREFIX}${email.toLowerCase()}`;
  }

  async isLocked(email: string): Promise<boolean> {
    try {
      const value = await this.cache.get<number>(this.key(email));
      return (
        typeof value === 'number' &&
        value >= CacheLoginAttemptTracker.MAX_ATTEMPTS
      );
    } catch (err) {
      // Falha no Redis → fail-open. Throttler global por IP + monitoring
      // ainda protegem.
      this.logger.warn(
        {
          event: 'login_attempt_tracker.cache_offline',
          error: (err as Error).message,
        },
        'Falha ao consultar lockout — liberando',
      );
      return false;
    }
  }

  async recordFailure(email: string): Promise<void> {
    const key = this.key(email);
    try {
      const current = (await this.cache.get<number>(key)) ?? 0;
      const next = current + 1;
      await this.cache.set(key, next, CacheLoginAttemptTracker.LOCK_TTL_MS);
      this.logger.warn(
        {
          event: 'login_attempt_tracker.failure_recorded',
          email,
          tentativas: next,
          max: CacheLoginAttemptTracker.MAX_ATTEMPTS,
        },
        'Tentativa de login falha registrada',
      );
    } catch (err) {
      this.logger.warn(
        {
          event: 'login_attempt_tracker.cache_set_failed',
          error: (err as Error).message,
        },
        'Falha ao registrar tentativa — ignorando',
      );
    }
  }

  async clearFailures(email: string): Promise<void> {
    try {
      await this.cache.del(this.key(email));
    } catch (err) {
      this.logger.warn(
        {
          event: 'login_attempt_tracker.cache_del_failed',
          error: (err as Error).message,
        },
        'Falha ao limpar tentativas — ignorando',
      );
    }
  }
}
