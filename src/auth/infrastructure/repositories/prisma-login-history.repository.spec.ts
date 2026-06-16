// BDD: features/autenticacao.feature:Funcionalidade: Autenticação
// SDD: .openspec/changes/auth/design.md:REQ-AUTH-006
// TDD: cobertura completa do adapter Prisma para LoginHistoryRepository.
import { PrismaLoginHistoryRepository } from './prisma-login-history.repository';

describe('PrismaLoginHistoryRepository', () => {
  let repo: PrismaLoginHistoryRepository;
  let prisma: { loginHistory: { create: jest.Mock } };

  beforeEach(() => {
    prisma = { loginHistory: { create: jest.fn().mockResolvedValue({}) } };
    repo = new PrismaLoginHistoryRepository(prisma as any);
  });

  it('persiste um registro com userId, ip e userAgent', async () => {
    await repo.record({ userId: 1, ip: '127.0.0.1', userAgent: 'jest' });
    expect(prisma.loginHistory.create).toHaveBeenCalledWith({
      data: { userId: 1, ip: '127.0.0.1', userAgent: 'jest' },
    });
  });

  it('aceita registro sem ip e sem userAgent (opcionais)', async () => {
    await repo.record({ userId: 2 });
    expect(prisma.loginHistory.create).toHaveBeenCalledWith({
      data: { userId: 2, ip: undefined, userAgent: undefined },
    });
  });
});
