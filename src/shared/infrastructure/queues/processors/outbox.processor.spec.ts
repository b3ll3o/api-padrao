// TDD: src/shared/infrastructure/queues/processors/outbox.processor.spec.ts
// SDD: .openspec/changes/observabilidade/design.md:REQ-OUTBOX-001..003
// ATDD: test/outbox-queue.e2e-spec.ts
//
// Cobertura do [B1] OutboxProcessor:
// - Roteia corretamente para AUDIT_QUEUE / EMAIL_QUEUE / REFRESH_FLUSH_QUEUE
//   baseado em `type`.
// - Marca `publishedAt` após publish bem-sucedido.
// - Incrementa `attempts`, persiste `lastError` e agenda `scheduledFor`
//   com backoff exponencial em caso de falha.
// - Idempotência: já publicado / missing → no-op.

import { OutboxProcessor } from './outbox.processor';
import { PrismaService } from '../../../../prisma/prisma.service';

describe('OutboxProcessor (queue: outbox)', () => {
  let processor: OutboxProcessor;
  let prisma: {
    outboxEvent: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let auditQueue: { add: jest.Mock };
  let emailQueue: { add: jest.Mock };
  let refreshFlushQueue: { add: jest.Mock };

  beforeEach(() => {
    prisma = {
      outboxEvent: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    auditQueue = { add: jest.fn().mockResolvedValue({ id: 'job-a' }) };
    emailQueue = { add: jest.fn().mockResolvedValue({ id: 'job-e' }) };
    refreshFlushQueue = { add: jest.fn().mockResolvedValue({ id: 'job-r' }) };

    processor = new OutboxProcessor(
      auditQueue as any,
      emailQueue as any,
      refreshFlushQueue as any,
      prisma as unknown as PrismaService,
    );
  });

  function makeJob(outboxId: string) {
    return { id: 'job-1', data: { outboxId } } as any;
  }

  it('deve ser definido', () => {
    expect(processor).toBeInstanceOf(OutboxProcessor);
  });

  it('deve rotear evento type=audit para AUDIT_QUEUE e marcar como publicado', async () => {
    prisma.outboxEvent.findUnique.mockResolvedValue({
      id: 'evt-1',
      type: 'audit',
      payload: { acao: 'usuario.create' },
      publishedAt: null,
      attempts: 0,
    });

    await processor.process(makeJob('evt-1'));

    expect(auditQueue.add).toHaveBeenCalledWith('audit-log', {
      acao: 'usuario.create',
    });
    expect(emailQueue.add).not.toHaveBeenCalled();
    expect(refreshFlushQueue.add).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: { publishedAt: expect.any(Date) },
    });
  });

  it('deve rotear evento type=email para EMAIL_QUEUE', async () => {
    prisma.outboxEvent.findUnique.mockResolvedValue({
      id: 'evt-2',
      type: 'email',
      payload: { templateId: 'welcome', to: 'a@b.com' },
      publishedAt: null,
      attempts: 0,
    });

    await processor.process(makeJob('evt-2'));

    expect(emailQueue.add).toHaveBeenCalledWith('email-send', {
      templateId: 'welcome',
      to: 'a@b.com',
    });
    expect(auditQueue.add).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-2' },
      data: { publishedAt: expect.any(Date) },
    });
  });

  it('deve rotear evento type=refresh_flush para REFRESH_FLUSH_QUEUE', async () => {
    prisma.outboxEvent.findUnique.mockResolvedValue({
      id: 'evt-3',
      type: 'refresh_flush',
      payload: { cutoff: '2026-06-22T00:00:00Z' },
      publishedAt: null,
      attempts: 0,
    });

    await processor.process(makeJob('evt-3'));

    expect(refreshFlushQueue.add).toHaveBeenCalledWith('flush', {
      cutoff: '2026-06-22T00:00:00Z',
    });
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-3' },
      data: { publishedAt: expect.any(Date) },
    });
  });

  it('não deve publicar nem marcar se evento já tem publishedAt (idempotência)', async () => {
    prisma.outboxEvent.findUnique.mockResolvedValue({
      id: 'evt-4',
      type: 'audit',
      payload: {},
      publishedAt: new Date('2026-06-22T00:00:00Z'),
      attempts: 0,
    });

    await processor.process(makeJob('evt-4'));

    expect(auditQueue.add).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.update).not.toHaveBeenCalled();
  });

  it('não deve publicar nem marcar se evento não existe (purga)', async () => {
    prisma.outboxEvent.findUnique.mockResolvedValue(null);

    await processor.process(makeJob('evt-missing'));

    expect(auditQueue.add).not.toHaveBeenCalled();
    expect(emailQueue.add).not.toHaveBeenCalled();
    expect(refreshFlushQueue.add).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.update).not.toHaveBeenCalled();
  });

  it('deve incrementar attempts e persistir lastError em falha; re-throw para BullMQ', async () => {
    prisma.outboxEvent.findUnique.mockResolvedValue({
      id: 'evt-5',
      type: 'audit',
      payload: { acao: 'x' },
      publishedAt: null,
      attempts: 2,
    });
    auditQueue.add.mockRejectedValue(new Error('Redis offline'));

    const before = Date.now();
    await expect(processor.process(makeJob('evt-5'))).rejects.toThrow(
      'Redis offline',
    );
    const after = Date.now();

    expect(prisma.outboxEvent.update).toHaveBeenCalledTimes(1);
    const updateArgs = prisma.outboxEvent.update.mock.calls[0][0];
    expect(updateArgs.where.id).toBe('evt-5');
    expect(updateArgs.data.attempts).toEqual({ increment: 1 });
    expect(updateArgs.data.lastError).toBe('Redis offline');
    // scheduledFor: 2^(2+1) = 8 segundos no futuro
    expect(updateArgs.data.scheduledFor).toBeInstanceOf(Date);
    const expectedDelayMs = 2 ** 3 * 1000;
    expect(updateArgs.data.scheduledFor.getTime()).toBeGreaterThanOrEqual(
      before + expectedDelayMs - 50,
    );
    expect(updateArgs.data.scheduledFor.getTime()).toBeLessThanOrEqual(
      after + expectedDelayMs + 50,
    );
  });

  it('deve ignorar tipos desconhecidos sem falhar o job (log warning, no publish)', async () => {
    prisma.outboxEvent.findUnique.mockResolvedValue({
      id: 'evt-6',
      type: 'unknown_type',
      payload: {},
      publishedAt: null,
      attempts: 0,
    });

    await processor.process(makeJob('evt-6'));

    expect(auditQueue.add).not.toHaveBeenCalled();
    expect(emailQueue.add).not.toHaveBeenCalled();
    expect(refreshFlushQueue.add).not.toHaveBeenCalled();
    // Tipo desconhecido = tratado como no-op positivo (sem retry):
    // não é falha — só não temos handler para ele.
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-6' },
      data: { publishedAt: expect.any(Date) },
    });
  });

  it('backoff exponencial: attempts=0 → ~2s, attempts=4 → ~32s', async () => {
    prisma.outboxEvent.findUnique.mockResolvedValue({
      id: 'evt-7',
      type: 'audit',
      payload: {},
      publishedAt: null,
      attempts: 4,
    });
    auditQueue.add.mockRejectedValue(new Error('boom'));

    await expect(processor.process(makeJob('evt-7'))).rejects.toThrow('boom');

    const updateArgs = prisma.outboxEvent.update.mock.calls[0][0];
    // attempts=4 → nextShift=5 → 2^5 = 32s = 32000ms
    const delay = updateArgs.data.scheduledFor.getTime() - Date.now();
    expect(delay).toBeGreaterThan(30_000);
    expect(delay).toBeLessThan(35_000);
  });
});
