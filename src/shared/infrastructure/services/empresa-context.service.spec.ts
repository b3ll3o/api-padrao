import { EmpresaContext } from './empresa-context.service';

describe('EmpresaContext', () => {
  let context: EmpresaContext;

  beforeEach(() => {
    context = new EmpresaContext();
  });

  it('deve ser definido', () => {
    expect(context).toBeDefined();
  });

  it('deve permitir setar e recuperar o empresaId', () => {
    const id = 'test-uuid';
    context.empresaId = id;
    expect(context.empresaId).toBe(id);
  });

  it('deve lançar erro ao acessar empresaId não definido', () => {
    expect(() => context.empresaId).toThrow('Contexto de empresa não definido');
  });

  it('deve permitir setar e recuperar o usuarioId', () => {
    const id = 123;
    context.usuarioId = id;
    expect(context.usuarioId).toBe(id);
  });

  it('deve lançar erro ao acessar usuarioId não definido', () => {
    expect(() => context.usuarioId).toThrow('Contexto de usuário não definido');
  });

  it('deve retornar verdadeiro se possuir empresaId', () => {
    expect(context.possuiEmpresa()).toBe(false);
    context.empresaId = 'test-uuid';
    expect(context.possuiEmpresa()).toBe(true);
  });
});
