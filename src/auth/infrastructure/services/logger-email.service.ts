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
 * `SmtpEmailService` no `AuthModule.providers`.
 */
// BDD: features/autenticacao.feature:Funcionalidade: Recuperação de Senha
// SDD: .openspec/changes/password-recovery/design.md:REQ-PR-004,NFR-PR-004
@Injectable()
export class LoggerEmailService implements EmailService {
  private readonly logger = new Logger(LoggerEmailService.name);

  async send(message: EmailMessage): Promise<void> {
    this.logger.log(`📧 [EMAIL MOCK] Para: ${message.to}`);
    this.logger.log(`Assunto: ${message.subject}`);
    this.logger.log(`Corpo: ${message.body}`);
  }
}
