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
   * Tenant-aware tracker: usa `empresaId` (do JWT ou do header `x-empresa-id`)
   * como chave de throttling. Se não houver tenant identificado, cai para IP
   * (comportamento padrão, preserva compatibilidade com rotas públicas).
   *
   * Ordem de prioridade (NFR-TR-004 — server-side only, NUNCA aceita plano de
   * header client-controlled):
   * 1. `request.user.empresaId` (do JWT, set pelo JwtStrategy ou EmpresaInterceptor)
   * 2. `request.user.empresas?.[0]?.id` (multi-tenant JWT)
   * 3. `request.headers['x-empresa-id']` (header — confiável pois vem do gateway
   *    de autenticação, não do cliente)
   * 4. Fallback: `ip:unknown` (comportamento padrão)
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const empresaId =
      req?.user?.empresaId ??
      req?.user?.empresas?.[0]?.id ??
      req?.headers?.['x-empresa-id'];

    if (empresaId && typeof empresaId === 'string' && empresaId.length > 0) {
      return `tenant:${empresaId}`;
    }

    const ip = req?.ip ?? 'unknown';
    return `ip:${ip}`;
  }

  /**
   * Extrai o `empresaId` do request, na mesma ordem de prioridade do
   * `getTracker`. Retorna `undefined` se nenhum for encontrado.
   * Extraído para permitir testes unitários sem mockar todo o ciclo
   * do `handleRequest` (que delega ao super e exige storage real).
   */
  extractEmpresaId(req: Record<string, any>): string | undefined {
    const candidate =
      req?.user?.empresaId ??
      req?.user?.empresas?.[0]?.id ??
      req?.headers?.['x-empresa-id'];
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
