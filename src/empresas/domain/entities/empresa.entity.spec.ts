import { Empresa } from './empresa.entity';

// TDD: features/empresas.feature:Cenário: Criar/Atualizar/Soft-delete empresa
// [MED-003] Cobertura adicional: factory criar() + transições + validações.

describe('Empresa', () => {
  it('deve aceitar payload parcial via construtor (Object.assign)', () => {
    const partial = {
      id: 'uuid-1',
      nome: 'Minha Empresa',
      responsavelId: 1,
      ativo: true,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-02'),
    };
    const empresa = new Empresa(partial);

    expect(empresa.id).toBe('uuid-1');
    expect(empresa.nome).toBe('Minha Empresa');
    expect(empresa.responsavelId).toBe(1);
    expect(empresa.ativo).toBe(true);
  });

  it('deve aceitar descricao opcional', () => {
    const empresa = new Empresa({
      id: 'x',
      nome: 'X',
      responsavelId: 1,
      ativo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      descricao: 'Tecnologia',
    });
    expect(empresa.descricao).toBe('Tecnologia');
  });

  it('deve aceitar descricao null (banco permite)', () => {
    const empresa = new Empresa({
      id: 'x',
      nome: 'X',
      responsavelId: 1,
      ativo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      descricao: null,
    });
    expect(empresa.descricao).toBeNull();
  });

  it('deve aceitar descricao undefined (campo não enviado)', () => {
    const empresa = new Empresa({
      id: 'x',
      nome: 'X',
      responsavelId: 1,
      ativo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(empresa.descricao).toBeUndefined();
  });

  it('deve aceitar soft delete (ativo=false, deletedAt=Date)', () => {
    const empresa = new Empresa({
      id: 'x',
      nome: 'X',
      responsavelId: 1,
      ativo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    empresa.ativo = false;
    empresa.deletedAt = new Date();

    expect(empresa.ativo).toBe(false);
    expect(empresa.deletedAt).toBeInstanceOf(Date);
  });

  it('deve aceitar restore (ativo=true, deletedAt=null)', () => {
    const empresa = new Empresa({
      id: 'x',
      nome: 'X',
      responsavelId: 1,
      ativo: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: new Date(),
    });
    empresa.ativo = true;
    empresa.deletedAt = null;

    expect(empresa.ativo).toBe(true);
    expect(empresa.deletedAt).toBeNull();
  });

  // ---- [MED-003] Cobertura DDD: factory + transições ----

  describe('criar() (fábrica de domínio)', () => {
    it('deve criar empresa válida com defaults sensatos', () => {
      const e = Empresa.criar({ nome: 'Acme', responsavelId: 7 });

      expect(e.id).toMatch(/^[0-9a-f-]{36}$/i); // UUID v4
      expect(e.nome).toBe('Acme');
      expect(e.responsavelId).toBe(7);
      expect(e.plano).toBe('FREE');
      expect(e.ativo).toBe(true);
      expect(e.deletedAt).toBeNull();
      expect(e.createdAt).toBeInstanceOf(Date);
      expect(e.updatedAt).toBeInstanceOf(Date);
    });

    it('deve normalizar plano para UPPER e defaultar FREE', () => {
      const e = Empresa.criar({ nome: 'X', responsavelId: 1, plano: 'pro' });
      expect(e.plano).toBe('PRO');
    });

    it('deve aceitar id explícito (reidratação do DB)', () => {
      const e = Empresa.criar({ nome: 'X', responsavelId: 1, id: 'meu-uuid' });
      expect(e.id).toBe('meu-uuid');
    });

    it('deve trimmar nome e descricao', () => {
      const e = Empresa.criar({
        nome: '  Acme SA  ',
        responsavelId: 1,
        descricao: '  Tecnologia  ',
      });
      expect(e.nome).toBe('Acme SA');
      expect(e.descricao).toBe('Tecnologia');
    });

    it('deve converter descricao undefined para null', () => {
      const e = Empresa.criar({ nome: 'X', responsavelId: 1 });
      expect(e.descricao).toBeNull();
    });

    it('deve lançar se nome vazio', () => {
      expect(() => Empresa.criar({ nome: '   ', responsavelId: 1 })).toThrow(
        /nome é obrigatório/,
      );
    });

    it('deve lançar se responsavelId inválido', () => {
      expect(() => Empresa.criar({ nome: 'X', responsavelId: 0 })).toThrow(
        /responsavelId/,
      );
      expect(() => Empresa.criar({ nome: 'X', responsavelId: -1 })).toThrow(
        /responsavelId/,
      );
      expect(() => Empresa.criar({ nome: 'X', responsavelId: 1.5 })).toThrow(
        /responsavelId/,
      );
    });

    it('deve lançar se plano não é FREE/PRO/ENTERPRISE', () => {
      expect(() =>
        Empresa.criar({ nome: 'X', responsavelId: 1, plano: 'GOLD' }),
      ).toThrow(/plano/);
    });
  });

  describe('desativar()', () => {
    it('deve soft-deletar e setar deletedAt', () => {
      const e = Empresa.criar({ nome: 'X', responsavelId: 1 });
      e.desativar();

      expect(e.ativo).toBe(false);
      expect(e.deletedAt).toBeInstanceOf(Date);
      expect(e.updatedAt).toBeInstanceOf(Date);
    });

    it('deve ser idempotente (segunda chamada não muda deletedAt)', async () => {
      const e = Empresa.criar({ nome: 'X', responsavelId: 1 });
      e.desativar();
      const primeiroDeletedAt = e.deletedAt;

      // pequena pausa para garantir que um segundo new Date() seria diferente
      await new Promise((r) => setTimeout(r, 5));
      e.desativar();

      expect(e.deletedAt).toBe(primeiroDeletedAt);
    });
  });

  describe('restaurar()', () => {
    it('deve reativar uma empresa soft-deletada', () => {
      const e = Empresa.criar({ nome: 'X', responsavelId: 1 });
      e.desativar();
      e.restaurar();

      expect(e.ativo).toBe(true);
      expect(e.deletedAt).toBeNull();
    });

    it('deve lançar se empresa não estava desativada', () => {
      const e = Empresa.criar({ nome: 'X', responsavelId: 1 });
      expect(() => e.restaurar()).toThrow(/não está desativada/);
    });
  });

  describe('atualizarMetadados()', () => {
    it('deve atualizar nome com trim', () => {
      const e = Empresa.criar({ nome: 'X', responsavelId: 1 });
      e.atualizarMetadados({ nome: '  Y  ' });
      expect(e.nome).toBe('Y');
    });

    it('deve aceitar descricao null (limpar)', () => {
      const e = Empresa.criar({ nome: 'X', responsavelId: 1, descricao: 'd' });
      e.atualizarMetadados({ descricao: null });
      expect(e.descricao).toBeNull();
    });

    it('deve lançar se nome ficar vazio', () => {
      const e = Empresa.criar({ nome: 'X', responsavelId: 1 });
      expect(() => e.atualizarMetadados({ nome: '   ' })).toThrow(
        /nome não pode ser vazio/,
      );
    });
  });

  describe('trocarPlano()', () => {
    it('deve aceitar FREE → PRO → ENTERPRISE', () => {
      const e = Empresa.criar({ nome: 'X', responsavelId: 1 });
      e.trocarPlano('PRO');
      expect(e.plano).toBe('PRO');
      e.trocarPlano('ENTERPRISE');
      expect(e.plano).toBe('ENTERPRISE');
    });
  });

  describe('transferirResponsabilidade()', () => {
    it('deve trocar o owner', () => {
      const e = Empresa.criar({ nome: 'X', responsavelId: 1 });
      e.transferirResponsabilidade(2);
      expect(e.responsavelId).toBe(2);
    });

    it('deve lançar se novo é o mesmo atual', () => {
      const e = Empresa.criar({ nome: 'X', responsavelId: 1 });
      expect(() => e.transferirResponsabilidade(1)).toThrow(/mesmo atual/);
    });

    it('deve lançar se novoResponsavelId inválido', () => {
      const e = Empresa.criar({ nome: 'X', responsavelId: 1 });
      expect(() => e.transferirResponsabilidade(0)).toThrow(/inválido/);
      expect(() => e.transferirResponsabilidade(-5)).toThrow(/inválido/);
    });
  });
});
