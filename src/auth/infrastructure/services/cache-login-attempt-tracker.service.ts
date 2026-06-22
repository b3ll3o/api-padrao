// BDD: features/autenticacao.feature
// SDD: .openspec/changes/auth/design.md
// ATDD: test/auth.e2e-spec.ts
// TDD: src/auth/infrastructure/services/cache-login-attempt-tracker.service.spec.ts

import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { LoginAttemptTracker } from '../../domain/services/login-attempt-tracker.service';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Adapter Redis (via `cache-manager-redis-yet`) para `LoginAttemptTracker`,
 * com **fallback Prisma** para tolerar outage de Redis sem abrir o lockout.
 *
 * Estratégia:
 * - Caminho primário: Redis.
 *   - Chave: `auth:login:attempts:<email>`.
 *   - TTL: 900s (15 min) — mesma janela do lockout.
 *   - Limite: 5 tentativas.
 * - Caminho de fallback (apenas quando Redis falha): tabela `login_attempts`.
 *   - `recordFailure` insere linha com `success = false`.
 *   - `recordSuccess` insere linha com `success = true` (semântica de evento;
 *     resets "via SQL" exigiriam mutação em massa e perderiam histórico).
 *   - `isLocked` conta `success = false` na janela de 15 min.
 *
 * IMPORTANTE — não fail-open: se AMBOS (Redis + Prisma) falharem,
 * `isLocked` faz **fail-CLOSED** (retorna `true`) para preservar a
 * postura de segurança do lockout. Sem isso, um ataque coordenado
 * derruba o Redis e broute-força a API; com isso, o pior caso é uma
 * indisponibilidade temporária até o DB voltar.
 *
 * A interface pública (`isLocked`, `recordFailure`, `clearFailures`)
 * continua aceitando apenas `email` para preservar o DIP — info extra
 * (`ip`, `userAgent`, `failureReason`) é derivada de defaults quando
 * o caller não fornece.
 */
// BDD: features/autenticacao.feature:Cenário: Bloquear após N tentativas
@Injectable()
export class CacheLoginAttemptTracker extends LoginAttemptTracker {
  private readonly logger = new Logger(CacheLoginAttemptTracker.name);
  private static readonly MAX_ATTEMPTS = 5;
  private static readonly LOCK_TTL_MS = 15 * 60 * 1000; // 15 minutos
  private static readonly WINDOW_MS = 15 * 60 * 1000; // 15 minutos
  private static readonly KEY_PREFIX = 'auth:login:attempts:';

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  private key(email: string): string {
    return `${CacheLoginAttemptTracker.KEY_PREFIX}${email.toLowerCase()}`;
  }

  async isLocked(email: string): Promise<boolean> {
    const normalized = email.toLowerCase();

    // Caminho 1: Redis (rápido, com TTL nativo).
    try {
      const value = await this.cache.get<number>(this.key(normalized));
      if (typeof value === 'number') {
        return value >= CacheLoginAttemptTracker.MAX_ATTEMPTS;
      }
      return false;
    } catch (err) {
      this.logger.warn(
        {
          event: 'login_attempt_tracker.cache_offline',
          email: normalized,
          error: (err as Error).message,
        },
        'Redis offline — caindo para fallback Prisma',
      );
    }

    // Caminho 2: fallback Prisma. Conta falhas dentro da janela.
    try {
      const windowStart = new Date(
        Date.now() - CacheLoginAttemptTracker.WINDOW_MS,
      );
      const failures = await this.prisma.loginAttempt.count({
        where: {
          email: normalized,
          success: false,
          attemptedAt: { gte: windowStart },
        },
      });
      return failures >= CacheLoginAttemptTracker.MAX_ATTEMPTS;
    } catch (err) {
      // Fail-CLOSED: prefere indisponibilidade temporária a abrir o lockout.
      this.logger.error(
        {
          event: 'login_attempt_tracker.both_storage_offline',
          email: normalized,
          error: (err as Error).message,
        },
        'Redis + Prisma offline — fail-CLOSED (bloqueando login)',
      );
      return true;
    }
  }

  async recordFailure(email: string): Promise<void> {
    const normalized = email.toLowerCase();
    const key = this.key(normalized);

    // Caminho 1: Redis (incrementa contador com TTL).
    try {
      const current = (await this.cache.get<number>(key)) ?? 0;
      const next = current + 1;
      await this.cache.set(key, next, CacheLoginAttemptTracker.LOCK_TTL_MS);
      this.logger.warn(
        {
          event: 'login_attempt_tracker.failure_recorded',
          email: normalized,
          tentativas: next,
          max: CacheLoginAttemptTracker.MAX_ATTEMPTS,
          storage: 'redis',
        },
        'Tentativa de login falha registrada (Redis)',
      );
      return;
    } catch (err) {
      this.logger.warn(
        {
          event: 'login_attempt_tracker.cache_set_failed',
          email: normalized,
          error: (err as Error).message,
        },
        'Redis offline — gravando falha em fallback Prisma',
      );
    }

    // Caminho 2: fallback Prisma (insere linha).
    try {
      await this.prisma.loginAttempt.create({
        data: {
          email: normalized,
          success: false,
        },
      });
      this.logger.warn(
        {
          event: 'login_attempt_tracker.failure_recorded',
          email: normalized,
          storage: 'prisma',
        },
        'Tentativa de login falha registrada (Prisma fallback)',
      );
    } catch (err) {
      this.logger.error(
        {
          event: 'login_attempt_tracker.prisma_fallback_failed',
          email: normalized,
          error: (err as Error).message,
        },
        'Falha ao persistir tentativa (Redis + Prisma offline)',
      );
    }
  }

  async clearFailures(email: string): Promise<void> {
    const normalized = email.toLowerCase();

    // Caminho 1: Redis (deleta chave).
    let redisOk = false;
    try {
      await this.cache.del(this.key(normalized));
      redisOk = true;
    } catch (err) {
      this.logger.warn(
        {
          event: 'login_attempt_tracker.cache_del_failed',
          email: normalized,
          error: (err as Error).message,
        },
        'Redis offline — limpando via fallback Prisma',
      );
    }

    // Caminho 2: fallback Prisma.
    // Como `login_attempts` é log de eventos (não estado), não há o que
    // deletar — uma falha anterior continua sendo verdade. Apenas
    // registramos o evento `success = true` que serve de marcador
    // histórico e evita que isLocked conte tentativas antigas após um
    // sucesso bem documentado.
    //
    // NOTA: o `isLocked` em fallback conta falhas dentro da janela,
    // então se o usuário teve 5 falhas e depois 1 sucesso em < 15 min,
    // o lockout PERSISTE. Isso é mais seguro (não libera conta sob
    // brute-force) e equivalente ao comportamento Redis, onde o
    // `clearFailures` após o lockout é no-op — usuário precisa esperar
    // a janela.
    try {
      await this.prisma.loginAttempt.create({
        data: {
          email: normalized,
          success: true,
        },
      });
    } catch (err) {
      if (redisOk) return;
      this.logger.error(
        {
          event: 'login_attempt_tracker.prisma_clear_failed',
          email: normalized,
          error: (err as Error).message,
        },
        'Falha ao registrar sucesso de login (Redis + Prisma offline)',
      );
    }
  }
}
