import { ExecutionContext } from '@nestjs/common';
import { EmpresaId, extractEmpresaId } from './empresa-id.decorator';

// TDD: AGENTS.md §4 — multi-tenancy escopado por empresaId do header x-empresa-id
//      Se EmpresaId parar de extrair do header, todo controller protegido quebra.

describe('extractEmpresaId (callback interna)', () => {
  const buildContext = (req: any): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({}),
        getNext: () => ({}),
      }),
      getHandler: () => ({}) as any,
      getClass: () => ({}) as any,
      getArgs: () => [] as any,
      getArgByIndex: () => undefined,
      switchToRpc: () => ({}) as any,
      switchToWs: () => ({}) as any,
      getType: () => 'http' as any,
    }) as unknown as ExecutionContext;

  it('deve extrair empresaId do header x-empresa-id quando presente', () => {
    const ctx = buildContext({
      headers: { 'x-empresa-id': 'uuid-from-header' },
    });
    expect(extractEmpresaId(null, ctx)).toBe('uuid-from-header');
  });

  it('deve preferir o header x-empresa-id sobre o valor do JWT', () => {
    const ctx = buildContext({
      headers: { 'x-empresa-id': 'uuid-from-header' },
      user: { empresaId: 'uuid-from-jwt' },
    });
    expect(extractEmpresaId(null, ctx)).toBe('uuid-from-header');
  });

  it('deve fazer fallback para request.user.empresaId quando header ausente', () => {
    const ctx = buildContext({
      headers: {},
      user: { empresaId: 'uuid-from-jwt' },
    });
    expect(extractEmpresaId(null, ctx)).toBe('uuid-from-jwt');
  });

  it('deve fazer fallback para request.user.empresas[0].id (multi-tenant JWT) quando header e empresaId ausentes', () => {
    const ctx = buildContext({
      headers: {},
      user: { empresas: [{ id: 'uuid-from-jwt-multitenant' }] },
    });
    expect(extractEmpresaId(null, ctx)).toBe('uuid-from-jwt-multitenant');
  });

  it('deve retornar undefined quando nem header nem JWT têm empresaId', () => {
    const ctx = buildContext({ headers: {} });
    expect(extractEmpresaId(null, ctx)).toBeUndefined();
  });

  it('deve aceitar data como parâmetro (mesmo que não use)', () => {
    const ctx = buildContext({ headers: { 'x-empresa-id': 'uuid-x' } });
    expect(extractEmpresaId('qualquer-data', ctx)).toBe('uuid-x');
  });
});

describe('@EmpresaId()', () => {
  it('deve ser um ParameterDecorator (createParamDecorator)', () => {
    expect(typeof EmpresaId).toBe('function');
    // Não lança ao receber (target, key, index) — assinatura ParameterDecorator
    expect(() => EmpresaId({} as any, 'method', 0)).not.toThrow();
  });
});
