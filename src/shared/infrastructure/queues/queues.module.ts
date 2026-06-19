// BDD: features/email-notifications.feature:Cenário: E-mail enviado assincronamente
// BDD: features/auditoria.feature:Cenário: Eventos de auditoria processados assincronamente
// SDD: .openspec/changes/observabilidade/design.md:REQ-QUEUE-001..005
// ATDD: test/queues.e2e-spec.ts
// TDD: src/shared/infrastructure/queues/queues.module.spec.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import {
  AUDIT_QUEUE,
  EMAIL_QUEUE,
  REFRESH_FLUSH_QUEUE,
  DEFAULT_JOB_OPTIONS,
} from './queue.constants';
import { EmailProcessor } from './processors/email.processor';
import { AuditProcessor } from './processors/audit.processor';
import { RefreshFlushProcessor } from './processors/refresh-flush.processor';
import { PrismaModule } from '../../../prisma/prisma.module';
import { SharedModule } from '../../shared.module';

/**
 * Módulo de filas BullMQ.
 *
 * Produtores enfileiram jobs via `InjectQueue(NAME).add(data, options)`.
 * Consumidores (processadores) implementam `process(job)` e rodam em
 * background com retry exponencial.
 *
 * Default job options:
 *   - attempts: 3 (retry até 3x)
 *   - backoff: exponencial 1s → 2s → 4s
 *   - removeOnComplete: true (libera Redis; ajustar para false se precisar
 *     de auditoria de jobs completos)
 *   - removeOnFail: false (mantém no Redis para inspeção via Bull Board)
 */
@Module({
  imports: [
    PrismaModule,
    SharedModule,
    BullModule.registerQueue(
      { name: EMAIL_QUEUE, defaultJobOptions: DEFAULT_JOB_OPTIONS },
      { name: AUDIT_QUEUE, defaultJobOptions: DEFAULT_JOB_OPTIONS },
      { name: REFRESH_FLUSH_QUEUE, defaultJobOptions: DEFAULT_JOB_OPTIONS },
    ),
  ],
  providers: [EmailProcessor, AuditProcessor, RefreshFlushProcessor],
  exports: [BullModule],
})
export class QueuesModule {}
