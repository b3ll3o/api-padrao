// BDD: N/A (cross-cutting / infraestrutura)
// SDD: .openspec/changes/observabilidade/cross-cutting.md:REQ-CC-IDEMPOTENT-001
// TDD: src/shared/infrastructure/interceptors/idempotency.interceptor.spec.ts
// Status atual (A4 — Idempotency 2026-06-22):
//   1.1 (extrai X-Idempotency-Key) ✅
//   1.2 (cache only 2xx) ✅
//   1.2b (atomicidade Redis SETNX) ✅
//   1.3 (TTL configurável via AppConfig) ✅
//   1.4 (cache hit replay) ✅
//   1.5 (auditoria de replay) ✅
//   1.6 (ativação via @Idempotent() decorator) ✅

import {
  BadRequestException,
  Inject,
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Reflector } from '@nestjs/core';
import { Observable, of, from } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { Cache } from 'cache-manager';
import type { RedisClientType } from '@redis/client';
import { Request } from 'express';

import { AppConfig } from '../config/app.config';
import { IDEMPOTENT_KEY, IdempotentOptions } from './idempotent.decorator';

/**
 * [SEC-007] Idempotency-Key — Em retries de rede (cliente recebe
 * timeout mas servidor processou), o cliente pode acabar criando
 * 2 recursos (2 usuários, 2 cobranças). Solução padrão de mercado
 * (Stripe, PayPal): aceitar header `Idempotency-Key` (UUID v4) e
 * cachear a primeira response por 24h. Replays retornam a response
 * cacheada com header `Idempotency-Replayed: true`.
 *
 * Atomicidade (REQ-CC-IDEMPOTENT-001.2b): duas requisições com a
 * mesma `Idempotency-Key` podem chegar simultaneamente. Sem lock,
 * ambas passariam pelo `cache.get()` miss e executariam o handler
 * em paralelo — duplicação. Solução: lock distribuído via
 * `SET key value NX EX <ttl>` (SETNX atômico do Redis) durante o
 * processamento. A 2ª request recebe 400 até a 1ª terminar.
 *
 * Ativação (REQ-CC-IDEMPOTENT-001.6): opt-in via decorator
 * `@Idempotent()`. Endpoints sem decorator são no-op (sem custo
 * de cache.get). Decorator aceita override de TTL por endpoint.
 *
 * TTL (REQ-CC-IDEMPOTENT-001.3): configurável via `AppConfig`
 * (env IDEMPOTENCY_TTL_SECONDS, default 24h). Lock TTL separado
 * (env IDEMPOTENCY_LOCK_TTL_SECONDS, default 60s).
 *
 * Auditoria de replay (REQ-CC-IDEMPOTENT-001.5): toda vez que uma
 * response é servida do cache, emite log estruturado com
 * `event: 'idempotency.replay'` (key, status, userId, originalTimestamp).
 * Permite reconstruir auditoria de retries B2B sem acesso a logs
 * de aplicação brutos.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private static readonly logger = new Logger(IdempotencyInterceptor.name);
  private static readonly KEY_PREFIX = 'idempotency:';
  private static readonly LOCK_PREFIX = 'idem:lock:';

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly appConfig: AppConfig,
    private readonly reflector: Reflector,
  ) {}

  private get RESULT_TTL_MS(): number {
    return this.appConfig.idempotencyTtlSeconds * 1000;
  }

  private get LOCK_TTL_SECONDS(): number {
    return this.appConfig.idempotencyLockTtlSeconds;
  }

  /**
   * Acessa o cliente Redis subjacente ao `CacheManager`. O store
   * `cache-manager-redis-yet` expõe `store.client` (RedisClientType).
   * Caso o cache esteja degradado (sem Redis), retorna `null` e o
   * interceptor cai no caminho sem lock (fail-open: melhor do que
   * bloquear a request por indisponibilidade operacional).
   */
  private getRedisClient(): RedisClientType | null {
    const cacheAny = this.cache as unknown as {
      stores?: Array<{ client?: RedisClientType }>;
      store?: { client?: RedisClientType };
    };
    return cacheAny.stores?.[0]?.client ?? cacheAny.store?.client ?? null;
  }

  /**
   * Extrai userId do JWT injetado pelo AuthGuard. Retorna undefined
   * para rotas @Public() (request.user não é populado).
   */
  private getUserId(request: Request): string | number | undefined {
    const user = (request as unknown as { user?: { sub?: string | number } })
      .user;
    return user?.sub;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // [REQ-CC-IDEMPOTENT-001.6] Opt-in: só ativa em endpoints com
    // @Idempotent(). Endpoints sem decorator são no-op (zero overhead).
    const idempotentMeta = this.reflector.getAllAndOverride<IdempotentOptions>(
      IDEMPOTENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!idempotentMeta) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse();

    const idempotencyKey = request.headers['idempotency-key'] as
      | string
      | undefined;

    if (!idempotencyKey) {
      return next.handle();
    }

    // Validação simples do header (RFC sugere 1-255 chars alfanumérico+).
    // Não bloqueamos formato aqui — clientes podem usar UUIDs, ULIDs, etc.
    if (idempotencyKey.length < 8 || idempotencyKey.length > 255) {
      return next.handle();
    }

    const cacheKey = `${IdempotencyInterceptor.KEY_PREFIX}${idempotencyKey}`;
    const lockKey = `${IdempotencyInterceptor.LOCK_PREFIX}${idempotencyKey}`;
    const redis = this.getRedisClient();

    // Override de TTL por endpoint (decorator @Idempotent({ttlSeconds}))
    const endpointTtlMs = idempotentMeta.ttlSeconds
      ? idempotentMeta.ttlSeconds * 1000
      : this.RESULT_TTL_MS;
    const userId = this.getUserId(request);

    return from(
      this.cache.get<{
        status: number;
        body: unknown;
        timestamp: Date;
        userId?: string | number;
      }>(cacheKey),
    ).pipe(
      switchMap(async (cached) => {
        if (cached) {
          // [REQ-CC-IDEMPOTENT-001.5] Auditoria de replay — log estruturado
          // com event canônico + dados suficientes para reconstruir auditoria
          // (key, status, userId, originalTimestamp). Permite distinguir
          // retries de rede (replay legítimo) de comportamento suspeito
          // (mesma key com userIds diferentes → tampering).
          IdempotencyInterceptor.logger.log(
            {
              event: 'idempotency.replay',
              idempotencyKey,
              status: cached.status,
              userId: cached.userId ?? userId,
              originalTimestamp:
                cached.timestamp instanceof Date
                  ? cached.timestamp.toISOString()
                  : String(cached.timestamp),
              currentUserId: userId,
            },
            `Idempotency-Key ${idempotencyKey} replay (status ${cached.status})`,
          );

          response.setHeader('Idempotency-Replayed', 'true');
          if (cached.timestamp instanceof Date) {
            response.setHeader(
              'Idempotency-Original-Timestamp',
              cached.timestamp.toISOString(),
            );
          }
          response.status(cached.status);
          return { __replay: true as const, body: cached.body };
        }

        // Cache miss: tentar adquirir lock atômico (SETNX) antes
        // de processar. Se Redis indisponível, degrada para o
        // caminho sem lock (fail-open).
        if (redis) {
          try {
            const acquired = await redis.set(lockKey, 'processing', {
              NX: true,
              EX: this.LOCK_TTL_SECONDS,
            });
            if (acquired !== 'OK') {
              IdempotencyInterceptor.logger.warn({
                event: 'idempotency.lock_contention',
                idempotencyKey,
              });
              throw new BadRequestException({
                statusCode: 400,
                error: 'Idempotency In Progress',
                message:
                  'Uma requisição com esta Idempotency-Key está em andamento. Aguarde.',
              });
            }
          } catch (err) {
            if (err instanceof BadRequestException) throw err;
            // Falha não relacionada ao lock contention: degrada para
            // sem-lock (fail-open) — falhas do Redis não devem
            // bloquear requests de negócio.
            IdempotencyInterceptor.logger.warn({
              event: 'idempotency.lock_unavailable',
              error: (err as Error).message,
            });
          }
        }

        return { __replay: false as const };
      }),
      switchMap((gate) => {
        if (gate.__replay) {
          return of(gate.body);
        }

        return next.handle().pipe(
          tap((body) => {
            const status = response.statusCode;
            // Só cacheia respostas 2xx (sucesso) — 4xx/5xx podem ser
            // retentados legitimamente (e.g. transient 5xx).
            if (status >= 200 && status < 300) {
              this.cache
                .set(
                  cacheKey,
                  { status, body, timestamp: new Date(), userId },
                  endpointTtlMs,
                )
                .catch((err) => {
                  IdempotencyInterceptor.logger.warn(
                    { event: 'idempotency.cache_write_failed', err },
                    'Falha ao cachear response idempotente',
                  );
                });
            }
          }),
          catchError(async (err) => {
            // Libera lock em caso de erro — permite retry do cliente.
            if (redis) {
              try {
                await redis.del(lockKey);
              } catch (delErr) {
                IdempotencyInterceptor.logger.warn({
                  event: 'idempotency.lock_release_failed',
                  error: (delErr as Error).message,
                });
              }
            }
            throw err;
          }),
          tap({
            next: () => {
              // Sucesso: libera lock (TTL na response cacheada
              // cobre replay; lock só serve para serializar execução).
              if (redis) {
                redis.del(lockKey).catch((delErr: Error) => {
                  IdempotencyInterceptor.logger.warn({
                    event: 'idempotency.lock_release_failed',
                    error: delErr.message,
                  });
                });
              }
            },
          }),
        );
      }),
    );
  }
}
