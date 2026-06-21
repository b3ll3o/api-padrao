// BDD: features/usuarios.feature:Cenário: Rate limit por tenant — FREE bloqueia em 100 req/min
// TDD: src/shared/infrastructure/throttling/plano-limits.config.spec.ts
// SDD: .openspec/changes/tenant-rate-limit/design.md:REQ-TR-002
import { Plano } from '@prisma/client';
import {
  PLANO_LIMITS,
  PRODUCTION_PLANO_LIMITS,
  DEFAULT_PLANO,
  CACHE_KEY_PREFIX,
  CACHE_TTL_MS,
} from './plano-limits.config';

describe('PLANO_LIMITS config', () => {
  it('deve exportar PLANO_LIMITS com 3 planos', () => {
    expect(Object.keys(PLANO_LIMITS).sort()).toEqual([
      'ENTERPRISE',
      'FREE',
      'PRO',
    ]);
  });

  // [FIX-CI] Em NODE_ENV=test, PLANO_LIMITS é inflado (TEST_LIMIT=10_000)
  // para que os testes E2E não disparem 429 do throttler por plano do
  // tenant. A hierarquia comercial é testada via PRODUCTION_PLANO_LIMITS,
  // que exporta os valores de produção independentemente do NODE_ENV.
  it('FREE.long comercial deve ser 100 (piso de segurança — NFR-TR-007)', () => {
    expect(PRODUCTION_PLANO_LIMITS.FREE.long).toBe(100);
  });

  it('PRO.long comercial deve ser 1000 (10x FREE)', () => {
    expect(PRODUCTION_PLANO_LIMITS.PRO.long).toBe(1000);
  });

  it('ENTERPRISE.long comercial deve ser 10000 (100x FREE)', () => {
    expect(PRODUCTION_PLANO_LIMITS.ENTERPRISE.long).toBe(10000);
  });

  it('PRODUCTION_PLANO_LIMITS: FREE.sensitive = 10, PRO = 20, ENTERPRISE = 100', () => {
    expect(PRODUCTION_PLANO_LIMITS.FREE.sensitive).toBe(10);
    expect(PRODUCTION_PLANO_LIMITS.PRO.sensitive).toBe(20);
    expect(PRODUCTION_PLANO_LIMITS.ENTERPRISE.sensitive).toBe(100);
  });

  // PLANO_LIMITS efetivo (pode ser TEST ou PRODUCTION) deve sempre
  // ter todos os 3 planos com 4 tiers numéricos positivos.
  it('PLANO_LIMITS (efetivo) cobre todos os planos com 4 tiers numéricos', () => {
    for (const plano of Object.keys(PLANO_LIMITS)) {
      for (const tier of ['short', 'medium', 'long', 'sensitive']) {
        const v = (PLANO_LIMITS as any)[plano][tier];
        expect(typeof v).toBe('number');
        expect(v).toBeGreaterThan(0);
      }
    }
  });

  it('DEFAULT_PLANO deve ser FREE', () => {
    expect(DEFAULT_PLANO).toBe(Plano.FREE);
    expect(DEFAULT_PLANO).toBe('FREE');
  });

  it('CACHE_KEY_PREFIX deve ser tenant:plano:', () => {
    expect(CACHE_KEY_PREFIX).toBe('tenant:plano:');
  });

  it('CACHE_TTL_MS deve ser 60_000 (60 segundos)', () => {
    expect(CACHE_TTL_MS).toBe(60_000);
  });
});
