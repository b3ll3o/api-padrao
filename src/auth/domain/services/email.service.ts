/**
 * Símbolo de injeção de dependência para o port `EmailService`.
 * Permite que o container NestJS resolva o adapter concreto
 * (`LoggerEmailService` em dev/test, `SmtpEmailService` em prod).
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
 * concreta é resolvida via DI pelo `AuthModule`. Em dev/test, é o
 * `LoggerEmailService` (mock via Pino); em produção, espera-se um
 * `SmtpEmailService` ou integração SES/SendGrid.
 */
export interface EmailService {
  /**
   * Envia uma mensagem de e-mail. A implementação concreta **deve**
   * propagar erros de transporte (SMTP down) — o caller decide se
   * retenta ou enfileira.
   */
  send(message: EmailMessage): Promise<void>;
}
