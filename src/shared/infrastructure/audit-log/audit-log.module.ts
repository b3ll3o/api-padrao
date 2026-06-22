// BDD: features/observabilidade.feature:Cenário: Logs de auditoria acessíveis via cursor
// SDD: .openspec/changes/observabilidade/design.md:REQ-AUDIT-READ-001
// TDD: src/shared/infrastructure/audit-log/audit-log.module.spec.ts
//
// Módulo dedicado para leitura de audit logs via cursor pagination.
//
// Não usa `@Global()` — `PrismaAuditLogRepository` é exposto apenas
// para o `AuditLogController` interno. Se um dia outro módulo precisar
// ler audit logs programaticamente, importar este módulo e injetar o
// repository diretamente.
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PrismaAuditLogRepository } from '../repositories/prisma-audit-log.repository';
import { AuditLogController } from '../controllers/audit-log.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AuditLogController],
  providers: [PrismaAuditLogRepository],
  exports: [PrismaAuditLogRepository],
})
export class AuditLogModule {}
