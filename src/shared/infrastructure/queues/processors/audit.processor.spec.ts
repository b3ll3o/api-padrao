// TDD: src/shared/infrastructure/queues/processors/audit.processor.spec.ts
// SDD: .openspec/changes/observabilidade/design.md:REQ-QUEUE-002
// ATDD: test/audit-queue.e2e-spec.ts
import { AuditProcessor } from './audit.processor';
import { PrismaService } from '../../../../prisma/prisma.service';

describe('AuditProcessor (queue: audit)', () => {
  let processor: AuditProcessor;
  let prisma: { auditLog: { create: jest.Mock } };

  beforeEach(() => {
    prisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };
    processor = new AuditProcessor(prisma as unknown as PrismaService);
  });

  function makeJob(overrides: Partial<any> = {}) {
    return {
      id: 'job-audit-1',
      data: {
        acao: 'usuario.create',
        usuarioId: 1,
        recurso: 'usuario:42',
        recursoId: '42',
        detalhes: { nome: 'Alice' },
        ip: '127.0.0.1',
        userAgent: 'jest-test',
      },
      ...overrides,
    } as any;
  }

  it('deve persistir AuditLog com os campos do job', async () => {
    await processor.process(makeJob());
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        acao: 'usuario.create',
        usuarioId: 1,
        recurso: 'usuario:42',
        recursoId: '42',
        ip: '127.0.0.1',
        userAgent: 'jest-test',
      }),
    });
  });

  it('deve tolerar campos opcionais ausentes (LGPD: dados podem ser null)', async () => {
    await processor.process(
      makeJob({
        data: { acao: 'login', recurso: 'auth' },
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        acao: 'login',
        recurso: 'auth',
        usuarioId: undefined,
        recursoId: undefined,
        ip: undefined,
        userAgent: undefined,
      }),
    });
  });

  it('deve propagar exceções do Prisma (contabiliza falha → retry)', async () => {
    prisma.auditLog.create.mockRejectedValue(new Error('db down'));
    await expect(processor.process(makeJob())).rejects.toThrow('db down');
  });

  it('detalhes é passado como objeto (Prisma serializa para JSONB)', async () => {
    const detalhes = { cpf: '********', email: '********' };
    await processor.process(
      makeJob({ data: { acao: 'x', recurso: 'y', detalhes } }),
    );
    const calledData = prisma.auditLog.create.mock.calls[0][0].data;
    expect(calledData.detalhes).toEqual(detalhes);
  });
});
