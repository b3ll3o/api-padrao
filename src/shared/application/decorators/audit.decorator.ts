import { SetMetadata } from '@nestjs/common';

export interface AuditOptions {
  acao: string;
  recurso: string;
}

export const AUDIT_KEY = 'audit_logging';
export const Auditar = (options: AuditOptions) =>
  SetMetadata(AUDIT_KEY, options);
