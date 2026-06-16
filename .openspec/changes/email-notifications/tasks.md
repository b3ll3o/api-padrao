# Feature: Notificações por E-mail (email-notifications) — Tasks

> **Status**: tasks **pendentes** (change prospectivo). Esta é a lista de execução que guia a implementação na fase de Build Mode, após aprovação do `proposal.md` e `design.md`. Marcar `[x]` apenas após o teste/verificação rodar verde.

## Implementation Tasks

### Phase 1: Preparation (OpenSpec)

- [ ] Criar diretório `.openspec/changes/email-notifications/`
- [ ] Escrever `proposal.md` (Why, What Changes, Impact, Risks, 6 Alternatives Considered)
- [ ] Escrever `design.md` (RFC 2119: 10 REQ + 6 NFR; 14 AC; 11 cenários BDD; 16 Edge Cases; RTM 16 linhas)
- [ ] **Revisar e aprovar** `proposal.md` + `design.md` antes de prosseguir

### Phase 2: Refactor — mover `EmailService` para `shared/`

- [ ] Criar `src/shared/domain/services/email.service.ts`:
  - Mover `EMAIL_SERVICE` (Symbol), `EmailMessage` (interface), `EmailService` (interface) de `src/auth/domain/services/email.service.ts`
  - JSDoc atualizado referenciando REQ-EM-N03 (DIP) e o `@deprecated` no caminho antigo
- [ ] Criar `src/shared/infrastructure/services/logger-email.service.ts`:
  - Mover `LoggerEmailService` de `src/auth/infrastructure/services/logger-email.service.ts`
  - Adicionar lógica de suprimir `body` em `NODE_ENV=production` (REQ-EM-N02)
  - JSDoc atualizado
- [ ] Criar re-exports com `@deprecated` em `src/auth/domain/services/email.service.ts`:
  - `export { EMAIL_SERVICE, EmailMessage, EmailService } from '../../../shared/domain/services/email.service';` com `/** @deprecated Importar de src/shared/domain/services/email.service */`
- [ ] Criar re-exports com `@deprecated` em `src/auth/infrastructure/services/logger-email.service.ts`:
  - `export { LoggerEmailService } from '../../../shared/infrastructure/services/logger-email.service';` com `/** @deprecated Importar de src/shared/infrastructure/services/logger-email.service */`
- [ ] Atualizar imports em `src/auth/auth.module.ts`:
  - Trocar `import { EMAIL_SERVICE } from './domain/services/email.service';` → `from '../../shared/domain/services/email.service';`
  - Trocar `import { LoggerEmailService } from './infrastructure/services/logger-email.service';` → `from '../../shared/infrastructure/services/logger-email.service';`
- [ ] **Remover** o binding `{ provide: EMAIL_SERVICE, useClass: LoggerEmailService }` do `AuthModule.providers` (passa a vir do `SharedModule`)
- [ ] **Validar build**: `npm run build` deve compilar sem erro e sem `any` injustificado

### Phase 3: Domain Discovery (BDD)

- [ ] Criar `features/email-notifications.feature` (novo arquivo, dedicado):
  - `Funcionalidade: Notificações por E-mail Transacionais`
  - 11 cenários (lista completa no `design.md` §"BDD Scenarios Associated"):
    - `Cenário: E-mail de recuperação de senha continua sendo enviado via template auth.password_reset` (REQ-EM-01)
    - `Cenário: E-mail de recuperação preserva anti-enumeração` (REQ-EM-06)
    - `Cenário: E-mail de confirmação enviado após reset de senha` (REQ-EM-03)
    - `Cenário: E-mail de boas-vindas enviado ao criar usuário` (REQ-EM-02)
    - `Cenário: E-mail de boas-vindas NÃO é enviado se EMAIL_NOTIFICATIONS_ENABLED=false` (REQ-EM-02 + kill-switch)
    - `Cenário: E-mail de vínculo a empresa lista os perfis atribuídos` (REQ-EM-04)
    - `Cenário: E-mail de desativação enviado quando usuário é desativado` (REQ-EM-05)
    - `Cenário: Falha no envio NÃO bloqueia a request` (REQ-EM-07)
    - `Cenário: Renderer de template substitui placeholders corretamente` (REQ-EM-09)
    - `Cenário: templateId inválido é rejeitado e logado` (REQ-EM-10)
    - `Cenário: Aplicação não sobe se template obrigatório está ausente` (REQ-EM-08)
- [ ] Mapear cenários BDD → Acceptance Criteria (AC-EM-01..14) — referência cruzada em `design.md` (RTM)

### Phase 4: Test Development — Unit (TDD — Red Phase)

- [ ] Criar `src/shared/infrastructure/services/logger-email.service.spec.ts` (TDD, Red Phase):
  - Mockar `Logger` do NestJS (jest spy)
  - Testes:
    - `send` > deve ser definido
    - `send` > deve logar to, subject e body em development
    - `send` > NÃO deve logar body em production (apenas to + subject) — REQ-EM-N02
    - `send` > deve aceitar EmailMessage com todos os campos
    - `send` > deve aceitar EmailMessage com campos opcionais ausentes (sem crash)
- [ ] Criar `src/shared/application/services/email-sender.service.spec.ts` (TDD, Red Phase — ≥ 10 testes):
  - Mockar `EmailService` (port) e `TemplateLoaderService`
  - Testes:
    - `send` > deve ser definido
    - `send` > deve renderizar placeholders e chamar emailService.send — REQ-EM-09
    - `send` > deve injetar automaticamente `{{APP_NAME}}`, `{{APP_LOGIN_URL}}`, `{{ano_atual}}` — REQ-EM-09
    - `send` > deve lançar erro se placeholder do template está faltando em variables — REQ-EM-09
    - `send` > deve capturar exceção do emailService e retornar void sem throw — REQ-EM-07
    - `send` > deve fazer no-op + warn para templateId com caracteres inválidos — REQ-EM-10
    - `send` > deve fazer no-op + warn para templateId não em KNOWN_TEMPLATES — REQ-EM-10
    - `send` > deve fazer no-op quando `EMAIL_NOTIFICATIONS_ENABLED=false`
    - `send` > deve validar `to` como e-mail; inválido → no-op
    - `send` > deve logar evento estruturado `{ event: 'email.sent', template, to, requestId }`
    - `send` > deve completar em ≤ 50ms (mock, REQ-EM-N01)
    - `render` (interno) > deve substituir `{{var}}` por valor de variables
    - `render` (interno) > deve filtrar valores undefined/vazios antes da substituição
- [ ] Criar `src/shared/infrastructure/services/template-loader.service.spec.ts` (TDD, Red Phase):
  - Usar diretório temporário (`fs.mkdtempSync(os.tmpdir() + '/templates-')`) com templates de fixture
  - Testes:
    - `loadAll` > deve carregar todos os arquivos em v1/*.tpl
    - `loadAll` > deve fazer parse de subject/body no formato esperado
    - `loadAll` > deve lançar erro se template obrigatório está ausente — REQ-EM-08
    - `loadAll` > deve lançar erro se template está malformado (sem subject ou body) — REQ-EM-08
    - `loadAll` > deve validar rodapé LGPD (`descadastro` + `dpo@`) em todos os templates — REQ-EM-N04
    - `loadAll` > deve validar `templateId` corresponde ao nome do arquivo
    - `get` > deve retornar template do cache por templateId
    - `get` > deve retornar undefined para templateId desconhecido
- [ ] Atualizar `src/auth/application/services/password-recovery.service.spec.ts` (estender):
  - Adicionar mock de `EmailSenderService` em vez de `EmailService`
  - Testes:
    - `forgotPassword` > deve chamar `emailSenderService.send('auth.password_reset', ...)` em vez de `emailService.send(...)` — REQ-EM-01
    - `forgotPassword` > deve retornar void sem chamar `emailSender` para e-mail inexistente — REQ-EM-06
    - `resetPassword` > deve chamar `emailSenderService.send('usuarios.password_changed', ...)` após `unitOfWork.execute` — REQ-EM-03
- [ ] Atualizar `src/usuarios/application/services/usuarios.service.spec.ts` (estender):
  - Adicionar mock de `EmailSenderService`
  - Testes:
    - `create` > deve chamar `emailSenderService.send('usuarios.welcome', ...)` após `repository.create` — REQ-EM-02
    - `create` > NÃO deve chamar `emailSender` se `repository.create` lançar erro
    - `create` > NÃO deve chamar `emailSender` se `findByEmail` encontrar duplicado (caller lança ConflictException)
    - `update (ativo=true→false)` > deve chamar `emailSenderService.send('usuarios.account_disabled', ...)` — REQ-EM-05
    - `update (ativo=false→true)` (restore) > NÃO deve chamar `emailSender` (não é desativação)
    - `update (ativo=true→true)` (no-op) > NÃO deve chamar `emailSender`
    - `update (ativo=false→false)` > NÃO deve chamar `emailSender`
- [ ] Atualizar `src/empresas/application/services/empresas.service.spec.ts` (estender):
  - Adicionar mock de `EmailSenderService` e `PerfilRepository.findMany`
  - Testes:
    - `addUser` > deve resolver nomes dos perfis via `perfilRepository.findMany([1, 2])` em 1 chamada
    - `addUser` > deve chamar `emailSenderService.send('empresas.user_added', ..., { perfis: 'Admin, Operador' })` — REQ-EM-04
    - `addUser` > NÃO deve chamar `emailSender` se `empresaRepository.addUserToCompany` falhar
    - `addUser` > NÃO deve chamar `emailSender` se validação de `perfilIds` falhar (lança NotFoundException)
- [ ] **Rodar** `npm run test` — testes devem FALHAR (Red Phase) — implementações ainda não existem

### Phase 5: Test Development — E2E (ATDD — Red Phase)

- [ ] Criar `test/email-notifications.e2e-spec.ts` (ATDD, Red Phase — ≥ 11 testes):
  - Reaproveitar `test/e2e-utils.ts` (helpers compartilhados — ver `AGENTS.md §11`)
  - Setup: criar empresa, perfis, usuário base em `beforeAll`
  - Setup: spy no `LoggerEmailService.send` para contar envios e capturar argumentos
  - Testes (mapeamento com ACs em `design.md`):
    - AC-EM-01: `POST /usuarios` deve disparar `emailSender.send` com template `usuarios.welcome`
    - AC-EM-02: `POST /empresas/:id/usuarios` deve disparar com perfis resolvidos
    - AC-EM-03: `POST /auth/reset-password` com token válido deve disparar `usuarios.password_changed`
    - AC-EM-04: `POST /auth/forgot-password` dispara `auth.password_reset` para e-mail válido
    - AC-EM-04b: `POST /auth/forgot-password` com e-mail inexistente NÃO chama `emailSender` (anti-enumeração)
    - AC-EM-05: `PATCH /usuarios/:id` com `ativo=false` deve disparar `usuarios.account_disabled`
    - AC-EM-06: `POST /usuarios` retorna 201 mesmo quando `emailService.send` lança exceção
    - AC-EM-08: `EmailSenderService` lança erro se placeholder está faltando em variables
    - AC-EM-09: `EmailSenderService` ignora `templateId` com caracteres inválidos
    - AC-EM-10: `EmailSenderService` ignora `templateId` não whitelistado
    - AC-EM-11: `LoggerEmailService` NÃO loga body em `NODE_ENV=production`
- [ ] **Verificar que os testes e2e FALHAM** (Red Phase) — implementações ainda não existem
- [ ] Revisar aceitação dos testes com o time

### Phase 6: Templates

- [ ] Criar diretório `src/shared/infrastructure/templates/v1/`
- [ ] Criar `src/shared/infrastructure/templates/v1/auth.password_reset.tpl`:
  - Formato `subject: ...\nbody: ...`
  - Subject: `Recuperação de senha — {{APP_NAME}}`
  - Body: Olá `{{nome}}`, link `{{link}}`, validade `{{validade}}`, rodapé LGPD com `descadastro` + `dpo@{{APP_NAME}}`
- [ ] Criar `src/shared/infrastructure/templates/v1/usuarios.welcome.tpl`:
  - Subject: `Bem-vindo ao {{APP_NAME}}!`
  - Body: Olá `{{nome}}`, link para `{{link}}`, dicas de segurança, rodapé LGPD
- [ ] Criar `src/shared/infrastructure/templates/v1/usuarios.password_changed.tpl`:
  - Subject: `Sua senha foi alterada`
  - Body: Olá `{{nome}}`, data/hora `{{dataHora}}`, IP `{{ip}}`, rodapé LGPD
- [ ] Criar `src/shared/infrastructure/templates/v1/usuarios.account_disabled.tpl`:
  - Subject: `Sua conta foi desativada`
  - Body: Olá `{{nome}}`, data/hora `{{dataHora}}`, contato admin, rodapé LGPD
- [ ] Criar `src/shared/infrastructure/templates/v1/empresas.user_added.tpl`:
  - Subject: `Você foi adicionado à {{nomeEmpresa}}`
  - Body: Olá `{{nomeUsuario}}`, empresa `{{nomeEmpresa}}`, perfis `{{perfis}}`, login `{{loginUrl}}`, rodapé LGPD
- [ ] Validar manualmente: cada template contém `descadastro` (ou `unsubscribe`) **E** `dpo@` no rodapé (NFR-EM-04)

### Phase 7: Infrastructure — TemplateLoaderService

- [ ] Criar interface `TemplateLoaderService` em `src/shared/infrastructure/services/template-loader.service.ts`:
  - `loadAll(): Map<string, EmailTemplate>` (chamado no `onModuleInit`)
  - `get(templateId: string): EmailTemplate | undefined`
  - JSDoc explicando o carregamento síncrono no boot
- [ ] Criar `FileSystemTemplateLoaderService` em `src/shared/infrastructure/services/file-system-template-loader.service.ts`:
  - `@Injectable()` implementando `TemplateLoaderService`
  - Construtor recebe `templatesDir: string` (default `src/shared/infrastructure/templates/`)
  - `loadAll()`:
    - `fs.readdirSync(templatesDir + '/v1')` → lista de arquivos
    - Para cada arquivo `.tpl`: `fs.readFileSync` + parse `subject: <linha>\nbody: <texto>`
    - Cache em `Map` privado
    - Em caso de erro de I/O ou parse, lança `Error` com mensagem clara (fail-fast)
  - `get(templateId)`:
    - Retorna do cache
- [ ] Validar rodapé LGPD em cada template no `loadAll` (regex `/(descadastro|unsubscribe)/i.test(body) && /dpo@/.test(body)`) — throw se violar (NFR-EM-04)

### Phase 8: Application — EmailSenderService (TDD Green)

- [ ] Criar interface `EmailSenderService` em `src/shared/application/services/email-sender.service.ts`:
  - `send(templateId, to, variables): Promise<void>`
  - `EMAIL_SENDER_SERVICE` symbol
  - JSDoc com o contrato: "não bloqueia, renderiza template, delega ao EmailService"
- [ ] Criar `DefaultEmailSenderService` em `src/shared/application/services/default-email-sender.service.ts`:
  - `@Injectable()` implementando `EmailSenderService`
  - Construtor:
    - `@Inject(EMAIL_SERVICE) private emailService: EmailService`
    - `private templateLoader: TemplateLoaderService`
    - `private configService: ConfigService`
    - `private logger: Logger` (Pino)
  - `KNOWN_TEMPLATES = new Set([...5 IDs...])`
  - `AUTO_INJECTED = { APP_NAME, APP_LOGIN_URL, ano_atual }` resolvido do `configService`
  - `send(templateId, to, variables)`:
    - Early return se `EMAIL_NOTIFICATIONS_ENABLED=false`
    - Validar `templateId` contra regex `^[a-z0-9_]+$` (no-op + warn se falhar)
    - Validar `templateId` em `KNOWN_TEMPLATES` (no-op + warn se não)
    - Validar `to` como e-mail (regex simples)
    - `template = this.templateLoader.get(templateId)` (já está em cache)
    - Renderizar: `subject = render(template.subject, {...variables, ...AUTO_INJECTED})`
    - Renderizar: `body = render(template.body, {...variables, ...AUTO_INJECTED})`
    - `try { await this.emailService.send({ to, subject, body }) } catch (e) { this.logger.warn(...) }`
    - Logar `{ event: 'email.sent', template, to, requestId }`
  - `render(text, vars)` (privado):
    - Substituir `{{var}}` por `vars[var]` (ou string vazia se undefined)
    - Validar que **todos** os placeholders no template têm correspondente em `vars` (juntar chaves do regex + diff) — throw se não
- [ ] **Rodar** `npm run test -- email-sender.service.spec.ts` — testes devem PASSAR (Green)

### Phase 9: SharedModule — Wiring

- [ ] Atualizar `src/shared/shared.module.ts`:
  - Adicionar providers:
    - `TemplateLoaderService` (useClass `FileSystemTemplateLoaderService`)
    - `EmailSenderService` (useClass `DefaultEmailSenderService`)
    - `{ provide: EMAIL_SERVICE, useClass: LoggerEmailService }` (movido do `AuthModule`)
  - Adicionar exports: `EMAIL_SERVICE`, `EmailSenderService`, `TemplateLoaderService`
  - `FileSystemTemplateLoaderService` precisa de config: injetar `ConfigService` para `templatesDir` (default)
- [ ] Validar: `AuthModule` importa `SharedModule` (já importa) e **NÃO** precisa mais do binding local do `EMAIL_SERVICE`

### Phase 10: Refactor de PasswordRecoveryService

- [ ] Atualizar `src/auth/application/services/password-recovery.service.ts`:
  - Trocar import: `EmailService` → `EmailSenderService` + `EMAIL_SENDER_SERVICE`
  - Injetar `EmailSenderService` no construtor
  - `forgotPassword(dto)`:
    - Remover body hard-coded do e-mail de reset
    - Substituir `await this.emailService.send(...)` por `await this.emailSenderService.send('auth.password_reset', user.email, { nome, link, validade })`
  - `resetPassword(dto)`:
    - Após `await this.unitOfWork.execute(...)` retornar com sucesso, adicionar:
      ```typescript
      const user = await this.usuarioRepository.findOne(token.userId);
      if (user) {
        await this.emailSenderService.send(
          'usuarios.password_changed',
          user.email,
          { nome: user.email.split('@')[0], dataHora: new Date().toISOString(), ip: 'desconhecido' },
        );
      }
      ```
  - Atualizar comentários `// BDD: ...` para referenciar `features/email-notifications.feature` quando aplicável
- [ ] Atualizar `src/auth/auth.module.ts`:
  - Remover binding `{ provide: EMAIL_SERVICE, useClass: LoggerEmailService }` (já removido na Phase 2)
  - Garantir que `PasswordRecoveryService` continua no array de providers

### Phase 11: Trigger — UsuariosService (Boas-vindas + Desativação)

- [ ] Atualizar `src/usuarios/application/services/usuarios.service.ts`:
  - Injetar `EmailSenderService` no construtor:
    - `@Inject(EMAIL_SENDER_SERVICE) private emailSenderService: EmailSenderService`
  - `create(dto)`:
    - Após `await this.usuarioRepository.create(newUsuario)` retornar com sucesso, adicionar:
      ```typescript
      const nome = newUsuario.email.split('@')[0];
      const link = `${this.configService.get<string>('APP_LOGIN_URL')}/auth/forgot-password`;
      await this.emailSenderService.send('usuarios.welcome', newUsuario.email, { nome, link });
      ```
    - Injetar `ConfigService` no construtor
  - `update(id, dto, ...)`:
    - No branch `updateUsuarioDto.ativo === false` (após `await this.usuarioRepository.remove(id)` retornar), adicionar:
      ```typescript
      await this.emailSenderService.send(
        'usuarios.account_disabled',
        usuario.email,
        { nome: usuario.email.split('@')[0], dataHora: new Date().toISOString() },
      );
      ```
  - Atualizar comentários `// BDD: ...` para referenciar `features/email-notifications.feature`
- [ ] Atualizar `src/usuarios/usuarios.module.ts`:
  - Garantir que importa `SharedModule` (para resolver `EMAIL_SENDER_SERVICE`)

### Phase 12: Trigger — EmpresasService (Vínculo)

- [ ] Atualizar `src/empresas/application/services/empresas.service.ts`:
  - Injetar `EmailSenderService` no construtor:
    - `@Inject(EMAIL_SENDER_SERVICE) private emailSenderService: EmailSenderService`
  - `addUser(empresaId, dto)`:
    - Após validação de perfis (linha atual `perfilFaltando !== -1`), buscar nomes dos perfis em paralelo:
      ```typescript
      const perfis = await Promise.all(
        perfilIds.map((perfilId) => this.perfilRepository.findOne(perfilId)),
      );
      const nomesPerfis = perfis.filter(Boolean).map((p) => p!.nome).join(', ');
      ```
    - Após `await this.empresaRepository.addUserToCompany(empresaId, usuarioId, perfilIds)` retornar com sucesso, adicionar:
      ```typescript
      await this.emailSenderService.send(
        'empresas.user_added',
        usuario.email,
        {
          nomeUsuario: usuario.email.split('@')[0],
          nomeEmpresa: empresa.nome,
          perfis: nomesPerfis,
          loginUrl: `${this.configService.get<string>('APP_LOGIN_URL')}/auth/login`,
        },
      );
      ```
    - Injetar `ConfigService` no construtor
    - Capturar `empresa = await this.findOne(empresaId)` no início (já é feito)
  - Atualizar comentários `// BDD: ...` para referenciar `features/email-notifications.feature`
- [ ] Atualizar `src/empresas/empresas.module.ts`:
  - Garantir que importa `SharedModule` (para resolver `EMAIL_SENDER_SERVICE`)

### Phase 13: Configuration

- [ ] Adicionar envs em `src/config/env.validation.ts` (Joi):
  - `EMAIL_NOTIFICATIONS_ENABLED: Joi.boolean().default(true)`
  - `APP_NAME: Joi.string().min(1).max(80).default('API Padrão')`
  - `APP_LOGIN_URL: Joi.string().uri().default('http://localhost:3000')`
  - `EMAIL_NOTIFICATIONS_METRICS_ENABLED: Joi.boolean().default(false)`
- [ ] Atualizar `.env.example` com as 4 novas envs (comentadas + exemplo)
- [ ] Atualizar `.env.test` (já existente) com:
  - `EMAIL_NOTIFICATIONS_ENABLED=true` (assertivas de contagem dependem disso)
  - `APP_NAME=API Padrão Test`
  - `APP_LOGIN_URL=http://localhost:3000`

### Phase 14: Verification (TDD Green + ATDD Green)

- [ ] **Rodar testes unitários** — devem PASSAR (Green Phase):
  - `npm run test -- logger-email.service.spec.ts`
  - `npm run test -- email-sender.service.spec.ts`
  - `npm run test -- template-loader.service.spec.ts`
  - `npm run test -- password-recovery.service.spec.ts`
  - `npm run test -- usuarios.service.spec.ts`
  - `npm run test -- empresas.service.spec.ts`
- [ ] **Rodar testes e2e** — devem PASSAR (Green Phase):
  - `npm run test:e2e -- email-notifications.e2e-spec.ts`
  - `npm run test:e2e -- auth-password-recovery.e2e-spec.ts` (verifica que refactor não quebrou)
  - `npm run test:e2e -- auth.e2e-spec.ts` (regressão geral)
  - `npm run test:e2e -- usuarios.e2e-spec.ts` (regressão)
  - `npm run test:e2e -- empresas.e2e-spec.ts` (regressão)
- [ ] **Rodar suíte completa** para garantir zero regressão:
  - `npm run test` (unit)
  - `npm run test:e2e` (e2e)
  - `npm run test:cov` (cobertura — deve permanecer ≥ 80%)
- [ ] `npm run validate:quick` (lint + typecheck + testes) — deve PASSAR
- [ ] `npm run security:check` — deve PASSAR (verifica que body renderizado não vaza em logs, que regex de templateId bloqueia path-traversal, etc.)
- [ ] **Smoke test manual** (opcional, mas recomendado):
  - `docker compose up -d`
  - `curl -X POST http://localhost:3001/usuarios -H 'Content-Type: application/json' -H 'x-empresa-id: <seed>' -H 'Authorization: Bearer <token>' -d '{"email":"novo@empresa.com","senha":"SenhaForte123!"}'`
  - Verificar log Pino: deve aparecer `event: 'email.sent'` com `template: 'usuarios.welcome'`, `to: 'novo@empresa.com'`, **sem** o body
  - `curl -X POST http://localhost:3001/empresas/<id>/usuarios -H 'Content-Type: application/json' -H 'x-empresa-id: <id>' -H 'Authorization: Bearer <token>' -d '{"usuarioId":1,"perfilIds":[1,2]}'`
  - Verificar log Pino: `event: 'email.sent'` com `template: 'empresas.user_added'`, `to: 'novo@empresa.com'`
  - Confirmar que o `body` do e-mail renderizado **NÃO** aparece no log (apenas `template` + `to`)

### Phase 15: Documentation

- [ ] Atualizar `src/shared/README.md`:
  - Adicionar seção "### Notificações por E-mail" descrevendo `EmailSenderService`, `TemplateLoaderService` e os 5 templates disponíveis
  - Documentar o contrato "não-bloqueante" (REQ-EM-07)
- [ ] Atualizar `src/auth/README.md`:
  - Referenciar que `POST /auth/forgot-password` e `POST /auth/reset-password` agora disparam templates via `EmailSenderService`
- [ ] Atualizar `src/usuarios/README.md`:
  - Documentar que `POST /usuarios` dispara e-mail de boas-vindas e `PATCH /usuarios/:id` (ativo=false) dispara e-mail de desativação
- [ ] Atualizar `src/empresas/README.md`:
  - Documentar que `POST /empresas/:id/usuarios` dispara e-mail de vínculo a empresa
- [ ] Atualizar `AGENTS.md` (raiz) — referenciar a feature `email-notifications` no catálogo de módulos (`§7`) e nas convenções de segurança
- [ ] Adicionar comentários de rastreabilidade nos arquivos novos:
  - `// BDD: features/email-notifications.feature:Cenário: <nome>`
  - `// SDD: .openspec/changes/email-notifications/design.md:REQ-EM-NN`
  - `// ATDD: test/email-notifications.e2e-spec.ts:<describe> > <it>`
  - `// TDD: src/<...>/<...>.spec.ts:<describe> > <it>`

### Phase 16: Code Review + Security Review

- [ ] **Code review** do PR (referência: `code-review` skill)
  - Verificar DIP (REQ-EM-N03): `grep -r "import.*EmailService" src/{usuarios,empresas,auth}/application/services/` deve retornar **apenas** `EmailSenderService`
  - Verificar reuso de `e2e-utils.ts` (não duplicar fixtures)
- [ ] **Security review** (referência: `security-review` skill) — confirmar:
  - Body renderizado **NÃO** logado em prod (REQ-EM-N02)
  - Regex de `templateId` bloqueia path-traversal (REQ-EM-10)
  - Rodapé LGPD em todos os 5 templates (REQ-EM-N04)
  - Anti-enumeração preservada no `forgot-password` (REQ-EM-06)
- [ ] Merge do PR com conventional commits:
  - `refactor(shared): move EmailService port and LoggerEmailService to shared module`
  - `feat(shared): add EmailSenderService and TemplateLoaderService`
  - feat(usuarios): trigger welcome email on user creation`
  - feat(usuarios): trigger account_disabled email on soft-delete`
  - feat(empresas): trigger user_added email on company link`
  - feat(auth): use EmailSenderService in PasswordRecoveryService`
  - test(shared): add BDD + ATDD + TDD for email-notifications`
  - docs(shared): document email notifications feature`

### Phase 17: Deployment / Archive

- [ ] Mover spec de `.openspec/changes/email-notifications/` para `.openspec/specs/email-notifications/` (consolidar proposal + design + tasks em um único arquivo canônico, ou manter 3 — verificar convenção: este projeto mantém 3)
- [ ] **Fechar o ciclo OpenSpec**: arquivar a change após merge em `main`

## Task Dependencies

```
proposal.md → design.md → tasks.md
        ↓
Refactor EmailService → shared/  (Phase 2 — precondição para Phase 9)
        ↓
features/email-notifications.feature (BDD)
        ↓
src/shared/infrastructure/templates/v1/*.tpl (5 templates)
        ↓
src/shared/infrastructure/services/template-loader.service.ts (port + FileSystem impl)
src/shared/infrastructure/services/logger-email.service.ts (move + production guard)
        ↓
src/shared/application/services/email-sender.service.ts (orquestrador)
        ↓
test/email-notifications.e2e-spec.ts (ATDD Red)
src/**/*.spec.ts (TDD Red)
        ↓
shared.module.ts (wiring + DI binding + exports)
src/config/env.validation.ts (Joi envs)
.env.example / .env.test
        ↓
[ATDD Green] + [TDD Green] + npm run validate:quick + security:check
        ↓
Refactor PasswordRecoveryService (usa EmailSenderService)
Adicionar trigger em UsuariosService.create() (welcome)
Adicionar trigger em UsuariosService.update() (account_disabled)
Adicionar trigger em EmpresasService.addUser() (user_added)
        ↓
src/{shared,auth,usuarios,empresas}/README.md (documentar) + comentários de rastreabilidade
        ↓
PR + code review + security review + merge
        ↓
.openspec/changes/email-notifications/ → .openspec/specs/email-notifications/ (archive)
```

## File-by-File Traceability (planejado)

| Arquivo | Propósito | Requisitos cobertos |
|---------|-----------|---------------------|
| `features/email-notifications.feature` (novo) | 11 cenários BDD | REQ-EM-01..10, REQ-EM-06 |
| `src/shared/domain/services/email.service.ts` (move) | Port (DIP) | REQ-EM-N03 |
| `src/shared/infrastructure/services/logger-email.service.ts` (move) | Adapter (Pino mock) | REQ-EM-N02, NFR-PR-004 (herdado) |
| `src/shared/infrastructure/services/file-system-template-loader.service.ts` (novo) | Carrega templates do disco | REQ-EM-08, REQ-EM-N04 |
| `src/shared/infrastructure/services/template-loader.service.ts` (novo) | Port do loader | REQ-EM-08 |
| `src/shared/application/services/email-sender.service.ts` (novo) | Orquestrador (port) | REQ-EM-09, REQ-EM-10 |
| `src/shared/application/services/default-email-sender.service.ts` (novo) | Impl do orquestrador | REQ-EM-07, REQ-EM-N01, REQ-EM-N02 |
| `src/shared/infrastructure/templates/v1/*.tpl` (5 novos) | Templates versionados | REQ-EM-N04 |
| `src/shared/shared.module.ts` (estendido) | Wiring + DI binding + exports | REQ-EM-N03 |
| `src/auth/domain/services/email.service.ts` (refactor) | Re-export com `@deprecated` | — |
| `src/auth/infrastructure/services/logger-email.service.ts` (refactor) | Re-export com `@deprecated` | — |
| `src/auth/auth.module.ts` (refactor) | Remove binding local de EMAIL_SERVICE | REQ-EM-N03 |
| `src/auth/application/services/password-recovery.service.ts` (refactor) | Usa EmailSenderService | REQ-EM-01, REQ-EM-03, REQ-EM-06 |
| `src/usuarios/application/services/usuarios.service.ts` (estendido) | Triggers welcome + account_disabled | REQ-EM-02, REQ-EM-05 |
| `src/empresas/application/services/empresas.service.ts` (estendido) | Trigger user_added + resolve perfis | REQ-EM-04 |
| `src/config/env.validation.ts` (estendido) | Joi envs | — |
| `.env.example` / `.env.test` (estendido) | Configuração | — |
| `test/email-notifications.e2e-spec.ts` (novo) | 11 testes e2e (ATDD) | REQ-EM-01..10 + REQ-EM-06 + REQ-EM-07 + REQ-EM-N02 |
| `src/shared/infrastructure/services/logger-email.service.spec.ts` (novo) | TDD (≥ 4 testes) | REQ-EM-N02 |
| `src/shared/application/services/email-sender.service.spec.ts` (novo) | TDD (≥ 10 testes) | REQ-EM-07, REQ-EM-09, REQ-EM-10, REQ-EM-N01 |
| `src/shared/infrastructure/services/template-loader.service.spec.ts` (novo) | TDD (≥ 6 testes) | REQ-EM-08, REQ-EM-N04 |
| `src/auth/application/services/password-recovery.service.spec.ts` (estendido) | TDD (≥ 2 testes) | REQ-EM-01, REQ-EM-03, REQ-EM-06 |
| `src/usuarios/application/services/usuarios.service.spec.ts` (estendido) | TDD (≥ 5 testes) | REQ-EM-02, REQ-EM-05 |
| `src/empresas/application/services/empresas.service.spec.ts` (estendido) | TDD (≥ 3 testes) | REQ-EM-04 |
| `src/shared/README.md` (estendido) | Documentação | REQ-EM-N08 (API contract stability) |
| `src/auth/README.md` (estendido) | Documentação | — |
| `src/usuarios/README.md` (estendido) | Documentação | — |
| `src/empresas/README.md` (estendido) | Documentação | — |
| `AGENTS.md` (raiz) (estendido) | Catálogo + convenções | — |
| `.openspec/changes/email-notifications/proposal.md` | Proposta + impacto + riscos | — |
| `.openspec/changes/email-notifications/design.md` | Spec RFC 2119 + AC + edge cases | Todas as REQ/NFR |
| `.openspec/changes/email-notifications/tasks.md` | Este arquivo | — |

## Notes

- Cada task deve ser **independentemente commitável** com conventional commits.
- **Reuso máximo**: `EmailService` (port movido), `LoggerEmailService` (adapter movido), `ConfigService`, `Logger` (Pino via NestJS), `e2e-utils.ts` (helpers de teste).
- **Refactor não-quebrante**: a Phase 2 move os arquivos de `auth/` para `shared/` mas **adiciona re-exports com `@deprecated`** para preservar imports externos. ESLint `@typescript-eslint/no-deprecated` alerta devs a migrarem.
- **DIP estrito**: services de feature (`UsuariosService`, `EmpresasService`, `PasswordRecoveryService`) **só** conhecem `EmailSenderService` — nunca `EmailService` diretamente. Isso garante que a troca futura para `queue.add()` no `EmailSenderService` não impacta callers.
- **Não-bloqueio (REQ-EM-07)**: a `try/catch` em `EmailSenderService.send` garante que o caller **nunca** vê uma exceção de envio. Isso é **fundamental** — a feature é "efeito colateral" de fluxos críticos (`POST /usuarios`, `POST /auth/reset-password`) e não pode bloquear a request.
- **Templates auto-versionados**: o diretório `v1/` é o ponto de versionamento. Adicionar `v2/` significa novo schema de templates (e.g., com HTML, i18n). Esta change **só** usa `v1/`.
- **Cobertura**: ≥ 80% em todas as métricas (Jest) preservada. Os novos arquivos adicionam ≥ 3 testes unitários por service, e ≥ 11 testes E2E — contribuição **positiva** para cobertura.
- **Smoke test manual**: opcional mas fortemente recomendado após a Phase 14. Permite inspecionar logs Pino reais e confirmar que o contrato de não-vazamento (REQ-EM-N02) está OK.
- **Próximas changes (não cobertas)**: `email-provider-integration` (SMTP real + fila assíncrona), `email-templates-v2` (HTML + i18n), `email-logs` (auditoria forte com persistência).
- **Migrar feature para `.openspec/specs/`** apenas após merge em `main` (não antes — a change está "WIP" até ser aprovada e mergeada).
