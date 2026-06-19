// BDD: features/email-notifications.feature:Cenário: E-mail enviado assincronamente via queue
// SDD: .openspec/changes/observabilidade/design.md:REQ-QUEUE-001
// ATDD: test/email-queue.e2e-spec.ts
// TDD: src/shared/infrastructure/queues/processors/email.processor.spec.ts
//
// Consumer da fila `email`. Processa o job chamando o EmailSenderService
// e captura exceções para que o BullMQ contabilize a falha e faça retry
// com backoff exponencial (configurado em DEFAULT_JOB_OPTIONS).
//
// Por que separar producer (queue.add) de consumer (@Processor)?
// - Producer: enfileira sem bloquear a request (fire-and-forget)
// - Consumer: roda em background, isolado do request lifecycle
// - Retry: falhas (SMTP down, timeout) são retentadas com backoff
//   sem afetar a UX (que já recebeu 202 Accepted)
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EMAIL_QUEUE } from '../queue.constants';
import { EmailSenderService } from '../../../application/services/email-sender.service';

export interface EmailJobData {
  templateId: string;
  to: string;
  variables?: Record<string, string | number>;
}

@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailSender: EmailSenderService) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<void> {
    this.logger.log(
      `[${EMAIL_QUEUE}] processando job ${job.id} (attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 1})`,
    );
    await this.emailSender.send(
      job.data.templateId,
      job.data.to,
      job.data.variables ?? {},
    );
  }
}
