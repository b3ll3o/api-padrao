// BDD: features/auth.feature:Cenário: Refresh tokens expirados são limpos periodicamente
// SDD: .openspec/changes/observabilidade/design.md:REQ-QUEUE-003
// ATDD: test/refresh-flush-queue.e2e-spec.ts
// TDD: src/shared/infrastructure/queues/processors/refresh-flush.processor.spec.ts
//
// Consumer da fila `refresh-flush`. Remove refresh tokens expirados do
// banco de dados para evitar acúmulo. Disparado periodicamente via
// scheduler (cron) ou manualmente via endpoint admin.
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { REFRESH_FLUSH_QUEUE } from '../queue.constants';
import { PrismaService } from '../../../../prisma/prisma.service';

export interface RefreshFlushJobData {
  /** ISO 8601 cutoff — remove tokens com expiresAt < cutoff */
  cutoff: string;
  /** Se true, remove também tokens revogados antes do cutoff */
  includeRevoked?: boolean;
}

@Processor(REFRESH_FLUSH_QUEUE)
export class RefreshFlushProcessor extends WorkerHost {
  private readonly logger = new Logger(RefreshFlushProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<RefreshFlushJobData>): Promise<{
    removed: number;
    cutoff: string;
  }> {
    this.logger.log(
      `[${REFRESH_FLUSH_QUEUE}] processando job ${job.id} cutoff=${job.data.cutoff}`,
    );
    const cutoff = new Date(job.data.cutoff);

    // Estratégia: deleta refresh tokens onde
    //   expiresAt < cutoff AND (revokedAt IS NULL OR revokedAt < cutoff)
    // Soft approach: o `revokedAt` é setado em logout; expirados sem
    // revogação também são removidos para economizar espaço.
    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        expiresAt: { lt: cutoff },
        ...(job.data.includeRevoked
          ? {
              OR: [{ revokedAt: null }, { revokedAt: { lt: cutoff } }],
            }
          : {}),
      },
    });

    this.logger.log(
      `[${REFRESH_FLUSH_QUEUE}] job ${job.id} removed=${result.count} tokens`,
    );
    return {
      removed: result.count,
      cutoff: job.data.cutoff,
    };
  }
}
