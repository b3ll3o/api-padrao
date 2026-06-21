// BDD: features/usuarios.feature:Cenário: Rate limit por tenant — FREE bloqueia em 100 req/min
// SDD: .openspec/changes/tenant-rate-limit/design.md:REQ-TR-002
// NFR: Plano é a fonte da verdade sobre os limites de rate limit por tenant
import { Plano } from '@prisma/client';

/**
 * Limites de throttling por plano de assinatura.
 * Os números representam req/TTL por tier de throttling.
 *
 * Para mudar: editar este arquivo e redeploy.
 * Para configuração por tenant (overrides): criar tabela `PlanoOverride` no futuro.
 *
 * [FIX-CI] Em NODE_ENV=test, limites são inflados (10_000) para que os
 * testes E2E possam encadear várias requisições (ex.: 5 logins errados
 * para validar lockout) sem que o throttler global da tenant dispare 429
 * antes da lógica de negócio rodar. O @Throttle decorator nos controllers
 * (auth, empresas, usuarios) já faz esse mesmo "switch" via env vars —
 * aqui replicamos o padrão para os limites por plano, que têm prioridade
 * na TenantThrottlerGuard.handleRequest e sobrescrevem o decorator.
 * Em produção (qualquer outro NODE_ENV) os valores comerciais valem.
 */
const isTestEnv = process.env.NODE_ENV === 'test';
const TEST_LIMIT = 10_000;

const PRODUCTION_LIMITS: Record<Plano, Record<string, number>> = {
  FREE: { short: 3, medium: 20, long: 100, sensitive: 10 },
  PRO: { short: 10, medium: 50, long: 1000, sensitive: 20 },
  ENTERPRISE: { short: 30, medium: 200, long: 10000, sensitive: 100 },
};

const TEST_LIMITS: Record<Plano, Record<string, number>> = {
  FREE: {
    short: TEST_LIMIT,
    medium: TEST_LIMIT,
    long: TEST_LIMIT,
    sensitive: TEST_LIMIT,
  },
  PRO: {
    short: TEST_LIMIT,
    medium: TEST_LIMIT,
    long: TEST_LIMIT,
    sensitive: TEST_LIMIT,
  },
  ENTERPRISE: {
    short: TEST_LIMIT,
    medium: TEST_LIMIT,
    long: TEST_LIMIT,
    sensitive: TEST_LIMIT,
  },
};

export const PLANO_LIMITS: Record<Plano, Record<string, number>> = isTestEnv
  ? TEST_LIMITS
  : PRODUCTION_LIMITS;

/**
 * Limites comerciais (produção). Exportado para que specs e ferramentas
 * de auditoria possam validar a hierarquia FREE < PRO < ENTERPRISE
 * independentemente do NODE_ENV (em tests PLANO_LIMITS é inflado).
 */
export const PRODUCTION_PLANO_LIMITS = PRODUCTION_LIMITS;

export const DEFAULT_PLANO: Plano = Plano.FREE;

/**
 * Prefixo para chaves de cache de tenant (plano resolvido por empresaId).
 * Usado por PlanoService para armazenar lookup no Redis com TTL 60s.
 */
export const CACHE_KEY_PREFIX = 'tenant:plano:';

/**
 * TTL em milissegundos do cache de plano (60 segundos).
 * Decisão consciente: operação de mudança de plano é rara, 60s de inconsistência
 * é aceitável. Sem invalidação ativa.
 */
export const CACHE_TTL_MS = 60_000;

export type PlanoTier = 'short' | 'medium' | 'long' | 'sensitive';
