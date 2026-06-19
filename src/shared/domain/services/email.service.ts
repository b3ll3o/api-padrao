// BDD: N/A (cross-cutting / infraestrutura)
// SDD: N/A
// TDD: src/shared/domain/services/email.service.spec.ts

/**
 * Símbolo de injeção de dependência para o port `EmailService`.
 * Permite que o container NestJS resolva o adapter concreto
 * (`LoggerEmailService` em dev/test, `SmtpEmailService` em prod).
 *
 * BDD: features/email-notifications.feature
 * SDD: .openspec/changes/email-notifications/design.md:REQ-EM-N03 (DIP)
 * ATDD: test/email-notifications.e2e-spec.ts
 * TDD: src/shared/infrastructure/services/logger-email.service.spec.ts
 */
export const EMAIL_SERVICE = Symbol('EMAIL_SERVICE');

/**
 * Mensagem genérica de e-mail a ser entregue pelo adapter.
 */
export interface EmailMessage {
  /** Endereço do destinatário (e-mail do usuário). */
  to: string;
  /** Assunto da mensagem. */
  subject: string;
  /** Corpo em texto plano (em produção, renderizar HTML a partir disto). */
  body: string;
}

/**
 * Port (DIP) para envio de e-mails transacionais.
 *
 * O service de aplicação depende apenas desta abstração; a implementação
 * concreta é resolvida via DI pelo `SharedModule`. Em dev/test, é o
 * `LoggerEmailService` (mock via Pino); em produção, espera-se um
 * `SmtpEmailService` ou integração SES/SendGrid.
 *
 * BDD: features/email-notifications.feature
 * SDD: .openspec/changes/email-notifications/design.md:REQ-EM-N03 (DIP)
 */
export interface EmailService {
  /**
   * Envia uma mensagem de e-mail. A implementação concreta **deve**
   * propagar erros de transporte (SMTP down) — o caller decide se
   * retenta ou enfileira.
   */
  send(message: EmailMessage): Promise<void>;
}
