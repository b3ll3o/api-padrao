import { Perfil } from './perfil.entity';
import { Permissao } from '../../../permissoes/domain/entities/permissao.entity';

// TDD: features/perfis.feature:Cenário: Criar/Listar perfil com permissões
// [MED-003] Cobertura adicional: factory + transições + gerenciamento de permissões.

describe('Perfil', () => {
  it('deve aceitar payload mínimo (id, nome, codigo, descricao, empresaId, ativo)', () => {
    const perfil = new Perfil();
    perfil.id = 1;
    perfil.nome = 'Admin';
    perfil.codigo = 'ADMIN';
    perfil.descricao = 'Administrador';
    perfil.empresaId = 'uuid-empresa';
    perfil.ativo = true;
    perfil.createdAt = new Date();
    perfil.updatedAt = new Date();

    expect(perfil.nome).toBe('Admin');
    expect(perfil.codigo).toBe('ADMIN');
    expect(perfil.empresaId).toBe('uuid-empresa');
    expect(perfil.ativo).toBe(true);
  });

  it('deve aceitar array de Permissao (relacionamento N:N)', () => {
    const perfil = new Perfil();
    const perm = new Permissao();
    perm.id = 1;
    perm.codigo = 'READ_USERS';
    perfil.permissoes = [perm];

    expect(perfil.permissoes).toHaveLength(1);
    expect(perfil.permissoes![0].codigo).toBe('READ_USERS');
  });

  it('deve aceitar permissoes undefined (perfil sem permissões)', () => {
    const perfil = new Perfil();
    expect(perfil.permissoes).toBeUndefined();
  });

  it('deve estender BaseEntity (soft delete + timestamps)', () => {
    const perfil = new Perfil();
    perfil.id = 1;
    perfil.createdAt = new Date('2025-01-01');
    perfil.updatedAt = new Date('2025-01-02');
    perfil.deletedAt = null;
    perfil.ativo = true;

    expect(perfil.createdAt).toBeInstanceOf(Date);
    expect(perfil.deletedAt).toBeNull();
  });

  // ---- [MED-003] Cobertura DDD: factory + transições ----

  describe('criar() (fábrica de domínio)', () => {
    it('deve criar perfil válido com empresaId obrigatório', () => {
      const p = Perfil.criar({
        nome: 'Admin',
        codigo: 'admin',
        descricao: 'Administrador',
        empresaId: 'uuid-empresa',
      });

      expect(p.nome).toBe('Admin');
      expect(p.codigo).toBe('ADMIN'); // normalizado
      expect(p.empresaId).toBe('uuid-empresa');
      expect(p.ativo).toBe(true);
      expect(p.deletedAt).toBeNull();
      expect(p.permissoes).toEqual([]);
    });

    it('deve aceitar permissoes opcionais', () => {
      const perm = Permissao.criar({ nome: 'Read', codigo: 'READ' });
      const p = Perfil.criar({
        nome: 'Admin',
        codigo: 'ADMIN',
        empresaId: 'e1',
        permissoes: [perm],
      });
      expect(p.permissoes).toHaveLength(1);
    });

    it('deve lançar se empresaId ausente (multi-tenancy)', () => {
      expect(() =>
        Perfil.criar({ nome: 'X', codigo: 'XX', empresaId: '   ' }),
      ).toThrow(/empresaId é obrigatório/);
    });

    it('deve lançar se codigo formato inválido', () => {
      // hífen não é UPPER_SNAKE_CASE válido
      expect(() =>
        Perfil.criar({ nome: 'X', codigo: 'A-B', empresaId: 'e1' }),
      ).toThrow(/UPPER_SNAKE_CASE/);
      // caractere especial
      expect(() =>
        Perfil.criar({ nome: 'X', codigo: 'A@B', empresaId: 'e1' }),
      ).toThrow(/UPPER_SNAKE_CASE/);
    });

    it('deve lançar se nome vazio', () => {
      expect(() =>
        Perfil.criar({ nome: '   ', codigo: 'XX', empresaId: 'e1' }),
      ).toThrow(/nome é obrigatório/);
    });
  });

  describe('desativar() / restaurar()', () => {
    it('desativar deve ser idempotente', () => {
      const p = Perfil.criar({ nome: 'X', codigo: 'XX', empresaId: 'e1' });
      p.desativar();
      const primeiroDeletedAt = p.deletedAt;
      p.desativar();
      expect(p.deletedAt).toBe(primeiroDeletedAt);
    });

    it('restaurar deve reativar e lançar se não estava desativado', () => {
      const p = Perfil.criar({ nome: 'X', codigo: 'XX', empresaId: 'e1' });
      p.desativar();
      p.restaurar();
      expect(p.ativo).toBe(true);
      expect(p.deletedAt).toBeNull();

      expect(() => p.restaurar()).toThrow(/não está desativado/);
    });
  });

  describe('gerenciamento de permissoes', () => {
    const perm1 = () => Permissao.criar({ nome: 'R', codigo: 'READ' });
    const perm2 = () => Permissao.criar({ nome: 'W', codigo: 'WRITE' });
    const perm3 = () => Permissao.criar({ nome: 'D', codigo: 'DELETE' });

    it('definirPermissoes deve substituir (não merge)', () => {
      const p = Perfil.criar({
        nome: 'X',
        codigo: 'XX',
        empresaId: 'e1',
        permissoes: [perm1()],
      });
      p.definirPermissoes([perm2(), perm3()]);
      expect(p.permissoes).toHaveLength(2);
      expect(p.permissoes!.map((x) => x.codigo)).toEqual(['WRITE', 'DELETE']);
    });

    it('adicionarPermissao deve incluir nova permissão', () => {
      const p = Perfil.criar({ nome: 'X', codigo: 'XX', empresaId: 'e1' });
      p.adicionarPermissao(perm1());
      expect(p.permissoes).toHaveLength(1);
    });

    it('adicionarPermissao deve lançar em duplicata de codigo', () => {
      const p = Perfil.criar({ nome: 'X', codigo: 'XX', empresaId: 'e1' });
      p.adicionarPermissao(perm1());
      expect(() => p.adicionarPermissao(perm1())).toThrow(
        /já possui permissão/,
      );
    });

    it('removerPermissao deve retornar true ao remover', () => {
      const p = Perfil.criar({ nome: 'X', codigo: 'XX', empresaId: 'e1' });
      p.adicionarPermissao(perm1());
      expect(p.removerPermissao('READ')).toBe(true);
      expect(p.permissoes).toHaveLength(0);
    });

    it('removerPermissao deve retornar false se não existe', () => {
      const p = Perfil.criar({ nome: 'X', codigo: 'XX', empresaId: 'e1' });
      expect(p.removerPermissao('NOPE')).toBe(false);
    });

    it('possuiPermissao deve funcionar com ou sem permissoes', () => {
      const p = Perfil.criar({ nome: 'X', codigo: 'XX', empresaId: 'e1' });
      expect(p.possuiPermissao('X')).toBe(false);
      p.adicionarPermissao(perm1());
      expect(p.possuiPermissao('READ')).toBe(true);
      expect(p.possuiPermissao('WRITE')).toBe(false);
    });
  });

  describe('atualizarMetadados() (codigo e empresaId imutáveis)', () => {
    it('deve atualizar nome e descricao', () => {
      const p = Perfil.criar({
        nome: 'X',
        codigo: 'XX',
        descricao: 'd',
        empresaId: 'e1',
      });
      p.atualizarMetadados({ nome: 'Y', descricao: 'new' });
      expect(p.nome).toBe('Y');
      expect(p.descricao).toBe('new');
      expect(p.codigo).toBe('XX');
      expect(p.empresaId).toBe('e1');
    });

    it('deve lançar se nome vazio', () => {
      const p = Perfil.criar({ nome: 'X', codigo: 'XX', empresaId: 'e1' });
      expect(() => p.atualizarMetadados({ nome: '   ' })).toThrow(
        /nome não pode ser vazio/,
      );
    });
  });
});
