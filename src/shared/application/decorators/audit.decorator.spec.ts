import { Reflector } from '@nestjs/core';
import { Auditar, AUDIT_KEY, AuditOptions } from './audit.decorator';

// TDD: AGENTS.md §4 — AuditInterceptor lê metadata AUDIT_KEY para ações auditáveis
//      Se @Auditar() parar de emitir metadata, auditoria global quebra silenciosamente.

describe('@Auditar()', () => {
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
  });

  it('deve emitir metadata AUDIT_KEY com ação e recurso', () => {
    const options: AuditOptions = { acao: 'CREATE', recurso: 'usuario' };

    @Auditar(options)
    class TestClass {}

    const meta = reflector.get(AUDIT_KEY, TestClass);
    expect(meta).toEqual(options);
  });

  it('deve emitir metadata no método do controller', () => {
    const options: AuditOptions = { acao: 'DELETE', recurso: 'empresa' };

    class TestClass {
      @Auditar(options)
      handler() {}
    }

    expect(reflector.get(AUDIT_KEY, TestClass.prototype.handler)).toEqual(
      options,
    );
  });

  it('deve usar a chave AUDIT_KEY consistente com AuditInterceptor', () => {
    expect(AUDIT_KEY).toBe('audit_logging');
  });

  it('NÃO deve emitir metadata quando @Auditar() não é aplicado', () => {
    class TestClass {
      handler() {}
    }
    expect(
      reflector.get(AUDIT_KEY, TestClass.prototype.handler),
    ).toBeUndefined();
  });

  it('deve suportar múltiplas ações no mesmo controller (cada método com sua metadata)', () => {
    @Auditar({ acao: 'CREATE', recurso: 'usuario' })
    class CreateController {}

    @Auditar({ acao: 'DELETE', recurso: 'usuario' })
    class DeleteController {}

    expect(reflector.get(AUDIT_KEY, CreateController)).toEqual({
      acao: 'CREATE',
      recurso: 'usuario',
    });
    expect(reflector.get(AUDIT_KEY, DeleteController)).toEqual({
      acao: 'DELETE',
      recurso: 'usuario',
    });
  });
});
