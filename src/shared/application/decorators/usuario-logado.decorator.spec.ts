import { ExecutionContext } from '@nestjs/common';
import {
  UsuarioLogado,
  extractUsuarioLogado,
} from './usuario-logado.decorator';

// TDD: AGENTS.md §4 — controllers devem usar @UsuarioLogado() em vez de @Req()
//      Se o decorator parar de retornar o payload, todos os controllers autenticados quebram.

describe('extractUsuarioLogado (callback interna)', () => {
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

  it('deve retornar request.usuarioLogado populado pelo JwtStrategy', () => {
    const payload = { sub: 1, email: 'a@b.com', empresas: [] };
    const ctx = buildContext({ usuarioLogado: payload });
    expect(extractUsuarioLogado(null, ctx)).toEqual(payload);
  });

  it('deve retornar undefined quando request.usuarioLogado não existe', () => {
    const ctx = buildContext({});
    expect(extractUsuarioLogado(null, ctx)).toBeUndefined();
  });

  it('deve funcionar com payload complexo (empresas + perfis + permissões)', () => {
    const payload = {
      sub: 1,
      email: 'a@b.com',
      empresas: [
        { id: 'e1', perfis: [{ id: 1, permissoes: [{ codigo: 'READ' }] }] },
      ],
    };
    const ctx = buildContext({ usuarioLogado: payload });
    const result = extractUsuarioLogado(null, ctx) as any;
    expect(result.empresas[0].perfis[0].permissoes[0].codigo).toBe('READ');
  });

  it('NÃO deve usar request.user (que é o padrão do Passport) — usa request.usuarioLogado', () => {
    const ctx = buildContext({
      user: { sub: 999, email: 'outro@b.com' },
      usuarioLogado: { sub: 1, email: 'correto@b.com' },
    });
    const result = extractUsuarioLogado(null, ctx) as any;
    expect(result.sub).toBe(1);
    expect(result.email).toBe('correto@b.com');
  });
});

describe('@UsuarioLogado()', () => {
  it('deve ser um ParameterDecorator (createParamDecorator)', () => {
    expect(typeof UsuarioLogado).toBe('function');
    expect(() => UsuarioLogado({} as any, 'method', 0)).not.toThrow();
  });
});
