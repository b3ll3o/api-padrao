// BDD: features/auditoria.feature:Cenário: Eventos de auditoria processados assincronamente
// SDD: .openspec/changes/observabilidade/design.md:REQ-QUEUE-002
// ATDD: test/audit-queue.e2e-spec.ts
// TDD: src/shared/infrastructure/queues/processors/audit.processor.spec.ts
//
// Consumer da fila `audit`. Persiste eventos de auditoria no banco
// (prisma) de forma assíncrona para não bloquear o request.
//
// LGPD: dados sensíveis (cpf, cnpj, telefone, email) são sanitizados
// no AuditInterceptor ANTES de enfileirar (mascarados como '********').
// O processor confia que os dados já chegam sanitizados.
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AUDIT_QUEUE } from '../queue.constants';
import { PrismaService } from '../../../../prisma/prisma.service';

export interface AuditJobData {
  /** Identificador da ação auditada (ex.: 'usuario.create') */
  acao: string;
  /** ID do usuário que executou a ação (de JWT) */
  usuarioId?: number;
  /** Recurso afetado (ex.: 'usuario:42') */
  recurso: string;
  /** ID do recurso afetado */
  recursoId?: string;
  /** Detalhes adicionais do evento (já sanitizados) */
  detalhes?: Record<string, unknown>;
  /** IP do request */
  ip?: string;
  /** User-Agent do request */
  userAgent?: string;
}

@Processor(AUDIT_QUEUE)
export class AuditProcessor extends WorkerHost {
  private readonly logger = new Logger(AuditProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<AuditJobData>): Promise<void> {
    this.logger.log(
      `[${AUDIT_QUEUE}] processando job ${job.id} acao=${job.data.acao}`,
    );
    await this.prisma.auditLog.create({
      data: {
        acao: job.data.acao,
        usuarioId: job.data.usuarioId,
        recurso: job.data.recurso,
        recursoId: job.data.recursoId,
        detalhes: job.data.detalhes ? (job.data.detalhes as any) : undefined,
        ip: job.data.ip,
        userAgent: job.data.userAgent,
      },
    });
  }
}
