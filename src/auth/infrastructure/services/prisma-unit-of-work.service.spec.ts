// BDD: features/autenticacao.feature:Funcionalidade: Recuperação de Senha
// SDD: .openspec/changes/password-recovery/design.md
// TDD: cobertura do adapter Prisma para UnitOfWork.
import { PrismaUnitOfWork } from './prisma-unit-of-work.service';

describe('PrismaUnitOfWork', () => {
  let uow: PrismaUnitOfWork;
  let prisma: { $transaction: jest.Mock };

  beforeEach(() => {
    prisma = { $transaction: jest.fn() };
    uow = new PrismaUnitOfWork(prisma as any);
  });

  it('delega para $transaction do Prisma e propaga o resultado', async () => {
    const tx = { empresa: { create: jest.fn() } };
    const expected = { ok: true };
    prisma.$transaction.mockImplementation(async (cb) => cb(tx));
    const work = jest.fn().mockResolvedValue(expected);

    const result = await uow.execute(work);

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(work).toHaveBeenCalledWith(tx);
    expect(result).toBe(expected);
  });

  it('faz rollback automático se o callback lança (comportamento herdado do $transaction)', async () => {
    prisma.$transaction.mockImplementation(async (cb) => cb({}));
    const work = jest.fn().mockRejectedValue(new Error('boom'));

    await expect(uow.execute(work)).rejects.toThrow('boom');
  });
});
