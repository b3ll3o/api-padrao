// BDD: features/auditoria.feature:Cenário: Eventos de auditoria processados assincronamente
// SDD: .openspec/changes/observabilidade/design.md:REQ-OUTBOX-001..003
// TDD: src/shared/infrastructure/queues/processors/outbox.processor.spec.ts
//
// [B1] Consumer da fila `outbox`. Recebe um job com `{ outboxId }`,
// busca o evento na tabela `outbox_events`, roteia para a fila BullMQ
// correta baseado em `type` e marca `publishedAt` no sucesso.
//
// Padrão: Transactional Outbox.
// - Produtor grava na tabela (no AuditInterceptor, dentro de tx ou
//   direto — ver comentário lá).
// - OutboxPollerService agenda `outbox-publish` aqui para eventos
//   pendentes.
// - Este processor é o ÚNICO lugar que enfileira em AUDIT_QUEUE /
//   EMAIL_QUEUE / REFRESH_FLUSH_QUEUE a partir do outbox.
//
// Falha de enqueue na fila destino:
// - Incrementa `attempts`
// - Persiste `lastError`
// - Aplica backoff exponencial em `scheduledFor` (2^n segundos, max ~32min)
// - Re-throw para o BullMQ contabilizar (caso a fila destino esteja
//   completamente offline — ex.: Redis caído). O scheduler pega de novo.
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import {
  AUDIT_QUEUE,
  EMAIL_QUEUE,
  OUTBOX_QUEUE,
  OUTBOX_TYPE,
  REFRESH_FLUSH_QUEUE,
} from '../queue.constants';
import { PrismaService } from '../../../../prisma/prisma.service';

export interface OutboxPublishJobData {
  /** UUID do registro em `outbox_events` */
  outboxId: string;
}

@Processor(OUTBOX_QUEUE)
export class OutboxProcessor extends WorkerHost {
  private readonly logger = new Logger(OutboxProcessor.name);

  /**
   * [B1] Limite do backoff exponencial: 2^MAX_ATTEMPTS segundos.
   * 2^8 = 256s (~4min). Mantém retries curtos o suficiente para
   * diagnosticar problema real e não travar o pipeline.
   */
  private static readonly MAX_BACKOFF_SHIFT = 8;

  constructor(
    @InjectQueue(AUDIT_QUEUE) private readonly auditQueue: Queue,
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue,
    @InjectQueue(REFRESH_FLUSH_QUEUE) private readonly refreshFlushQueue: Queue,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<OutboxPublishJobData>): Promise<void> {
    const event = await this.prisma.outboxEvent.findUnique({
      where: { id: job.data.outboxId },
    });

    // Já publicado (idempotência — BullMQ pode reentregar) ou sumiu
    // (purga manual). Em ambos os casos, no-op.
    if (!event || event.publishedAt) {
      this.logger.debug?.(
        `[${OUTBOX_QUEUE}] outboxId=${job.data.outboxId} no-op (already published or missing)`,
      );
      return;
    }

    try {
      await this.routeToQueue(event.type, event.payload);
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { publishedAt: new Date() },
      });
      this.logger.log(
        `[${OUTBOX_QUEUE}] published outboxId=${event.id} type=${event.type}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const nextShift = Math.min(
        event.attempts + 1,
        OutboxProcessor.MAX_BACKOFF_SHIFT,
      );
      const backoffMs = 2 ** nextShift * 1000;
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          attempts: { increment: 1 },
          lastError: message,
          scheduledFor: new Date(Date.now() + backoffMs),
        },
      });
      this.logger.warn(
        `[${OUTBOX_QUEUE}] failed outboxId=${event.id} type=${event.type} attempts=${event.attempts + 1} backoffMs=${backoffMs} error=${message}`,
      );
      throw err;
    }
  }

  /**
   * Roteia o evento para a fila BullMQ correta baseado em `type`.
   * Tipos desconhecidos são ignorados (log warning) — não falhamos o
   * job, pois podem ser eventos legados ou de tipos descontinuados.
   */
  private async routeToQueue(type: string, payload: unknown): Promise<void> {
    switch (type) {
      case OUTBOX_TYPE.AUDIT:
        await this.auditQueue.add('audit-log', payload as object);
        return;
      case OUTBOX_TYPE.EMAIL:
        await this.emailQueue.add('email-send', payload as object);
        return;
      case OUTBOX_TYPE.REFRESH_FLUSH:
        await this.refreshFlushQueue.add('flush', payload as object);
        return;
      default:
        this.logger.warn(
          `[${OUTBOX_QUEUE}] unknown outbox type='${type}' — skipping`,
        );
        return;
    }
  }
}
