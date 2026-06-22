import { plainToInstance } from 'class-transformer';
import { Usuario } from './usuario.entity';
import { UsuarioEmpresa } from './usuario-empresa.entity';

// TDD: features/usuarios.feature:Cenário: Criar/Listar/Restaurar usuário
//      + AGENTS.md §5 — segurança de dados: @Exclude() na entity + ClassSerializerInterceptor
// REQ-USER-002: email válido
// REQ-USER-007: persistir como bcrypt
// REQ-USER-014: excluir soft-deletados por default
// REQ-USER-026: excluir senha da resposta (@Exclude + ClassSerializerInterceptor)
// REQ-USER-035/036: soft delete + restore
// REQ-USER-039: re-hash ao alterar senha

describe('Usuario', () => {
  it('deve ser uma instância de Usuario', () => {
    const usuario = new Usuario();
    expect(usuario).toBeInstanceOf(Usuario);
  });

  describe('campos básicos', () => {
    it('deve aceitar email, ativo, createdAt, updatedAt', () => {
      const u = new Usuario();
      u.id = 1;
      u.email = 'a@b.com';
      u.ativo = true;
      u.createdAt = new Date('2025-01-01');
      u.updatedAt = new Date('2025-01-02');

      expect(u.id).toBe(1);
      expect(u.email).toBe('a@b.com');
      expect(u.ativo).toBe(true);
    });

    it('deve aceitar deletedAt null (não soft-deletado)', () => {
      const u = new Usuario();
      u.deletedAt = null;
      expect(u.deletedAt).toBeNull();
    });

    it('deve aceitar deletedAt como Date (soft-deletado)', () => {
      const u = new Usuario();
      u.deletedAt = new Date();
      expect(u.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('soft delete', () => {
    it('deve marcar como soft-deletado preservando id e email', () => {
      const u = new Usuario();
      u.id = 5;
      u.email = 'user@empresa.com';
      u.ativo = true;

      // Simulando o que o service faz
      u.ativo = false;
      u.deletedAt = new Date();

      expect(u.id).toBe(5);
      expect(u.email).toBe('user@empresa.com');
      expect(u.ativo).toBe(false);
      expect(u.deletedAt).toBeInstanceOf(Date);
    });

    it('deve restaurar limpando deletedAt e setando ativo=true', () => {
      const u = new Usuario();
      u.id = 5;
      u.ativo = false;
      u.deletedAt = new Date('2025-01-01');

      // Simulando o que service.restore() faz
      u.ativo = true;
      u.deletedAt = null;

      expect(u.ativo).toBe(true);
      expect(u.deletedAt).toBeNull();
    });
  });

  describe('vínculo com empresas', () => {
    it('deve aceitar array de UsuarioEmpresa', () => {
      const u = new Usuario();
      const ue = new UsuarioEmpresa({ id: 1, usuarioId: 1, empresaId: 'e1' });
      u.empresas = [ue];

      expect(u.empresas).toHaveLength(1);
      expect(u.empresas![0].empresaId).toBe('e1');
    });

    it('deve aceitar empresas undefined (sem vínculos)', () => {
      const u = new Usuario();
      expect(u.empresas).toBeUndefined();
    });

    it('deve aceitar empresas array vazio', () => {
      const u = new Usuario();
      u.empresas = [];
      expect(u.empresas).toHaveLength(0);
    });
  });

  describe('segurança: @Exclude() em senha (AGENTS.md §5)', () => {
    it('NÃO deve expor senha após serialização via class-transformer', () => {
      const u = new Usuario();
      u.id = 1;
      u.email = 'a@b.com';
      u.senha = 'Password123!';

      // plainToInstance simula o que o ClassSerializerInterceptor faz em runtime
      const serialized = plainToInstance(Usuario, u);
      const json = JSON.parse(JSON.stringify(serialized));

      expect(json.email).toBe('a@b.com');
      expect(json.senha).toBeUndefined();
    });

    it('senha deve ser mutável na entity (é responsabilidade do service.hash)', () => {
      const u = new Usuario();
      u.senha = 'plain-text';
      expect(u.senha).toBe('plain-text');
      // Após passar pelo service.authenticate/register, senha vira bcrypt
      u.senha = '$2b$10$hash';
      expect(u.senha).toMatch(/^\$2b\$/);
    });
  });

  // ---- [MED-003] Cobertura DDD: factory + transições ----

  describe('criar() (fábrica de domínio)', () => {
    // REQ-USER-002: email válido
    // REQ-USER-007: senha já deve ser hash bcrypt
    it('deve criar usuário válido com senhaHash obrigatório', () => {
      const u = Usuario.criar({
        email: 'User@Example.com',
        senhaHash: '$2b$10$h',
      });

      expect(u.email).toBe('user@example.com'); // normalizado lowercase
      expect(u.senha).toBe('$2b$10$h');
      expect(u.ativo).toBe(true);
      expect(u.deletedAt).toBeNull();
      expect(u.id).toBeUndefined(); // preenchido pelo DB após create
    });

    it('deve aceitar id explícito (reidratação do DB)', () => {
      const u = Usuario.criar({
        email: 'a@b.com',
        senhaHash: '$2b$10$h',
        id: 42,
      });
      expect(u.id).toBe(42);
    });

    it('deve aceitar empresas opcionais', () => {
      const ue = new UsuarioEmpresa({ id: 1, usuarioId: 1, empresaId: 'e1' });
      const u = Usuario.criar({
        email: 'a@b.com',
        senhaHash: 'h',
        empresas: [ue],
      });
      expect(u.empresas).toHaveLength(1);
    });

    it('deve lançar se email inválido', () => {
      expect(() =>
        Usuario.criar({ email: 'not-an-email', senhaHash: 'h' }),
      ).toThrow(/email inválido/);
    });

    it('deve lançar se email vazio', () => {
      expect(() => Usuario.criar({ email: '   ', senhaHash: 'h' })).toThrow(
        /email é obrigatório/,
      );
    });

    it('deve lançar se senhaHash ausente', () => {
      expect(() => Usuario.criar({ email: 'a@b.com', senhaHash: '' })).toThrow(
        /senhaHash é obrigatório/,
      );
    });
  });

  describe('desativar() / restaurar()', () => {
    it('desativar deve ser idempotente', () => {
      const u = Usuario.criar({ email: 'a@b.com', senhaHash: 'h' });
      u.desativar();
      const primeiroDeletedAt = u.deletedAt;
      u.desativar();
      expect(u.deletedAt).toBe(primeiroDeletedAt);
    });

    it('restaurar deve reativar e lançar se não estava desativado', () => {
      const u = Usuario.criar({ email: 'a@b.com', senhaHash: 'h' });
      u.desativar();
      u.restaurar();
      expect(u.ativo).toBe(true);

      expect(() => u.restaurar()).toThrow(/não está desativado/);
    });
  });

  describe('trocarSenha()', () => {
    it('deve aceitar novo hash', () => {
      const u = Usuario.criar({ email: 'a@b.com', senhaHash: '$2b$10$h1' });
      u.trocarSenha('$2b$10$h2');
      expect(u.senha).toBe('$2b$10$h2');
    });

    it('deve lançar se novo hash vazio', () => {
      const u = Usuario.criar({ email: 'a@b.com', senhaHash: 'h' });
      expect(() => u.trocarSenha('')).toThrow(/novoHash inválido/);
    });
  });

  describe('atualizarEmail()', () => {
    it('deve atualizar e normalizar para lowercase', () => {
      const u = Usuario.criar({ email: 'a@b.com', senhaHash: 'h' });
      u.atualizarEmail('  New@Example.COM  ');
      expect(u.email).toBe('new@example.com');
    });

    it('deve lançar se email inválido', () => {
      const u = Usuario.criar({ email: 'a@b.com', senhaHash: 'h' });
      expect(() => u.atualizarEmail('nope')).toThrow(/email inválido/);
    });
  });
});
