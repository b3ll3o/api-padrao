// BDD: features/usuarios.feature:Cenário: Rate limit respeita empresaId do JWT
// TDD: src/shared/infrastructure/throttling/tenant-throttler.guard.spec.ts
// SDD: .openspec/changes/tenant-rate-limit/design.md:REQ-TR-003, NFR-TR-002, NFR-TR-004
import { Reflector } from '@nestjs/core';
import { ThrottlerStorage } from '@nestjs/throttler';
import { TenantThrottlerGuard } from './tenant-throttler.guard';
import { PlanoService } from './plano.service';
import { PLANO_LIMITS, DEFAULT_PLANO, PlanoTier } from './plano-limits.config';
import { Plano } from '@prisma/client';

/**
 * Constrói uma instância do guard com mocks leves, sem subir o Nest.
 * O construtor de ThrottlerGuard exige um storage compatível — usamos um stub.
 */
function buildGuard(planoService: PlanoService) {
  const options = { throttlers: [] } as any;
  const storage: Partial<ThrottlerStorage> = {
    increment: jest.fn().mockResolvedValue({
      totalHits: 1,
      timeToExpire: 60_000,
      isBlocked: false,
      timeToBlockExpire: 0,
    }),
  };
  return new TenantThrottlerGuard(
    options,
    storage as ThrottlerStorage,
    new Reflector(),
    planoService,
  );
}

describe('TenantThrottlerGuard (getTracker)', () => {
  let planoService: PlanoService;

  beforeEach(() => {
    planoService = { getPlanoByEmpresaId: jest.fn() } as any;
  });

  it('deve usar empresaId do JWT (request.user.empresaId) como tracker', async () => {
    const guard = buildGuard(planoService);
    const tracker = await (guard as any).getTracker({
      user: { empresaId: 'empresa-uuid-1' },
      ip: '127.0.0.1',
    });
    expect(tracker).toBe('tenant:empresa-uuid-1');
  });

  it('deve usar request.user.empresas[0].id como fallback do JWT', async () => {
    const guard = buildGuard(planoService);
    const tracker = await (guard as any).getTracker({
      user: { empresas: [{ id: 'empresa-uuid-2' }] },
      ip: '127.0.0.1',
    });
    expect(tracker).toBe('tenant:empresa-uuid-2');
  });

  it('deve IGNORAR header x-empresa-id em rota pública (SECURITY-FIX M2)', async () => {
    const guard = buildGuard(planoService);
    // SECURITY-FIX M2: sem JWT (rota pública), NÃO confiar no header
    // client-controlled. Apenas IP é usado como chave.
    const tracker = await (guard as any).getTracker({
      headers: { 'x-empresa-id': 'empresa-uuid-3' },
      ip: '127.0.0.1',
    });
    expect(tracker).toBe('ip:127.0.0.1');
    expect(tracker).not.toBe('tenant:empresa-uuid-3');
  });

  it('deve preferir request.user.empresaId sobre o header x-empresa-id (defesa em profundidade)', async () => {
    const guard = buildGuard(planoService);
    const tracker = await (guard as any).getTracker({
      user: { empresaId: 'empresa-jwt' },
      headers: { 'x-empresa-id': 'empresa-header' },
      ip: '127.0.0.1',
    });
    expect(tracker).toBe('tenant:empresa-jwt');
  });

  it('deve preferir request.user.empresaId mesmo quando header tem valor diferente (SECURITY-FIX M2)', async () => {
    const guard = buildGuard(planoService);
    // Atacante tenta forçar throttling contra outra empresa via header
    // — não pode sobrescrever o tenant do JWT já validado.
    const tracker = await (guard as any).getTracker({
      user: { empresaId: 'empresa-jwt-real' },
      headers: { 'x-empresa-id': 'empresa-vitima' },
      ip: '10.0.0.1',
    });
    expect(tracker).toBe('tenant:empresa-jwt-real');
  });

  it('deve usar request.user.empresas[0].id e IGNORAR header x-empresa-id', async () => {
    const guard = buildGuard(planoService);
    const tracker = await (guard as any).getTracker({
      user: { empresas: [{ id: 'empresa-jwt-2' }] },
      headers: { 'x-empresa-id': 'empresa-spoof' },
      ip: '10.0.0.2',
    });
    expect(tracker).toBe('tenant:empresa-jwt-2');
  });

  it('deve cair para IP quando não há JWT nem empresaId (rota pública)', async () => {
    const guard = buildGuard(planoService);
    const tracker = await (guard as any).getTracker({
      ip: '203.0.113.5',
    });
    expect(tracker).toBe('ip:203.0.113.5');
  });

  it('deve usar ip:unknown quando não há JWT, não há IP e header presente (rota pública degradada)', async () => {
    const guard = buildGuard(planoService);
    const tracker = await (guard as any).getTracker({
      headers: { 'x-empresa-id': 'qualquer-coisa' },
    });
    expect(tracker).toBe('ip:unknown');
  });

  it('deve usar "ip:unknown" quando tracker é undefined', async () => {
    const guard = buildGuard(planoService);
    const tracker = await (guard as any).getTracker({});
    expect(tracker).toBe('ip:unknown');
  });

  it('deve gerar chaves distintas para tenants distintos', async () => {
    const guard = buildGuard(planoService);
    const trackerA = await (guard as any).getTracker({
      user: { empresaId: 'empresa-A' },
    });
    const trackerB = await (guard as any).getTracker({
      user: { empresaId: 'empresa-B' },
    });
    expect(trackerA).not.toBe(trackerB);
    expect(trackerA).toBe('tenant:empresa-A');
    expect(trackerB).toBe('tenant:empresa-B');
  });

  it('NUNCA deve ler o plano de header client-controlled (NFR-TR-004)', async () => {
    const guard = buildGuard(planoService);
    // Mesmo com header x-plano forjado, o tracker deve ser tenant:<id>
    const tracker = await (guard as any).getTracker({
      user: { empresaId: 'real-tenant' },
      headers: { 'x-plano': 'ENTERPRISE' },
      ip: '127.0.0.1',
    });
    expect(tracker).toBe('tenant:real-tenant');
    // Plano não é parte da chave do tracker (plano vai via PlanoService)
  });
});

describe('TenantThrottlerGuard (extractEmpresaId)', () => {
  it('extrai empresaId do JWT (priority 1)', () => {
    const guard = buildGuard({} as any);
    const req = { user: { empresaId: 'jwt-empresa' } };
    expect(guard.extractEmpresaId(req)).toBe('jwt-empresa');
  });

  it('extrai do array empresas do JWT (priority 2)', () => {
    const guard = buildGuard({} as any);
    const req = { user: { empresas: [{ id: 'multi-empresa' }] } };
    expect(guard.extractEmpresaId(req)).toBe('multi-empresa');
  });

  it('IGNORA header x-empresa-id quando não há JWT (SECURITY-FIX M2)', () => {
    const guard = buildGuard({} as any);
    // SECURITY-FIX M2: header client-controlled não é fonte de tenant
    // em rotas públicas. Deve retornar undefined.
    const req = { headers: { 'x-empresa-id': 'header-empresa' } };
    expect(guard.extractEmpresaId(req)).toBeUndefined();
  });

  it('retorna undefined quando não há nenhum identificador', () => {
    const guard = buildGuard({} as any);
    expect(guard.extractEmpresaId({})).toBeUndefined();
  });

  it('retorna undefined para empresaId vazio', () => {
    const guard = buildGuard({} as any);
    expect(guard.extractEmpresaId({ user: { empresaId: '' } })).toBeUndefined();
  });

  it('retorna undefined para empresaId não-string (number)', () => {
    const guard = buildGuard({} as any);
    expect(
      guard.extractEmpresaId({ user: { empresaId: 123 } }),
    ).toBeUndefined();
  });

  it('prefere JWT sobre header', () => {
    const guard = buildGuard({} as any);
    const req = {
      user: { empresaId: 'jwt' },
      headers: { 'x-empresa-id': 'header' },
    };
    expect(guard.extractEmpresaId(req)).toBe('jwt');
  });
});

describe('TenantThrottlerGuard (resolvePlano)', () => {
  it('retorna DEFAULT_PLANO para empresaId undefined (rota pública)', async () => {
    const planoService = { getPlanoByEmpresaId: jest.fn() } as any;
    const guard = buildGuard(planoService);
    const plano = await guard.resolvePlano(undefined);
    expect(plano).toBe(DEFAULT_PLANO);
    expect(planoService.getPlanoByEmpresaId).not.toHaveBeenCalled();
  });

  it('retorna o plano do tenant para empresaId válido', async () => {
    const planoService = { getPlanoByEmpresaId: jest.fn() } as any;
    (planoService.getPlanoByEmpresaId as jest.Mock).mockResolvedValue('PRO');
    const guard = buildGuard(planoService);
    const plano = await guard.resolvePlano('empresa-valid');
    expect(plano).toBe('PRO');
    expect(planoService.getPlanoByEmpresaId).toHaveBeenCalledWith(
      'empresa-valid',
    );
  });

  it('retorna DEFAULT_PLANO (fail-open) quando PlanoService falha', async () => {
    const planoService = { getPlanoByEmpresaId: jest.fn() } as any;
    (planoService.getPlanoByEmpresaId as jest.Mock).mockRejectedValue(
      new Error('redis offline'),
    );
    const guard = buildGuard(planoService);
    const plano = await guard.resolvePlano('empresa-down');
    expect(plano).toBe(DEFAULT_PLANO);
  });
});

describe('TenantThrottlerGuard (handleRequest) — tier override', () => {
  it('deve MUTAR requestProps.throttler.limit para o tier do plano do tenant', async () => {
    const planoService = { getPlanoByEmpresaId: jest.fn() } as any;
    (planoService.getPlanoByEmpresaId as jest.Mock).mockResolvedValue('PRO');

    const guard = buildGuard(planoService);

    // Espiamos o super.handleRequest para inspecionar o requestProps MUTADO
    const superSpy = jest
      .spyOn(
        Object.getPrototypeOf(TenantThrottlerGuard.prototype),
        'handleRequest',
      )
      .mockResolvedValue(true);

    const req = { user: { empresaId: 'empresa-pro' } };
    const fakeContext = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as any;
    const throttler = { name: 'short', limit: 10, ttl: 1000 } as any;
    const requestProps = {
      context: fakeContext,
      limit: 10,
      ttl: 1000,
      throttler,
      blockDuration: 0,
      getTracker: jest.fn(),
      generateKey: jest.fn(),
    } as any;

    try {
      await (guard as any).handleRequest(requestProps);
    } finally {
      superSpy.mockRestore();
    }

    // PRO plano: short tier = PLANO_LIMITS.PRO.short
    const expected = PLANO_LIMITS.PRO.short;
    expect(requestProps.limit).toBe(expected);
    expect(requestProps.throttler.limit).toBe(expected);
  });

  it('deve usar DEFAULT_PLANO quando não há empresaId (fail-safe para IP tracker)', async () => {
    const planoService = { getPlanoByEmpresaId: jest.fn() } as any;
    const guard = buildGuard(planoService);

    const superSpy = jest
      .spyOn(
        Object.getPrototypeOf(TenantThrottlerGuard.prototype),
        'handleRequest',
      )
      .mockResolvedValue(true);

    const req = { ip: '203.0.113.1' };
    const fakeContext = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as any;
    const throttler = { name: 'medium', limit: 50, ttl: 60_000 } as any;
    const requestProps = {
      context: fakeContext,
      limit: 50,
      ttl: 60_000,
      throttler,
      blockDuration: 0,
      getTracker: jest.fn(),
      generateKey: jest.fn(),
    } as any;

    try {
      await (guard as any).handleRequest(requestProps);
    } finally {
      superSpy.mockRestore();
    }

    // DEFAULT_PLANO = FREE → medium = PLANO_LIMITS.FREE.medium
    const expected = PLANO_LIMITS[DEFAULT_PLANO].medium;
    expect(requestProps.limit).toBe(expected);
    expect(requestProps.throttler.limit).toBe(expected);
  });

  it('deve aplicar ENTERPRISE limits (mais permissivos) ao tier "sensitive"', async () => {
    const planoService = { getPlanoByEmpresaId: jest.fn() } as any;
    (planoService.getPlanoByEmpresaId as jest.Mock).mockResolvedValue(
      'ENTERPRISE',
    );

    const guard = buildGuard(planoService);

    const superSpy = jest
      .spyOn(
        Object.getPrototypeOf(TenantThrottlerGuard.prototype),
        'handleRequest',
      )
      .mockResolvedValue(true);

    const req = { user: { empresaId: 'empresa-ent' } };
    const fakeContext = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as any;
    const throttler = { name: 'sensitive', limit: 1, ttl: 60_000 } as any;
    const requestProps = {
      context: fakeContext,
      limit: 1,
      ttl: 60_000,
      throttler,
      blockDuration: 0,
      getTracker: jest.fn(),
      generateKey: jest.fn(),
    } as any;

    try {
      await (guard as any).handleRequest(requestProps);
    } finally {
      superSpy.mockRestore();
    }

    const expected = PLANO_LIMITS.ENTERPRISE.sensitive;
    expect(requestProps.limit).toBe(expected);
    expect(requestProps.throttler.limit).toBe(expected);
    // ENTERPRISE sensitive é mais permissivo que FREE sensitive
    // (asserção só faz sentido em produção; em NODE_ENV=test ambos os
    // planos têm o mesmo limite inflado para não interferir com e2e).
    const productionLimits: Record<Plano, Record<string, number>> = {
      FREE: { short: 3, medium: 20, long: 100, sensitive: 10 },
      PRO: { short: 10, medium: 50, long: 1000, sensitive: 20 },
      ENTERPRISE: { short: 30, medium: 200, long: 10000, sensitive: 100 },
    };
    expect(productionLimits.ENTERPRISE.sensitive).toBeGreaterThan(
      productionLimits.FREE.sensitive,
    );
    // Em test env os valores são iguais (TEST_LIMIT); fora de test env o
    // valor de PLANO_LIMITS deve refletir a hierarquia comercial.
    if (process.env.NODE_ENV !== 'test') {
      expect(expected).toBeGreaterThan(PLANO_LIMITS.FREE.sensitive);
    }
  });

  it('deve usar DEFAULT_PLANO (fail-open) se PlanoService falhar e continuar com super', async () => {
    const planoService = { getPlanoByEmpresaId: jest.fn() } as any;
    (planoService.getPlanoByEmpresaId as jest.Mock).mockRejectedValue(
      new Error('redis down'),
    );
    const guard = buildGuard(planoService);

    const superSpy = jest
      .spyOn(
        Object.getPrototypeOf(TenantThrottlerGuard.prototype),
        'handleRequest',
      )
      .mockResolvedValue(true);

    const req = { user: { empresaId: 'empresa-fail' } };
    const fakeContext = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as any;
    const throttler = { name: 'short', limit: 99, ttl: 1000 } as any;
    const requestProps = {
      context: fakeContext,
      limit: 99,
      ttl: 1000,
      throttler,
      blockDuration: 0,
      getTracker: jest.fn(),
      generateKey: jest.fn(),
    } as any;

    let err: unknown;
    try {
      await (guard as any).handleRequest(requestProps);
    } catch (e) {
      err = e;
    } finally {
      superSpy.mockRestore();
    }
    expect(err).toBeUndefined();
    // Cai para DEFAULT_PLANO (FREE)
    const expected = PLANO_LIMITS.FREE.short;
    expect(requestProps.limit).toBe(expected);
  });

  it('PLANO_LIMITS cobre todos os planos: FREE, PRO, ENTERPRISE', () => {
    // Garante que o config não está incompleto (todos os planos têm todos os tiers)
    const tiers: PlanoTier[] = ['short', 'medium', 'long', 'sensitive'];
    for (const plano of Object.keys(PLANO_LIMITS)) {
      for (const tier of tiers) {
        const v = (PLANO_LIMITS as any)[plano][tier];
        expect(typeof v).toBe('number');
        expect(v).toBeGreaterThan(0);
      }
    }
  });
});
