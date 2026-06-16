import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailService,
  EMAIL_SERVICE,
} from '../../domain/services/email.service';
import {
  EmailTemplate,
  KNOWN_TEMPLATES,
  TemplateLoaderService,
} from '../../infrastructure/services/template-loader.service';

/**
 * Símbolo de DI para o serviço de envio de e-mails transacionais.
 * Camada de aplicação (orquestração): valida `templateId`, renderiza
 * placeholders, e delega ao port `EmailService`.
 *
 * BDD: features/email-notifications.feature
 * SDD: .openspec/changes/email-notifications/design.md:REQ-EM-07, REQ-EM-09, REQ-EM-10
 */
export const EMAIL_SENDER_SERVICE = Symbol('EMAIL_SENDER_SERVICE');

/**
 * Contrato público do serviço de envio de e-mails transacionais.
 * Garante o princípio de "não bloqueia" (REQ-EM-07): nunca lança exceção.
 */
export interface EmailSenderService {
  /**
   * Envia um e-mail a partir de um template versionado.
   *
   * - Variáveis em `{{chave}}` são substituídas por valores de `variables`.
   * - Variáveis `{{APP_NAME}}`, `{{APP_LOGIN_URL}}` e `{{ano_atual}}`
   *   são injetadas automaticamente.
   * - Falha de envio é logada em warn e engolida (request HTTP não é afetada).
   *
   * @param templateId ID whitelisted do template (ver `KNOWN_TEMPLATES`).
   * @param to Endereço de e-mail do destinatário.
   * @param variables Variáveis de renderização (placeholders do template).
   */
  send(
    templateId: string,
    to: string,
    variables?: Record<string, string | number>,
  ): Promise<void>;
}

// Regex de validação do templateId — defesa contra path-traversal e typos.
// Aceita apenas letras minúsculas, dígitos, underscore e ponto (ex.: "auth.password_reset").
// SDD: REQ-EM-10
const TEMPLATE_ID_REGEX = /^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/;

// Regex para extrair placeholders {{var}} do template.
const PLACEHOLDER_REGEX = /\{\{(\w+)\}\}/g;

// Regex simples de e-mail — usado para validar `to` antes do envio.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Implementação padrão do `EmailSenderService`.
 *
 * BDD: features/email-notifications.feature
 * SDD: .openspec/changes/email-notifications/design.md:REQ-EM-07, REQ-EM-09, REQ-EM-10, REQ-EM-N01
 * ATDD: test/email-notifications.e2e-spec.ts:EmailSenderService (orquestrador)
 * TDD: src/shared/application/services/email-sender.service.spec.ts
 */
@Injectable()
export class DefaultEmailSenderService implements EmailSenderService {
  private readonly logger = new Logger(DefaultEmailSenderService.name);
  private readonly templateIdsWhitelist: Set<string>;

  constructor(
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
    private readonly templateLoader: TemplateLoaderService,
    private readonly configService: ConfigService,
  ) {
    this.templateIdsWhitelist = new Set(KNOWN_TEMPLATES);
  }

  /**
   * Renderiza template e delega ao `EmailService` (port).
   * Falhas são engolidas (REQ-EM-07).
   */
  async send(
    templateId: string,
    to: string,
    variables: Record<string, string | number> = {},
  ): Promise<void> {
    // 1. Kill-switch global: se desabilitado, no-op silencioso.
    if (
      this.configService.get<string>('EMAIL_NOTIFICATIONS_ENABLED') === 'false'
    ) {
      this.logger.debug(
        {
          event: 'email.skipped',
          templateId,
          motivo: 'EMAIL_NOTIFICATIONS_ENABLED=false',
        },
        'Envio de e-mail suprimido por kill-switch',
      );
      return;
    }

    // 2. Validar formato do templateId (defesa contra path-traversal).
    if (!TEMPLATE_ID_REGEX.test(templateId)) {
      this.logger.warn(
        { event: 'email.invalid_template', templateId, motivo: 'regex' },
        'event=email.invalid_template — templateId inválido (caracteres não permitidos pela regex), ignorado',
      );
      return;
    }

    // 3. Validar templateId contra whitelist.
    if (!this.templateIdsWhitelist.has(templateId)) {
      this.logger.warn(
        { event: 'email.invalid_template', templateId, motivo: 'whitelist' },
        'event=email.invalid_template — template não está na whitelist KNOWN_TEMPLATES, ignorado',
      );
      return;
    }

    // 4. Validar `to` como e-mail.
    if (!EMAIL_REGEX.test(to)) {
      this.logger.warn(
        { event: 'email.invalid_recipient', to },
        'Endereço de e-mail inválido — ignorado',
      );
      return;
    }

    // 5. Buscar template em cache.
    const template = this.templateLoader.get(templateId);
    if (!template) {
      this.logger.warn(
        { event: 'email.template_missing', templateId },
        'Template não encontrado em cache — ignorado',
      );
      return;
    }

    // 6. Montar variáveis (injetar automaticamente APP_NAME/APP_LOGIN_URL/ano_atual).
    const vars: Record<string, string | number> = {
      ...variables,
      APP_NAME: this.configService.get<string>('APP_NAME') ?? 'API Padrão',
      APP_LOGIN_URL:
        this.configService.get<string>('APP_LOGIN_URL') ??
        'http://localhost:3000',
      ano_atual: new Date().getFullYear(),
    };

    // 7. Validar placeholders do template (fail-fast de authoring — REQ-EM-09).
    this.assertPlaceholdersProvided(template, vars);

    // 8. Renderizar.
    const subject = this.render(template.subject, vars);
    const body = this.render(template.body, vars);

    // 9. Delegar ao EmailService (try/catch — REQ-EM-07).
    try {
      await this.emailService.send({ to, subject, body });
      this.logger.log(
        { event: 'email.sent', template: templateId, to },
        'event=email.sent — E-mail enviado',
      );
    } catch (err) {
      this.logger.warn(
        {
          event: 'email.failed',
          template: templateId,
          to,
          error: err instanceof Error ? err.message : String(err),
        },
        'event=email.failed — Falha no envio de e-mail (engolida, não-bloqueante)',
      );
    }
  }

  /**
   * Substitui `{{var}}` por `vars[var]`. Valores `undefined` viram string vazia.
   * Se algum placeholder do template não estiver em `vars`, lança `Error`
   * (fail-fast de authoring — REQ-EM-09).
   *
   * Visibilidade pública para testes unitários.
   */
  // BDD: features/email-notifications.feature:Cenário: Renderer de template substitui placeholders corretamente
  // SDD: .openspec/changes/email-notifications/design.md:REQ-EM-09
  render(text: string, vars: Record<string, string | number>): string {
    const missing: string[] = [];
    const replaced = text.replace(PLACEHOLDER_REGEX, (_match, key: string) => {
      if (Object.prototype.hasOwnProperty.call(vars, key)) {
        const v = vars[key];
        return v === undefined || v === null ? '' : String(v);
      }
      missing.push(key);
      return '';
    });
    if (missing.length > 0) {
      throw new Error(
        `Placeholder {{${missing[0]}}} não encontrado em variables para template`,
      );
    }
    return replaced;
  }

  /**
   * Lança se houver placeholders no template que não estão em `vars`.
   * Diferente de `render`, esta função verifica ambos subject e body
   * para detectar placeholders faltantes.
   */
  private assertPlaceholdersProvided(
    template: EmailTemplate,
    vars: Record<string, string | number>,
  ): void {
    const templatePlaceholders = new Set<string>();
    const collect = (text: string) => {
      const matches = text.matchAll(PLACEHOLDER_REGEX);
      for (const m of matches) {
        templatePlaceholders.add(m[1]);
      }
    };
    collect(template.subject);
    collect(template.body);

    for (const ph of templatePlaceholders) {
      if (!Object.prototype.hasOwnProperty.call(vars, ph)) {
        throw new Error(
          `Placeholder {{${ph}}} não encontrado em variables para template ${template.templateId}`,
        );
      }
    }
  }
}
