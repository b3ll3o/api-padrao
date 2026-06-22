// TDD: src/shared/infrastructure/queues/processors/outbox-poller.service.spec.ts
// SDD: .openspec/changes/observabilidade/design.md:REQ-OUTBOX-001..003
//
// Cobertura do [B1] OutboxPollerService:
// - pollNow(): respeita batch (BATCH_SIZE) + scheduledFor
// - onModuleInit(): agenda o setInterval
// - onModuleDestroy(): limpa o setInterval
// - pollSafely(): protege contra overlap (se uma poll estiver em voo,
//   a próxima é skipada)
// - Falha no poll é logada mas não derruba o serviço

import { OutboxPollerService } from './outbox-poller.service';
import { PrismaService } from '../../../../prisma/prisma.service';

describe('OutboxPollerService', () => {
  let service: OutboxPollerService;
  let prisma: { outboxEvent: { findMany: jest.Mock } };
  let outboxQueue: { add: jest.Mock };

  beforeEach(() => {
    jest.useRealTimers();
    prisma = {
      outboxEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    outboxQueue = { add: jest.fn().mockResolvedValue({ id: 'job-pub' }) };
    service = new OutboxPollerService(
      outboxQueue as any,
      prisma as unknown as PrismaService,
    );
  });

  afterEach(() => {
    // Garante que nenhum setInterval agendado em onModuleInit() vaze
    // para o próximo teste (e force Jest a esperar 5s).
    service.onModuleDestroy();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('deve ser definido', () => {
    expect(service).toBeInstanceOf(OutboxPollerService);
  });

  it('pollNow() deve chamar findMany com filtro publishedAt IS NULL E scheduledFor <= now', async () => {
    const before = new Date();
    await service.pollNow();
    const after = new Date();

    expect(prisma.outboxEvent.findMany).toHaveBeenCalledTimes(1);
    const args = prisma.outboxEvent.findMany.mock.calls[0][0];
    expect(args.where.publishedAt).toBeNull();
    expect(args.where.scheduledFor.lte).toBeInstanceOf(Date);
    expect(args.where.scheduledFor.lte.getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    );
    expect(args.where.scheduledFor.lte.getTime()).toBeLessThanOrEqual(
      after.getTime(),
    );
    // batch + orderBy:
    expect(args.take).toBe(50);
    expect(args.orderBy).toEqual({ createdAt: 'asc' });
  });

  it('pollNow() deve enfileirar um job outbox-publish por evento encontrado', async () => {
    prisma.outboxEvent.findMany.mockResolvedValue([
      { id: 'evt-a' },
      { id: 'evt-b' },
      { id: 'evt-c' },
    ]);

    await service.pollNow();

    expect(outboxQueue.add).toHaveBeenCalledTimes(3);
    expect(outboxQueue.add).toHaveBeenNthCalledWith(
      1,
      'outbox-publish',
      { outboxId: 'evt-a' },
      expect.objectContaining({
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: expect.objectContaining({ age: 86400 }),
        removeOnFail: expect.objectContaining({ age: 604800 }),
      }),
    );
    expect(outboxQueue.add).toHaveBeenNthCalledWith(
      2,
      'outbox-publish',
      { outboxId: 'evt-b' },
      expect.any(Object),
    );
    expect(outboxQueue.add).toHaveBeenNthCalledWith(
      3,
      'outbox-publish',
      { outboxId: 'evt-c' },
      expect.any(Object),
    );
  });

  it('pollNow() não deve chamar add se não há eventos', async () => {
    prisma.outboxEvent.findMany.mockResolvedValue([]);

    await service.pollNow();

    expect(outboxQueue.add).not.toHaveBeenCalled();
  });

  it('onModuleInit() deve agendar setInterval e onModuleDestroy() deve limpar', () => {
    jest.useFakeTimers();
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

    service.onModuleInit();
    expect(setIntervalSpy).toHaveBeenCalled();

    service.onModuleDestroy();
    expect(clearIntervalSpy).toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('pollSafely(): falha no poll é capturada e logada, não derruba o serviço', async () => {
    prisma.outboxEvent.findMany.mockRejectedValue(new Error('DB offline'));

    // Não deve lançar — é catch interno.
    await expect(service.pollNow()).resolves.toBeUndefined();

    expect(prisma.outboxEvent.findMany).toHaveBeenCalled();
  });

  it('pollSafely(): protege contra overlap se poll anterior está em voo', async () => {
    // Cenário: findMany demora; chamamos pollNow() duas vezes.
    // Esperado: segundo poll é no-op (polling=true), findMany=1 chamada.
    let resolveFindMany!: (value: unknown) => void;
    let findManyCalls = 0;
    prisma.outboxEvent.findMany.mockImplementation(
      () =>
        new Promise((resolve) => {
          findManyCalls += 1;
          resolveFindMany = resolve;
        }),
    );

    // Inicia primeiro poll (fica pending porque findMany nunca resolve).
    service.pollNow();
    // Segundo poll DEVE retornar imediatamente porque polling=true.
    await service.pollNow();
    expect(findManyCalls).toBe(1);

    // Limpa: resolve o findMany pendente para o finally rodar.
    resolveFindMany([]);
  });

  it('onModuleDestroy() sem onModuleInit() deve ser no-op (sem clearInterval)', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    service.onModuleDestroy();
    expect(clearIntervalSpy).not.toHaveBeenCalled();
  });
});
