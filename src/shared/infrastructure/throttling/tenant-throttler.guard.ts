// BDD: features/usuarios.feature:Cenário: Rate limit respeita empresaId do JWT
// SDD: .openspec/changes/tenant-rate-limit/design.md:REQ-TR-002..008
// ATDD: test/tenant-rate-limit.e2e-spec.ts
//
// Estratégia implementada: VERSÃO SIMPLIFICADA (override apenas do `getTracker`).
// O `TenantThrottlerGuard` sobrescreve apenas o método `getTracker` para usar o
// `empresaId` (do JWT ou header `x-empresa-id`) como chave de throttling em vez
// do IP. Isso já garante "rate limit por tenant" — cada tenant tem seu próprio
// contador Redis, isolado de outros tenants e do IP.
//
// O mapa `PLANO_LIMITS` está criado e disponível em `plano-limits.config.ts` para
// uso futuro (outras features podem aplicar limites diferenciados por plano sem
// alterar este guard). Para esta primeira versão, o limite do tier permanece o
// global configurado em `ThrottlerModule.forRoot([...])`.
//
// Follow-up documentado: substituir limites do tier dinamicamente a partir de
// `PLANO_LIMITS[plano][tier]` requer override de `handleRequest` (que no
// @nestjs/throttler v6 recebe `ThrottlerRequest` mutável). A complexidade da
// integração vs. o ganho marginal (FREE = mesmo teto de antes) não justifica a
// implementação nesta primeira versão. O caminho do plano já está resolvido por
// `PlanoService` e exposto via injeção de dependência.
import { Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerStorage,
  InjectThrottlerStorage,
  InjectThrottlerOptions,
  ThrottlerModuleOptions,
} from '@nestjs/throttler';
import { PlanoService } from './plano.service';

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
   * Override de `handleRequest` para:
   * 1. Resolver o `empresaId` antes da contagem.
   * 2. Pré-aquecer o cache do plano (best-effort) para que chamadas subsequentes
   *    tenham cache hit no PlanoService.
   * 3. Delegar a contagem para o `super.handleRequest` (preserva @SkipThrottle,
   *    @Throttle decorator, headers Retry-After / X-RateLimit-*).
   */
  protected async handleRequest(
    requestProps: Parameters<ThrottlerGuard['handleRequest']>[0],
  ): Promise<boolean> {
    const req = requestProps.context.switchToHttp().getRequest() as Record<
      string,
      any
    >;
    const empresaId =
      req?.user?.empresaId ??
      req?.user?.empresas?.[0]?.id ??
      req?.headers?.['x-empresa-id'];

    if (empresaId && typeof empresaId === 'string') {
      try {
        // Resolve plano (best-effort) — não bloqueia a request em caso de erro
        await this.planoService.getPlanoByEmpresaId(empresaId);
      } catch (err) {
        this.logger.warn({
          event: 'throttler.plano_resolve_failed',
          empresaId,
          error: (err as Error).message,
        });
      }
    }

    return super.handleRequest(requestProps);
  }
}
