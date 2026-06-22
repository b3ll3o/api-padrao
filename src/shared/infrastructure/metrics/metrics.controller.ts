// BDD: features/observabilidade.feature:Cenário: /metrics exposto em text/plain
// SDD: .openspec/changes/observabilidade/design.md:REQ-METRICS-001
// ATDD: test/metrics.e2e-spec.ts
// TDD: src/shared/infrastructure/metrics/metrics.controller.spec.ts
//
// Endpoint `GET /metrics` que devolve a serialização Prometheus 0.0.4
// em `text/plain; version=0.0.4; charset=utf-8` (Content-Type oficial
// da especificação Prometheus exposition format).
//
// Protegido por guard? NÃO — Prometheus scrapers (Prometheus, VictoriaMetrics,
// Grafana Agent, Datadog Agent) não conhecem o JWT. Se expor publicamente,
// colocar atrás de um firewall que limite IPs (rede interna, ingress nginx).
// O endpoint atual pressupõe acesso restrito por infra.

import { Controller, Get, Header, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { Public } from '../../../auth/application/decorators/public.decorator';
import { MetricsRegistry } from './registry';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly registry: MetricsRegistry) {}

  /**
   * Retorna o snapshot atual de todas as métricas no formato
   * Prometheus 0.0.4 text-based exposition.
   *
   * Importante: este endpoint é INTENCIONALMENTE sem @Throttle — scrapers
   * legítimos fazem polling a cada 15-60s e não devem ser bloqueados.
   * @Public() para que AuthGuard/PermissaoGuard não exijam JWT
   * (Prometheus scrapers não conhecem JWT).
   *
   * [SEC-RATE-LIMIT] Rota @Public() (Prometheus scraper sem JWT).
   *   Rate-limit aplicado: TenantThrottlerGuard global (plano FREE fallback ip:<ip>).
   *   Sem @Throttle explícito — scrapers legítimos fazem polling a cada 15-60s.
   *   Se expor publicamente, restringir por firewall/IP allowlist (rede interna/ingress).
   *   Em NODE_ENV=test, PLANO_LIMITS é inflado para 10_000 (não bloqueia e2e).
   */
  @Public()
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async getMetrics(
    @Res({ passthrough: false }) res: FastifyReply,
  ): Promise<string> {
    // Snapshot de gauges dinâmicos antes de serializar
    this.refreshDynamicGauges();
    const body = this.registry.serialize();
    // Garantir Content-Type correto em ambos adapters (Fastify/Express)
    res.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(body);
    return body;
  }

  /**
   * Atualiza gauges dinâmicos (memória processo) antes de cada scrape.
   * Demais gauges (prisma pool, bull queue) são atualizados pelos próprios
   * serviços de domínio em pontos de uso, não a cada scrape.
   */
  private refreshDynamicGauges(): void {
    const mem = process.memoryUsage();
    this.registry.processResidentMb.set(Math.round(mem.rss / (1024 * 1024)));
  }
}
