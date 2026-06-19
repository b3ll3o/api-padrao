// BDD: N/A (cross-cutting / infraestrutura)
// SDD: N/A
// TDD: src/shared/application/decorators/audit.decorator.spec.ts

import { SetMetadata } from '@nestjs/common';

export interface AuditOptions {
  acao: string;
  recurso: string;
}

export const AUDIT_KEY = 'audit_logging';
export const Auditar = (options: AuditOptions) =>
  SetMetadata(AUDIT_KEY, options);
