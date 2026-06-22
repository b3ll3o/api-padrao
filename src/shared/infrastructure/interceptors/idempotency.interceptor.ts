// BDD: N/A (cross-cutting / infraestrutura)
// SDD: .openspec/changes/observabilidade/cross-cutting.md:REQ-CC-IDEMPOTENT-001
// TDD: src/shared/infrastructure/interceptors/idempotency.interceptor.spec.ts
// [WIP] Status: PARCIALMENTE IMPLEMENTADO. REQ-CC-IDEMPOTENT-001
// (observabilidade/cross-cutting.md) documenta 6 sub-REQs; 1.1 (extrai
// X-Idempotency-Key), 1.2 (cache only 2xx), 1.4 (cache hit), e
// 1.2b (atomicidade Redis SETNX) estão completos. Faltam:
// 1.3 (TTL configurável), 1.5 (auditoria de replay), 1.6 (ativação).
// Próximo sprint: devsecops-sprint-2.

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
import { Observable, of, from } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { Cache } from 'cache-manager';
import type { RedisClientType } from '@redis/client';
import { Request } from 'express';

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
 * Aplicar em POSTs sensíveis (auth, billing, criação de recursos).
 * Se o header não for enviado, o interceptor é no-op (comportamento
 * padrão preservado).
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private static readonly logger = new Logger(IdempotencyInterceptor.name);
  private static readonly TTL_MS = 24 * 60 * 60 * 1000; // 24h
  private static readonly LOCK_TTL_SECONDS = 60; // lock de processamento
  private static readonly KEY_PREFIX = 'idempotency:';
  private static readonly LOCK_PREFIX = 'idem:lock:';

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

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

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
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

    return from(
      this.cache.get<{ status: number; body: unknown }>(cacheKey),
    ).pipe(
      switchMap(async (cached) => {
        if (cached) {
          IdempotencyInterceptor.logger.debug(
            `Idempotency-Key ${idempotencyKey} replay (status ${cached.status})`,
          );
          response.setHeader('Idempotency-Replayed', 'true');
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
              EX: IdempotencyInterceptor.LOCK_TTL_SECONDS,
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
                .set(cacheKey, { status, body }, IdempotencyInterceptor.TTL_MS)
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
              // Sucesso: libera lock (TTL de 24h na response cacheada
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
