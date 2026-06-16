import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Template de e-mail transacional, carregado de `v1/*.tpl`.
 *
 * BDD: features/email-notifications.feature
 * SDD: .openspec/changes/email-notifications/design.md:REQ-EM-08
 * ATDD: test/email-notifications.e2e-spec.ts:TemplateLoaderService (boot) > AC-EM-07
 * TDD: src/shared/infrastructure/services/template-loader.service.spec.ts
 */
export interface EmailTemplate {
  templateId: string;
  subject: string;
  body: string;
}

/**
 * Whitelist hardcoded de templates conhecidos. Garante defesa contra typos
 * e path-traversal — `EmailSenderService` valida `templateId` contra este
 * conjunto antes de delegar ao `TemplateLoaderService`.
 *
 * SDD: .openspec/changes/email-notifications/design.md:REQ-EM-10
 */
export const KNOWN_TEMPLATES: readonly string[] = [
  'auth.password_reset',
  'usuarios.welcome',
  'usuarios.password_changed',
  'empresas.user_added',
  'usuarios.account_disabled',
] as const;

/**
 * Carrega templates de e-mail a partir do filesystem no boot da aplicação.
 *
 * BDD: features/email-notifications.feature:Cenário: Aplicação não sobe se template obrigatório está ausente
 * SDD: .openspec/changes/email-notifications/design.md:REQ-EM-08, REQ-EM-N04
 * ATDD: test/email-notifications.e2e-spec.ts
 * TDD: src/shared/infrastructure/services/template-loader.service.spec.ts
 */
@Injectable()
export class TemplateLoaderService implements OnModuleInit {
  private readonly logger = new Logger(TemplateLoaderService.name);
  private readonly cache = new Map<string, EmailTemplate>();
  private readonly templatesDir: string;
  private loaded = false;

  constructor(configService: ConfigService) {
    // Default: src/shared/infrastructure/templates/v1 (relativo ao cwd do processo).
    // Em produção, sobrescrever via env `TEMPLATES_DIR` se necessário.
    const configured = configService.get<string>('TEMPLATES_DIR') ?? null;
    this.templatesDir = configured
      ? resolve(configured)
      : resolve(process.cwd(), 'src/shared/infrastructure/templates/v1');
  }

  /**
   * Hook de inicialização: carrega todos os templates v1 no boot.
   * Falha de leitura aborta o boot (fail-fast — REQ-EM-08).
   */
  onModuleInit(): void {
    this.loadAll();
  }

  /**
   * Carrega (ou recarrega) todos os templates do diretório configurado.
   *
   * - Lê todos os arquivos `*.tpl` em `templatesDir`.
   * - Faz parse de `Subject:` e `Body:` (case-insensitive).
   * - Valida o rodapé LGPD (`descadastro` + `dpo@`) — REQ-EM-N04.
   * - Armazena em `Map<templateId, EmailTemplate>`.
   *
   * @throws Error se diretório ausente, arquivo malformado, ou rodapé inválido.
   */
  loadAll(): Map<string, EmailTemplate> {
    this.cache.clear();

    if (!existsSync(this.templatesDir)) {
      throw new Error(
        `[TemplateLoaderService] Diretório de templates não encontrado: ${this.templatesDir}`,
      );
    }

    const files = readdirSync(this.templatesDir).filter((f) =>
      f.endsWith('.tpl'),
    );

    if (files.length === 0) {
      throw new Error(
        `[TemplateLoaderService] Nenhum template .tpl encontrado em ${this.templatesDir}`,
      );
    }

    for (const file of files) {
      const templateId = file.replace(/\.tpl$/, '');
      const fullPath = join(this.templatesDir, file);
      const content = readFileSync(fullPath, 'utf8');
      const template = this.parseTemplate(templateId, content);
      this.validateLgpdFooter(templateId, template.body);
      this.cache.set(templateId, template);
    }

    this.loaded = true;
    this.logger.log(
      `Templates carregados: ${this.cache.size} (${Array.from(this.cache.keys()).join(', ')})`,
    );

    return this.cache;
  }

  /**
   * Retorna um template do cache em memória.
   */
  get(templateId: string): EmailTemplate | undefined {
    if (!this.loaded) {
      // Em testes ou chamadas antecipadas, carrega preguiçosamente.
      this.loadAll();
    }
    return this.cache.get(templateId);
  }

  /**
   * Lista os `templateId` conhecidos. Útil para a whitelist
   * `KNOWN_TEMPLATES` consumida pelo `EmailSenderService`.
   */
  list(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Faz o parse de um arquivo `.tpl` no formato:
   *
   * ```
   * Subject: <assunto>
   *
   * Body: <corpo com placeholders {{variavel}}>
   * ```
   *
   * Case-insensitive em "Subject" e "Body". O corpo pode ter múltiplas
   * linhas; termina no EOF.
   */
  private parseTemplate(templateId: string, content: string): EmailTemplate {
    const subjectMatch = content.match(
      /^Subject:\s*([\s\S]*?)\r?\n\r?\nBody:\s*/im,
    );
    if (!subjectMatch) {
      throw new Error(
        `[TemplateLoaderService] Template '${templateId}' malformado: esperado formato 'Subject: ...\\n\\nBody: ...'`,
      );
    }
    const subject = subjectMatch[1].trim();
    const bodyStart = subjectMatch[0].length;
    const body = content.substring(bodyStart).trim();

    if (!subject || !body) {
      throw new Error(
        `[TemplateLoaderService] Template '${templateId}' malformado: subject ou body vazio`,
      );
    }

    return { templateId, subject, body };
  }

  /**
   * Valida que o body contém o rodapé LGPD exigido: `descadastro` e `dpo@`.
   * SDD: REQ-EM-N04
   */
  private validateLgpdFooter(templateId: string, body: string): void {
    if (!/descadastro|unsubscribe/i.test(body)) {
      throw new Error(
        `[TemplateLoaderService] Template '${templateId}' não contém 'descadastro'/'unsubscribe' no rodapé (REQ-EM-N04)`,
      );
    }
    if (!/dpo@/i.test(body)) {
      throw new Error(
        `[TemplateLoaderService] Template '${templateId}' não contém 'dpo@' no rodapé (REQ-EM-N04)`,
      );
    }
  }
}
