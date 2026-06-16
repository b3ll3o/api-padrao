// BDD: features/usuarios.feature:Cenário: Rate limit por tenant — FREE bloqueia em 100 req/min
// TDD: src/shared/infrastructure/throttling/plano-limits.config.spec.ts
// SDD: .openspec/changes/tenant-rate-limit/design.md:REQ-TR-002
import { Plano } from '@prisma/client';
import {
  PLANO_LIMITS,
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

  it('FREE.long deve ser 100 (piso de segurança — NFR-TR-007)', () => {
    expect(PLANO_LIMITS.FREE.long).toBe(100);
  });

  it('PRO.long deve ser 1000 (10x FREE)', () => {
    expect(PLANO_LIMITS.PRO.long).toBe(1000);
  });

  it('ENTERPRISE.long deve ser 10000 (100x FREE)', () => {
    expect(PLANO_LIMITS.ENTERPRISE.long).toBe(10000);
  });

  it('FREE.sensitive deve ser 10, PRO.sensitive = 20, ENTERPRISE.sensitive = 100', () => {
    expect(PLANO_LIMITS.FREE.sensitive).toBe(10);
    expect(PLANO_LIMITS.PRO.sensitive).toBe(20);
    expect(PLANO_LIMITS.ENTERPRISE.sensitive).toBe(100);
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
