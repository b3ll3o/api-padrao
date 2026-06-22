// BDD: features/auditoria.feature:Cenário: Eventos de auditoria processados assincronamente
// SDD: .openspec/changes/observabilidade/design.md:REQ-OUTBOX-001..003
// TDD: src/shared/infrastructure/queues/processors/outbox-poller.service.spec.ts
//
// [B1] Poller da tabela `outbox_events` — agenda jobs `outbox-publish`
// para eventos ainda não publicados, com periodicidade configurável.
//
// Por que polling em vez de trigger síncrono?
//   - AuditInterceptor, EmailProducer, etc. gravam no DB. Eles NÃO
//     falam com Redis diretamente — outbox é a única ponte.
//   - Se Redis cair e voltar, o poller naturalmente reenfileira os
//     pendentes. Sem hot-loop nem retry custom.
//   - Latência do caminho quente: 5s (configurável). Aceitável para
//     auditoria/email.
//
// Concorrência:
//   - Dois processos rodando o mesmo poller podem pegar o mesmo lote.
//     OutboxProcessor é idempotente (checa publishedAt antes de
//     publicar e usa update com guard).
//   - Para produção multi-instance, considerar `SELECT FOR UPDATE
//     SKIP LOCKED` (Postgres 9.5+). Aqui mantemos simples — a
//     duplicação é benigna (BullMQ + idempotência do processor
//     resolvem).
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OUTBOX_QUEUE } from '../queue.constants';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class OutboxPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPollerService.name);
  private intervalHandle: NodeJS.Timeout | undefined;
  private polling = false;

  /** Intervalo do poll em ms. Default 5s — equilibra latência e carga. */
  private static readonly POLL_INTERVAL_MS = 5_000;

  /** Tamanho do lote por poll. Default 50 — evita burst em Redis. */
  private static readonly BATCH_SIZE = 50;

  constructor(
    @InjectQueue(OUTBOX_QUEUE) private readonly outboxQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(
      () => this.pollSafely(),
      OutboxPollerService.POLL_INTERVAL_MS,
    );
    // Não mantém o processo vivo por causa do poll (em testes pode
    // importar para shutdown rápido).
    this.intervalHandle.unref?.();
    this.logger.log(
      `[${OUTBOX_QUEUE}] poller started (interval=${OutboxPollerService.POLL_INTERVAL_MS}ms batch=${OutboxPollerService.BATCH_SIZE})`,
    );
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }
    this.logger.log(`[${OUTBOX_QUEUE}] poller stopped`);
  }

  /**
   * Wrapper defensivo — protege contra poll sobreposto se o anterior
   * ainda estiver em voo (DB lento, por exemplo).
   */
  private async pollSafely(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      await this.poll();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[${OUTBOX_QUEUE}] poll iteration failed: ${message}`);
    } finally {
      this.polling = false;
    }
  }

  /**
   * Lote de eventos pendentes cujo `scheduledFor` já passou.
   * Enfileira cada um como job `outbox-publish` na fila `outbox`.
   */
  private async poll(): Promise<void> {
    const events = await this.prisma.outboxEvent.findMany({
      where: {
        publishedAt: null,
        scheduledFor: { lte: new Date() },
      },
      take: OutboxPollerService.BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
    });

    if (events.length === 0) return;

    for (const event of events) {
      await this.outboxQueue.add(
        'outbox-publish',
        { outboxId: event.id },
        {
          attempts: 5,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { age: 86400 },
          removeOnFail: { age: 604800 },
        },
      );
    }

    this.logger.debug?.(
      `[${OUTBOX_QUEUE}] enqueued ${events.length} outbox-publish jobs`,
    );
  }

  /**
   * Expõe o método `poll` para testes — permite acionar manualmente
   * sem depender do setInterval.
   */
  async pollNow(): Promise<void> {
    await this.pollSafely();
  }
}
