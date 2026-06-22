// BDD: features/usuarios.feature:Cenário: Rate limit respeita empresaId do JWT
// SDD: .openspec/changes/tenant-rate-limit/design.md:REQ-TR-002..008
// ATDD: test/tenant-rate-limit.e2e-spec.ts
import { Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerStorage,
  InjectThrottlerStorage,
  InjectThrottlerOptions,
  ThrottlerModuleOptions,
} from '@nestjs/throttler';
import { Plano } from '@prisma/client';
import { PlanoService } from './plano.service';
import { PLANO_LIMITS, DEFAULT_PLANO, PlanoTier } from './plano-limits.config';

@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(TenantThrottlerGuard.name);

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private planoService: PlanoService,
  ) {
    super(options, storageService, reflector);
  }

  /**
   * Tenant-aware tracker: usa `empresaId` (exclusivamente do JWT validado
   * pelo `AuthGuard`) como chave de throttling. Se não houver tenant
   * identificado (rota pública sem JWT), cai para IP (preserva throttling
   * por origem e compatibilidade com health checks, métricas etc.).
   *
   * Ordem de prioridade (NFR-TR-004 — server-side only, NUNCA aceita
   * identificador de tenant de header client-controlled):
   * 1. `request.user.empresaId` (do JWT, set pelo JwtStrategy.validate)
   * 2. `request.user.empresas?.[0]?.id` (multi-tenant JWT — JwtStrategy
   *    popula `empresas[]` a partir do payload; o primeiro é o tenant ativo)
   * 3. Fallback: `ip:<ip>` (rota pública — `@Public()` decorada ou health/
   *    metrics endpoints; sem JWT, NÃO confiamos em `x-empresa-id`).
   *
   * [SECURITY-FIX M2 — DevSecOps sweep 2026-06-21] O header `x-empresa-id`
   * foi REMOVIDO da resolução de tenant. Em rotas públicas (que não passam
   * pelo `AuthGuard`), um atacante poderia falsificar o header para (a)
   * fazer throttling cair sobre outra empresa (atrito legítimo) ou (b)
   * evadir limites distribuindo requests entre headers forjados. Agora o
   * tenant só é identificado a partir de `request.user`, que é populado
   * exclusivamente pelo `JwtStrategy.validate` após validação da assinatura
   * do JWT (fonte server-side confiável).
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const empresaId = req?.user?.empresaId ?? req?.user?.empresas?.[0]?.id;

    if (empresaId && typeof empresaId === 'string' && empresaId.length > 0) {
      return `tenant:${empresaId}`;
    }

    const ip = req?.ip ?? 'unknown';
    return `ip:${ip}`;
  }

  /**
   * Extrai o `empresaId` do request. Retorna `undefined` se nenhum for
   * encontrado.
   *
   * Apenas JWT validado é aceito como fonte (`request.user.*`). Headers
   * client-controlled (`x-empresa-id`) são IGNORADOS para evitar que um
   * atacante em rota pública falsifique o tenant e contorne/encaminhe
   * rate limiting. Ver `getTracker` para o rationale completo
   * (SECURITY-FIX M2 — DevSecOps sweep 2026-06-21).
   *
   * Extraído para permitir testes unitários sem mockar todo o ciclo
   * do `handleRequest` (que delega ao super e exige storage real).
   */
  extractEmpresaId(req: Record<string, any>): string | undefined {
    const candidate = req?.user?.empresaId ?? req?.user?.empresas?.[0]?.id;
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
    return undefined;
  }

  /**
   * Resolve o plano do tenant. Retorna DEFAULT_PLANO em caso de erro
   * (fail-open) — degrada graciosamente sem bloquear tráfego legítimo
   * se o Redis cair. Throttler global por IP continua protegendo.
   */
  async resolvePlano(empresaId: string | undefined): Promise<Plano> {
    if (!empresaId) return DEFAULT_PLANO;
    try {
      return await this.planoService.getPlanoByEmpresaId(empresaId);
    } catch (err) {
      this.logger.warn({
        event: 'throttler.plano_resolve_failed',
        empresaId,
        error: (err as Error).message,
      });
      return DEFAULT_PLANO;
    }
  }

  /**
   * Override de `handleRequest` para:
   * 1. Resolver o `empresaId` antes da contagem.
   * 2. Sobrescrever os limites do tier (short/medium/long/sensitive) com
   *    os valores de `PLANO_LIMITS[plano][tier]`. Isso permite que
   *    tenants do plano PRO tenham limites diferentes de FREE.
   * 3. Delegar a contagem para o `super.handleRequest` (preserva
   *    @SkipThrottle, @Throttle decorator, headers Retry-After / X-RateLimit-*).
   *
   * MUTA requestProps.throttler.limit e requestProps.limit para que o
   * `super.handleRequest` use os limites do plano do tenant.
   */
  protected async handleRequest(
    requestProps: Parameters<ThrottlerGuard['handleRequest']>[0],
  ): Promise<boolean> {
    const req = requestProps.context.switchToHttp().getRequest() as Record<
      string,
      any
    >;
    const empresaId = this.extractEmpresaId(req);
    const plano = await this.resolvePlano(empresaId);
    const tier = (requestProps.throttler.name ?? 'default') as PlanoTier;
    const planLimits = PLANO_LIMITS[plano] ?? PLANO_LIMITS[DEFAULT_PLANO];
    const tierLimit = planLimits[tier];

    if (typeof tierLimit === 'number' && Number.isFinite(tierLimit)) {
      // Muta o throttler config para o tier. `super.handleRequest` lê
      // `requestProps.limit` (passado pelo canActivate após resolver
      // o Resolvable), mas o `storageService.increment` é chamado com
      // `limit` derivado do throttler — mutamos ambos para garantir.
      requestProps.limit = tierLimit;
      if (typeof requestProps.throttler.limit === 'number') {
        requestProps.throttler.limit = tierLimit;
      }
    }

    return super.handleRequest(requestProps);
  }
}
