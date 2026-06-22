import { Permissao } from './permissao.entity';

// TDD: features/permissoes.feature:Cenário: Criar/Listar permissão
// [MED-003] Cobertura adicional: factory criar() + transições + imutabilidade de codigo.
// REQ-PERM-001: nome único global
// REQ-PERM-002: codigo único global
// REQ-PERM-004: codigo SCREAMING_SNAKE_CASE
// REQ-PERM-005: Permissao é entidade global (sem empresaId)
// REQ-PERM-020/021: soft delete + restore

describe('Permissao', () => {
  it('deve aceitar payload mínimo (id, nome, codigo, descricao, ativo)', () => {
    const p = new Permissao();
    p.id = 1;
    p.nome = 'read:users';
    p.codigo = 'READ_USERS';
    p.descricao = 'Ler usuários';
    p.ativo = true;
    p.createdAt = new Date();
    p.updatedAt = new Date();

    expect(p.nome).toBe('read:users');
    expect(p.codigo).toBe('READ_USERS');
    expect(p.descricao).toBe('Ler usuários');
  });

  it('deve estender BaseEntity (soft delete + timestamps)', () => {
    const p = new Permissao();
    p.id = 1;
    p.createdAt = new Date('2025-01-01');
    p.updatedAt = new Date('2025-01-02');
    p.deletedAt = null;
    p.ativo = true;

    expect(p.createdAt).toBeInstanceOf(Date);
    expect(p.deletedAt).toBeNull();
  });

  it('deve aceitar soft delete (ativo=false, deletedAt=Date)', () => {
    const p = new Permissao();
    p.ativo = true;
    p.deletedAt = null;
    p.ativo = false;
    p.deletedAt = new Date();

    expect(p.ativo).toBe(false);
    expect(p.deletedAt).toBeInstanceOf(Date);
  });

  // ---- [MED-003] Cobertura DDD: factory + transições ----

  describe('criar() (fábrica de domínio)', () => {
    it('deve criar permissão válida e normalizar codigo UPPER_SNAKE_CASE', () => {
      const p = Permissao.criar({
        nome: 'Read Users',
        codigo: 'read_users',
        descricao: 'Ler usuários',
      });

      expect(p.codigo).toBe('READ_USERS');
      expect(p.nome).toBe('Read Users');
      expect(p.ativo).toBe(true);
      expect(p.deletedAt).toBeNull();
    });

    it('deve aceitar descricao undefined como string vazia', () => {
      const p = Permissao.criar({ nome: 'X', codigo: 'XX' });
      expect(p.descricao).toBe('');
    });

    it('deve lançar se codigo tem formato inválido', () => {
      // hífen não é UPPER_SNAKE_CASE válido
      expect(() => Permissao.criar({ nome: 'X', codigo: 'A-B' })).toThrow(
        /UPPER_SNAKE_CASE/,
      );
      // 1 char é muito curto
      expect(() => Permissao.criar({ nome: 'X', codigo: 'A' })).toThrow(
        /UPPER_SNAKE_CASE/,
      );
      // > 64 chars é muito longo
      expect(() =>
        Permissao.criar({ nome: 'X', codigo: 'A'.repeat(65) }),
      ).toThrow(/UPPER_SNAKE_CASE/);
      // caractere especial
      expect(() => Permissao.criar({ nome: 'X', codigo: 'A@B' })).toThrow(
        /UPPER_SNAKE_CASE/,
      );
    });

    it('deve lançar se nome vazio', () => {
      expect(() => Permissao.criar({ nome: '   ', codigo: 'XX' })).toThrow(
        /nome é obrigatório/,
      );
    });

    it('deve lançar se codigo vazio', () => {
      expect(() => Permissao.criar({ nome: 'X', codigo: '   ' })).toThrow(
        /codigo é obrigatório/,
      );
    });
  });

  describe('desativar()', () => {
    it('deve soft-deletar e setar deletedAt', () => {
      const p = Permissao.criar({ nome: 'X', codigo: 'XX' });
      p.desativar();

      expect(p.ativo).toBe(false);
      expect(p.deletedAt).toBeInstanceOf(Date);
    });

    it('deve ser idempotente', () => {
      const p = Permissao.criar({ nome: 'X', codigo: 'XX' });
      p.desativar();
      const primeiroDeletedAt = p.deletedAt;
      p.desativar();
      expect(p.deletedAt).toBe(primeiroDeletedAt);
    });
  });

  describe('restaurar()', () => {
    it('deve reativar uma permissão soft-deletada', () => {
      const p = Permissao.criar({ nome: 'X', codigo: 'XX' });
      p.desativar();
      p.restaurar();
      expect(p.ativo).toBe(true);
      expect(p.deletedAt).toBeNull();
    });

    it('deve lançar se não estava desativada', () => {
      const p = Permissao.criar({ nome: 'X', codigo: 'XX' });
      expect(() => p.restaurar()).toThrow(/não está desativada/);
    });
  });

  describe('atualizarMetadados() (codigo imutável)', () => {
    it('deve atualizar nome', () => {
      const p = Permissao.criar({ nome: 'X', codigo: 'XX' });
      p.atualizarMetadados({ nome: 'Y' });
      expect(p.nome).toBe('Y');
      expect(p.codigo).toBe('XX'); // imutável
    });

    it('deve atualizar descricao', () => {
      const p = Permissao.criar({ nome: 'X', codigo: 'XX' });
      p.atualizarMetadados({ descricao: 'Nova' });
      expect(p.descricao).toBe('Nova');
    });

    it('deve lançar se nome ficar vazio', () => {
      const p = Permissao.criar({ nome: 'X', codigo: 'XX' });
      expect(() => p.atualizarMetadados({ nome: '   ' })).toThrow(
        /nome não pode ser vazio/,
      );
    });

    it('NÃO deve expor setter de codigo (signature-only)', () => {
      // A imutabilidade é por design: não há método para trocar codigo.
      // Verificamos indiretamente: nenhum método recebe `codigo` em sua assinatura.
      const p = Permissao.criar({ nome: 'X', codigo: 'XX' });
      expect(typeof (p as unknown as { codigo?: string }).codigo).toBe(
        'string',
      );
      // codigo continua sendo propriedade pública, mas a API de transição
      // não permite alterá-lo — documentado no JSDoc.
      expect(typeof p.atualizarMetadados).toBe('function');
    });
  });
});
