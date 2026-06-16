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
