// BDD: features/observabilidade.feature:Cenário: Métricas RED por endpoint
// SDD: .openspec/changes/observabilidade/design.md:REQ-METRICS-001..005
// ATDD: test/metrics.e2e-spec.ts
// TDD: src/shared/infrastructure/metrics/http-metrics.interceptor.spec.ts
//
// Interceptor que mede RATE/ERRORS/DURATION (RED) por request HTTP.
// Implementação do padrão Prometheus: instrumenta TODOS os endpoints
// automaticamente (exceto /metrics e /health que geram ruído).
//
// Labels:
//   method: GET, POST, PUT, DELETE, PATCH
//   route:  path do controller (ex: /api/v1/usuarios/:id) — NUNCA a URL crua
//           (cardinalidade explodiria com IDs aleatórios na URL).
//   status: código HTTP numérico (200, 404, 500, ...)
//
// Roteamento: usa `request.route?.path` (set pelo NestJS) com fallback para
// `request.url` se indefinido (ex.: rotas 404 não roteadas).

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MetricsRegistry } from './registry';

// Endpoints que não devem ser medidos (health, metrics em si —
// geram tráfego sintético e poluem séries temporais)
const EXCLUDED_PATHS = new Set(['/health', '/metrics', '/']);

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly registry: MetricsRegistry) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpCtx = context.switchToHttp();
    const req = httpCtx.getRequest();
    const res = httpCtx.getResponse();

    const rawPath: string = req?.originalUrl ?? req?.url ?? 'unknown';
    const pathOnly = rawPath.split('?')[0]; // strip query string
    if (EXCLUDED_PATHS.has(pathOnly)) {
      return next.handle();
    }

    const method = String(req?.method ?? 'UNKNOWN').toUpperCase();
    // Preferir route.path (parametrizado) para evitar cardinalidade infinita
    const route: string = req?.route?.path ?? pathOnly;
    const start = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => this.observe(method, route, res?.statusCode ?? 0, start),
        error: () => this.observe(method, route, res?.statusCode ?? 500, start),
      }),
    );
  }

  private observe(
    method: string,
    route: string,
    statusCode: number,
    start: bigint,
  ): void {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;
    const labels = { method, route, status: String(statusCode) };
    this.registry.httpRequests.inc(1, labels);
    this.registry.httpDurationMs.observe(durationMs, labels);
    if (statusCode >= 400) {
      this.registry.httpErrors.inc(1, labels);
    }
  }
}
