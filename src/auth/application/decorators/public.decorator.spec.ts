import { Reflector } from '@nestjs/core';
import { Public, IS_PUBLIC_KEY } from './public.decorator';

// TDD: AGENTS.md §4 — AuthGuard bypassa rotas marcadas com @Public()
//      Cobertura crítica: se @Public parar de emitir metadata, rotas públicas quebram.

describe('@Public()', () => {
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
  });

  it('deve emitir metadata isPublic=true na classe', () => {
    @Public()
    class TestClass {}
    expect(reflector.get(IS_PUBLIC_KEY, TestClass)).toBe(true);
  });

  it('deve emitir metadata isPublic=true no método', () => {
    class TestClass {
      @Public()
      handler() {}
    }
    expect(reflector.get(IS_PUBLIC_KEY, TestClass.prototype.handler)).toBe(
      true,
    );
  });

  it('NÃO deve emitir metadata em métodos não decorados', () => {
    class TestClass {
      handlerPublico() {}
    }
    expect(
      reflector.get(IS_PUBLIC_KEY, TestClass.prototype.handlerPublico),
    ).toBeUndefined();
  });

  it('NÃO deve emitir metadata em classes não decoradas', () => {
    class TestClass {}
    expect(reflector.get(IS_PUBLIC_KEY, TestClass)).toBeUndefined();
  });

  it('deve usar a chave IS_PUBLIC_KEY (consistente com AuthGuard)', () => {
    // Garante que a chave do decorator é exatamente a mesma que o AuthGuard consulta.
    // AuthGuard.ts deve usar IS_PUBLIC_KEY importado daqui.
    expect(IS_PUBLIC_KEY).toBe('isPublic');
  });
});
