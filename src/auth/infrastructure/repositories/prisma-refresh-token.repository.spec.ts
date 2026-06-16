// BDD: features/autenticacao.feature:Funcionalidade: Autenticação
// SDD: .openspec/changes/auth/design.md
// TDD: cobertura completa do adapter Prisma para RefreshTokenRepository.
import { PrismaRefreshTokenRepository } from './prisma-refresh-token.repository';

describe('PrismaRefreshTokenRepository', () => {
  let repo: PrismaRefreshTokenRepository;
  let prisma: {
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    repo = new PrismaRefreshTokenRepository(prisma as any);
  });

  describe('create', () => {
    it('persiste o token com token/userId/expiresAt', async () => {
      prisma.refreshToken.create.mockResolvedValue({});
      const expiresAt = new Date('2026-12-31T00:00:00Z');
      await repo.create({ token: 't-1', userId: 42, expiresAt });
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: { token: 't-1', userId: 42, expiresAt },
      });
    });
  });

  describe('findByTokenWithUser', () => {
    it('mapeia o resultado do Prisma para o formato do domínio', async () => {
      const record = {
        id: 'rt-1',
        token: 't-1',
        userId: 1,
        expiresAt: new Date('2026-12-31T00:00:00Z'),
        revokedAt: null,
        user: {
          id: 1,
          email: 'a@b.com',
          empresas: [
            {
              empresaId: 'emp-1',
              perfis: [
                {
                  id: 10,
                  nome: 'Admin',
                  codigo: 'ADMIN',
                  descricao: 'Administrador',
                  permissoes: [
                    {
                      id: 100,
                      nome: 'Ler',
                      codigo: 'READ_X',
                      descricao: 'Permite ler X',
                    },
                  ],
                },
              ],
            },
          ],
        },
      };
      prisma.refreshToken.findUnique.mockResolvedValue(record);

      const result = await repo.findByTokenWithUser('t-1');

      expect(result).toEqual({
        id: 'rt-1',
        token: 't-1',
        userId: 1,
        expiresAt: record.expiresAt,
        revokedAt: null,
        user: {
          id: 1,
          email: 'a@b.com',
          empresas: [
            {
              empresaId: 'emp-1',
              perfis: [
                {
                  id: 10,
                  nome: 'Admin',
                  codigo: 'ADMIN',
                  descricao: 'Administrador',
                  permissoes: [
                    {
                      id: 100,
                      nome: 'Ler',
                      codigo: 'READ_X',
                      descricao: 'Permite ler X',
                    },
                  ],
                },
              ],
            },
          ],
        },
      });
      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { token: 't-1' },
        include: expect.objectContaining({
          user: expect.objectContaining({
            select: expect.objectContaining({ id: true, email: true }),
          }),
        }),
      });
    });

    it('retorna null quando o token não existe', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(repo.findByTokenWithUser('missing')).resolves.toBeNull();
    });
  });

  describe('revoke', () => {
    it('marca revokedAt=now() no token com o id fornecido', async () => {
      prisma.refreshToken.update.mockResolvedValue({});
      const before = new Date();
      await repo.revoke('rt-1');
      const call = prisma.refreshToken.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'rt-1' });
      expect(call.data.revokedAt).toBeInstanceOf(Date);
      expect(call.data.revokedAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
    });
  });

  describe('revokeAllForUser', () => {
    it('revoga todos os refresh tokens do usuário', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 5 });
      await repo.revokeAllForUser(42);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 42 },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
