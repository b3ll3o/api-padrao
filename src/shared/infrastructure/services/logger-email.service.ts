// BDD: N/A (cross-cutting / infraestrutura)
// SDD: N/A
// TDD: src/shared/infrastructure/services/logger-email.service.spec.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  EmailMessage,
  EmailService,
} from '../../domain/services/email.service';

/**
 * Adapter mock do `EmailService` para dev/test.
 *
 * Em vez de integrar com SMTP/SES, loga via Pino (Logger do NestJS).
 * Em produção, este adapter **NÃO** deve ser usado — substitua por
 * `SmtpEmailService` no `SharedModule.providers`.
 *
 * BDD: features/email-notifications.feature
 * SDD: .openspec/changes/email-notifications/design.md:REQ-EM-N02 (não vaza PII em prod)
 * ATDD: test/email-notifications.e2e-spec.ts:LoggerEmailService (adapter Pino) > AC-EM-11
 * TDD: src/shared/infrastructure/services/logger-email.service.spec.ts
 */
// BDD: features/autenticacao.feature:Funcionalidade: Recuperação de Senha
// SDD: .openspec/changes/password-recovery/design.md:REQ-PR-004,NFR-PR-004
@Injectable()
export class LoggerEmailService implements EmailService {
  private readonly logger = new Logger(LoggerEmailService.name);

  async send(message: EmailMessage): Promise<void> {
    // [REQ-EM-N02] Sempre loga `to`, `subject` e o evento `email.sent`.
    // Em produção, NUNCA loga o `body` (PII/tokens podem vazar no corpo).
    // Em dev/test, loga o body para facilitar DX.
    this.logger.log(
      `📧 [EMAIL MOCK] event=email.sent to=${message.to} subject="${message.subject}"`,
    );
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`body=${message.body}`);
    }
  }
}
