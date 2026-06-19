// TDD: src/shared/infrastructure/queues/processors/refresh-flush.processor.spec.ts
// SDD: .openspec/changes/observabilidade/design.md:REQ-QUEUE-003
// ATDD: test/refresh-flush-queue.e2e-spec.ts
import { RefreshFlushProcessor } from './refresh-flush.processor';
import { PrismaService } from '../../../../prisma/prisma.service';

describe('RefreshFlushProcessor (queue: refresh-flush)', () => {
  let processor: RefreshFlushProcessor;
  let prisma: { refreshToken: { deleteMany: jest.Mock } };

  beforeEach(() => {
    prisma = {
      refreshToken: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    processor = new RefreshFlushProcessor(prisma as unknown as PrismaService);
  });

  function makeJob(overrides: Partial<any> = {}) {
    return {
      id: 'job-flush-1',
      data: {
        cutoff: '2026-01-01T00:00:00.000Z',
      },
      ...overrides,
    } as any;
  }

  it('deve deletar tokens com expiresAt < cutoff', async () => {
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 5 });
    const result = await processor.process(makeJob());
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: new Date('2026-01-01T00:00:00.000Z') } },
    });
    expect(result.removed).toBe(5);
    expect(result.cutoff).toBe('2026-01-01T00:00:00.000Z');
  });

  it('deve incluir revoked < cutoff quando includeRevoked=true', async () => {
    await processor.process(
      makeJob({
        data: { cutoff: '2026-01-01T00:00:00.000Z', includeRevoked: true },
      }),
    );
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: {
        expiresAt: { lt: new Date('2026-01-01T00:00:00.000Z') },
        OR: [
          { revokedAt: null },
          { revokedAt: { lt: new Date('2026-01-01T00:00:00.000Z') } },
        ],
      },
    });
  });

  it('NÃO deve incluir filtro de revoked quando includeRevoked=false (default)', async () => {
    await processor.process(makeJob());
    const calledWhere = prisma.refreshToken.deleteMany.mock.calls[0][0].where;
    expect(calledWhere.OR).toBeUndefined();
  });

  it('deve retornar removed=0 quando nada é removido', async () => {
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
    const result = await processor.process(makeJob());
    expect(result.removed).toBe(0);
  });

  it('deve propagar exceções do Prisma (retry)', async () => {
    prisma.refreshToken.deleteMany.mockRejectedValue(new Error('db down'));
    await expect(processor.process(makeJob())).rejects.toThrow('db down');
  });
});
