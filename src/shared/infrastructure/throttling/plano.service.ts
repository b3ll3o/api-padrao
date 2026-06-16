// BDD: features/usuarios.feature:Cenário: Rate limit por tenant — FREE bloqueia em 100 req/min
// SDD: .openspec/changes/tenant-rate-limit/design.md:REQ-TR-004
// NFR-TR-002: degrada graciosamente quando Redis offline (fallback para Prisma)
// NFR-TR-003: cache TTL 60s, sem invalidação ativa
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { Plano } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CACHE_KEY_PREFIX,
  CACHE_TTL_MS,
  DEFAULT_PLANO,
  PLANO_LIMITS,
} from './plano-limits.config';

@Injectable()
export class PlanoService {
  private readonly logger = new Logger(PlanoService.name);

  constructor(
    @Inject(CACHE_MANAGER) private cache: Cache,
    private prisma: PrismaService,
  ) {}

  /**
   * Resolve o plano de um tenant a partir do empresaId.
   *
   * Fluxo:
   * 1. Tenta Redis (key `tenant:plano:<empresaId>`). Hit + válido → retorna.
   * 2. Cache miss ou Redis offline → consulta Prisma (empresa.findUnique).
   * 3. Se empresa não existe / inativa / soft-deletada → DEFAULT_PLANO (FREE).
   * 4. Plano desconhecido (não mapeado em PLANO_LIMITS) → DEFAULT_PLANO.
   * 5. Cacheia o resultado com TTL 60s.
   */
  async getPlanoByEmpresaId(empresaId: string): Promise<Plano> {
    const cacheKey = `${CACHE_KEY_PREFIX}${empresaId}`;

    // 1. Tenta cache (com fallback gracioso em caso de falha)
    let cached: Plano | string | undefined;
    try {
      cached = await this.cache.get<Plano>(cacheKey);
    } catch (err) {
      this.logger.error({
        event: 'throttler.cache_offline',
        error: (err as Error).message,
      });
    }

    if (cached && this.isValidPlano(cached)) {
      return cached as Plano;
    }

    // 2. Cache miss → Prisma
    this.logger.debug({
      event: 'throttler.cache_miss',
      empresaId,
    });

    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { plano: true, ativo: true, deletedAt: true },
    });

    if (!empresa || !empresa.ativo || empresa.deletedAt) {
      this.logger.warn({
        event: 'throttler.tenant_invalid',
        empresaId,
        reason: !empresa
          ? 'not_found'
          : !empresa.ativo
            ? 'inactive'
            : 'soft_deleted',
      });
      return DEFAULT_PLANO;
    }

    // 3. Valida plano (defesa em profundidade)
    if (!this.isValidPlano(empresa.plano)) {
      this.logger.error({
        event: 'throttler.unknown_plano',
        empresaId,
        plano: empresa.plano,
      });
      return DEFAULT_PLANO;
    }

    // 4. Best-effort cache write
    try {
      await this.cache.set(cacheKey, empresa.plano, CACHE_TTL_MS);
    } catch (err) {
      this.logger.warn({
        event: 'throttler.cache_set_failed',
        error: (err as Error).message,
      });
    }

    return empresa.plano;
  }

  /**
   * Invalida o cache de um tenant. Útil para testes ou admin tools.
   */
  async invalidate(empresaId: string): Promise<void> {
    try {
      await this.cache.del(`${CACHE_KEY_PREFIX}${empresaId}`);
    } catch (err) {
      this.logger.warn({
        event: 'throttler.cache_del_failed',
        error: (err as Error).message,
      });
    }
  }

  /**
   * Valida se um valor (string ou enum) é um plano conhecido.
   * Defesa em profundidade: protege contra enum evoluído sem mapa atualizado.
   */
  private isValidPlano(value: unknown): value is Plano {
    return (
      typeof value === 'string' &&
      Object.prototype.hasOwnProperty.call(PLANO_LIMITS, value)
    );
  }
}
