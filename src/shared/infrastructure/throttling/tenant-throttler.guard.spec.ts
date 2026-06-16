// BDD: features/usuarios.feature:Cenário: Rate limit respeita empresaId do JWT
// TDD: src/shared/infrastructure/throttling/tenant-throttler.guard.spec.ts
// SDD: .openspec/changes/tenant-rate-limit/design.md:REQ-TR-003, NFR-TR-002, NFR-TR-004
import { Reflector } from '@nestjs/core';
import { ThrottlerStorage } from '@nestjs/throttler';
import { TenantThrottlerGuard } from './tenant-throttler.guard';
import { PlanoService } from './plano.service';

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

  it('deve usar header x-empresa-id como fallback quando não há JWT', async () => {
    const guard = buildGuard(planoService);
    const tracker = await (guard as any).getTracker({
      headers: { 'x-empresa-id': 'empresa-uuid-3' },
      ip: '127.0.0.1',
    });
    expect(tracker).toBe('tenant:empresa-uuid-3');
  });

  it('deve preferir request.user.empresaId sobre o header x-empresa-id', async () => {
    const guard = buildGuard(planoService);
    const tracker = await (guard as any).getTracker({
      user: { empresaId: 'empresa-jwt' },
      headers: { 'x-empresa-id': 'empresa-header' },
      ip: '127.0.0.1',
    });
    expect(tracker).toBe('tenant:empresa-jwt');
  });

  it('deve cair para IP quando não há empresaId (rota pública)', async () => {
    const guard = buildGuard(planoService);
    const tracker = await (guard as any).getTracker({
      ip: '203.0.113.5',
    });
    expect(tracker).toBe('ip:203.0.113.5');
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

  it('extrai do header x-empresa-id (priority 3)', () => {
    const guard = buildGuard({} as any);
    const req = { headers: { 'x-empresa-id': 'header-empresa' } };
    expect(guard.extractEmpresaId(req)).toBe('header-empresa');
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

describe('TenantThrottlerGuard (preFetchPlano)', () => {
  it('não chama PlanoService para empresaId undefined', async () => {
    const planoService = { getPlanoByEmpresaId: jest.fn() } as any;
    const guard = buildGuard(planoService);
    await guard.preFetchPlano(undefined);
    expect(planoService.getPlanoByEmpresaId).not.toHaveBeenCalled();
  });

  it('não chama PlanoService para empresaId vazio', async () => {
    const planoService = { getPlanoByEmpresaId: jest.fn() } as any;
    const guard = buildGuard(planoService);
    await guard.preFetchPlano('');
    expect(planoService.getPlanoByEmpresaId).not.toHaveBeenCalled();
  });

  it('não chama PlanoService para empresaId não-string', async () => {
    const planoService = { getPlanoByEmpresaId: jest.fn() } as any;
    const guard = buildGuard(planoService);
    await guard.preFetchPlano(null as any);
    expect(planoService.getPlanoByEmpresaId).not.toHaveBeenCalled();
  });

  it('chama PlanoService para empresaId válido', async () => {
    const planoService = { getPlanoByEmpresaId: jest.fn() } as any;
    (planoService.getPlanoByEmpresaId as jest.Mock).mockResolvedValue('PRO');
    const guard = buildGuard(planoService);
    await guard.preFetchPlano('valid-empresa');
    expect(planoService.getPlanoByEmpresaId).toHaveBeenCalledWith(
      'valid-empresa',
    );
  });
});

describe('TenantThrottlerGuard (handleRequest)', () => {
  let planoService: PlanoService;

  beforeEach(() => {
    planoService = { getPlanoByEmpresaId: jest.fn() } as any;
  });

  it('pré-aquece o cache do plano via PlanoService quando há empresaId no JWT', async () => {
    const guard = buildGuard(planoService);
    (planoService.getPlanoByEmpresaId as jest.Mock).mockResolvedValue('PRO');
    const req = { user: { empresaId: 'empresa-x' } };
    await guard.preFetchPlano(guard.extractEmpresaId(req));
    expect(planoService.getPlanoByEmpresaId).toHaveBeenCalledWith('empresa-x');
  });

  it('NÃO chama PlanoService quando não há empresaId', async () => {
    const guard = buildGuard(planoService);
    const req = { ip: '127.0.0.1' };
    await guard.preFetchPlano(guard.extractEmpresaId(req));
    expect(planoService.getPlanoByEmpresaId).not.toHaveBeenCalled();
  });

  it('NÃO propaga erro do PlanoService (best-effort, fail-open)', async () => {
    const guard = buildGuard(planoService);
    (planoService.getPlanoByEmpresaId as jest.Mock).mockRejectedValue(
      new Error('redis offline'),
    );
    const req = { user: { empresas: [{ id: 'empresa-y' }] } };

    // Não deve lançar — o pre-fetch é best-effort
    await expect(
      guard.preFetchPlano(guard.extractEmpresaId(req)),
    ).resolves.toBeUndefined();
  });

  it('usa header x-empresa-id quando não há JWT', async () => {
    const guard = buildGuard(planoService);
    (planoService.getPlanoByEmpresaId as jest.Mock).mockResolvedValue('FREE');
    const req = { headers: { 'x-empresa-id': 'emp-z' } };
    await guard.preFetchPlano(guard.extractEmpresaId(req));
    expect(planoService.getPlanoByEmpresaId).toHaveBeenCalledWith('emp-z');
  });
});
