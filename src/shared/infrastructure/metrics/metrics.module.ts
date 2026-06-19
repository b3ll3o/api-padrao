// BDD: features/observabilidade.feature:Cenário: /metrics exposto em text/plain
// SDD: .openspec/changes/observabilidade/design.md:REQ-METRICS-001..005
// ATDD: test/metrics.e2e-spec.ts
// TDD: src/shared/infrastructure/metrics/metrics.module.spec.ts
import { Global, Module } from '@nestjs/common';
import { MetricsRegistry } from './registry';
import { MetricsController } from './metrics.controller';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';

/**
 * Módulo de métricas RED-USE.
 *
 * `@Global()` para que `MetricsRegistry` esteja disponível em toda a
 * aplicação sem precisar importar este módulo em cada feature.
 *
 * O `HttpMetricsInterceptor` é provider AQUI, mas registrado como
 * `APP_INTERCEPTOR` em `main.ts` (uma vez só no boot).
 */
@Global()
@Module({
  providers: [MetricsRegistry, HttpMetricsInterceptor],
  controllers: [MetricsController],
  exports: [MetricsRegistry, HttpMetricsInterceptor],
})
export class MetricsModule {}
