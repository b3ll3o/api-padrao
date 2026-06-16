// BDD: features/autenticacao.feature:Funcionalidade: Recuperação de Senha
// SDD: .openspec/changes/password-recovery/design.md:REQ-PR-002, REQ-PR-003, REQ-PR-005
// TDD: cobertura completa do adapter Prisma para PasswordResetTokenRepository.
import { PrismaPasswordResetTokenRepository } from './prisma-password-reset-token.repository';

describe('PrismaPasswordResetTokenRepository', () => {
  let repo: PrismaPasswordResetTokenRepository;
  let prisma: {
    passwordResetToken: {
      create: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      passwordResetToken: {
        create: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    repo = new PrismaPasswordResetTokenRepository(prisma as any);
  });

  describe('create', () => {
    it('persiste o token via user.connect (FK explícita) e retorna o record', async () => {
      const expiresAt = new Date('2026-12-31T00:00:00Z');
      const created = {
        id: 'prt-1',
        tokenHash: 'hash-abc',
        userId: 7,
        expiresAt,
        usedAt: null,
        createdAt: new Date('2026-06-15T10:00:00Z'),
      };
      prisma.passwordResetToken.create.mockResolvedValue(created);

      const result = await repo.create({
        userId: 7,
        tokenHash: 'hash-abc',
        expiresAt,
      });

      expect(prisma.passwordResetToken.create).toHaveBeenCalledWith({
        data: {
          user: { connect: { id: 7 } },
          tokenHash: 'hash-abc',
          expiresAt,
        },
      });
      expect(result).toEqual({
        id: 'prt-1',
        tokenHash: 'hash-abc',
        userId: 7,
        expiresAt,
        usedAt: null,
        createdAt: created.createdAt,
      });
    });
  });

  describe('findValidByHash', () => {
    it('busca por tokenHash com usedAt=null e expiresAt>now', async () => {
      const record = {
        id: 'prt-1',
        tokenHash: 'hash-abc',
        userId: 7,
        expiresAt: new Date('2026-12-31T00:00:00Z'),
        usedAt: null,
        createdAt: new Date(),
      };
      prisma.passwordResetToken.findFirst.mockResolvedValue(record);
      const before = new Date();
      const result = await repo.findValidByHash('hash-abc');
      const call = prisma.passwordResetToken.findFirst.mock.calls[0][0];
      expect(call.where.tokenHash).toBe('hash-abc');
      expect(call.where.usedAt).toBeNull();
      expect(call.where.expiresAt.gt).toBeInstanceOf(Date);
      expect(call.where.expiresAt.gt.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
      expect(result).not.toBeNull();
    });

    it('retorna null quando o token não existe', async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValue(null);
      await expect(repo.findValidByHash('missing')).resolves.toBeNull();
    });
  });

  describe('invalidateAllForUser', () => {
    it('marca usedAt=now() em todos os tokens não usados do usuário', async () => {
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 2 });
      const before = new Date();
      await repo.invalidateAllForUser(7);
      const call = prisma.passwordResetToken.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ userId: 7, usedAt: null });
      expect(call.data.usedAt).toBeInstanceOf(Date);
      expect(call.data.usedAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
    });
  });
});
