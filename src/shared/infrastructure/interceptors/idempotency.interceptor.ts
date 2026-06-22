// BDD: N/A (cross-cutting / infraestrutura)
// SDD: .openspec/changes/observabilidade/cross-cutting.md:REQ-CC-IDEMPOTENT-001
// TDD: src/shared/infrastructure/interceptors/idempotency.interceptor.spec.ts
// [WIP] Status: PARCIALMENTE IMPLEMENTADO. REQ-CC-IDEMPOTENT-001
// (observabilidade/cross-cutting.md) documenta 6 sub-REQs; apenas 1.1
// (extrai X-Idempotency-Key) e 1.4 (cache hit) estão completos. Faltam:
// 1.2 (atomicidade Redis SETNX), 1.3 (TTL configurável), 1.5 (replay
// determinístico), 1.6 (métricas). Próximo sprint: devsecops-sprint-2.

import {
  Inject,
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Observable, of, from } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { Cache } from 'cache-manager';
import { Request } from 'express';

/**
 * [SEC-007] Idempotency-Key — Em retries de rede (cliente recebe
 * timeout mas servidor processou), o cliente pode acabar criando
 * 2 recursos (2 usuários, 2 cobranças). Solução padrão de mercado
 * (Stripe, PayPal): aceitar header `Idempotency-Key` (UUID v4) e
 * cachear a primeira response por 24h. Replays retornam a response
 * cacheada com header `Idempotency-Replayed: true`.
 *
 * Aplicar em POSTs sensíveis (auth, billing, criação de recursos).
 * Se o header não for enviado, o interceptor é no-op (comportamento
 * padrão preservado).
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private static readonly logger = new Logger(IdempotencyInterceptor.name);
  private static readonly TTL_MS = 24 * 60 * 60 * 1000; // 24h
  private static readonly KEY_PREFIX = 'idempotency:';

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

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

    return from(
      this.cache.get<{ status: number; body: unknown }>(cacheKey),
    ).pipe(
      switchMap((cached) => {
        if (cached) {
          IdempotencyInterceptor.logger.debug(
            `Idempotency-Key ${idempotencyKey} replay (status ${cached.status})`,
          );
          response.setHeader('Idempotency-Replayed', 'true');
          response.status(cached.status);
          return of(cached.body);
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
        );
      }),
    );
  }
}
