# Feature: Notificações por E-mail (email-notifications) — Design Specification

## Overview

A feature **email-notifications** promove o port `EmailService` (atualmente acoplado ao módulo `auth`) a um **serviço compartilhado do `SharedModule`** e adiciona **3 triggers obrigatórios + 1 opcional** de envio de e-mail transacional em fluxos de negócio existentes:

1. **Boas-vindas** ao criar um `Usuario` (`UsuariosService.create()`).
2. **Vínculo a empresa** ao adicionar um usuário a uma `Empresa` com perfis (`EmpresasService.addUser()`).
3. **Confirmação de alteração de senha** após `reset-password` (`PasswordRecoveryService.resetPassword()`) e, opcionalmente, ao mudar a senha por usuário logado.
4. **Desativação de conta** quando `Usuario.ativo` muda para `false` (`UsuariosService.update()`) — *SHOULD*, pode ser desligado por flag.

A entrega desta change é **camada de aplicação**: orquestração de envio, templates versionados em `src/shared/infrastructure/templates/v1/`, observabilidade via logs estruturados. A integração com provedor SMTP/SES real é **out of scope** e fica para a change `email-provider-integration` — o adapter `LoggerEmailService` (Pino) é mantido como única implementação concreta nesta fase, garantindo que toda a suíte de testes E2E rode sem dependência externa.

A motivação completa (Why/What Changes/Impact/Risks/Alternatives) está em [`proposal.md`](./proposal.md). Este documento é a **spec formal RFC 2119** que guia a implementação.

**Persona**: o **usuário final** que precisa receber notificações transacionais da API (boas-vindas, confirmações, alertas de mudança de papel). O **admin** também é impactado indiretamente — ao adicionar um usuário, deixa de precisar "avisar manualmente" por Slack/e-mail pessoal.

**Casos de uso cobertos**:

- Onboarding self-service: usuário recebe e-mail de boas-vindas e clica em "definir minha senha".
- Vínculo organizacional: usuário sabe imediatamente em qual empresa e com qual perfil foi cadastrado (resolve o atual 403 silencioso ao tentar logar).
- Segurança: titular legítimo da conta detecta alteração de senha não autorizada (e-mail de confirmação imediato).
- Operação de admin: ao desativar um usuário, a notificação é enviada (transparência operacional).

**Não cobertos** (outras changes ou futuro): SMTP/SES real, fila assíncrona (BullMQ), histórico persistido (`EmailLog`), i18n, e-mails ao admin, templates customizáveis por empresa, troca de senha por usuário logado (depende de decisão de produto).

## Requirements (RFC 2119)

### Convenção de IDs

- Prefixo `REQ-EM-` (funcional) e `REQ-EM-N` (não-funcional).
- Origem: `BR-EM-NN` (Business Requirement, listado na seção "Business Requirements" do proposal) ou referência direta à REQ da change `password-recovery` quando herdada.

### Business Requirements (origem)

| ID | Descrição |
|----|-----------|
| BR-EM-01 | Enviar e-mail de boas-vindas ao criar usuário. |
| BR-EM-02 | Confirmar alteração de senha por e-mail. |
| BR-EM-03 | Notificar usuário ao ser vinculado a uma empresa (com perfis). |
| BR-EM-04 | Notificar usuário ao ter a conta desativada. |
| BR-EM-05 | Permitir kill-switch global de notificações. |
| BR-EM-06 | Manter anti-enumeração no `forgot-password` (não regredir). |

### Functional Requirements

- **REQ-EM-01** [SHALL] — O sistema **SHALL** disparar o envio do e-mail **"Recuperação de senha"** quando o fluxo `POST /auth/forgot-password` for invocado com sucesso, contendo o link `${APP_LOGIN_URL}/reset-password?token=<token_plain>` e o TTL de expiração. A resposta HTTP **SHALL** ser sempre `200`, independente da existência do e-mail (anti-enumeração herdada de `REQ-PR-001`).
  - **Origem**: BR-EM-06 (anti-enumeração) + reuso de REQ-PR-004.
  - **BDD**: `features/email-notifications.feature:Cenário: E-mail de recuperação de senha continua sendo enviado via template auth.password_reset`
  - **ATDD**: `test/email-notifications.e2e-spec.ts:POST /auth/forgot-password > deve disparar emailSender.send com template auth.password_reset e variáveis { link, validade, nome }`
  - **TDD**: `src/auth/application/services/password-recovery.service.spec.ts:forgotPassword > deve chamar emailSenderService.send('auth.password_reset', ...) em vez de emailService.send(...) direto`

- **REQ-EM-02** [SHALL] — O sistema **SHALL** disparar o envio do e-mail **"Bem-vindo à plataforma"** (`usuarios.welcome`) após a criação bem-sucedida de um `Usuario` em `UsuariosService.create()`. O template **SHALL** conter pelo menos: nome do usuário (derivado do e-mail — parte local), link para definir senha (`${APP_LOGIN_URL}/auth/forgot-password`) e referência ao `APP_NAME` como remetente. O envio **SHALL** ocorrer **após** o `usuarioRepository.create()` retornar sucesso (i.e., fora da transação de DB).
  - **Origem**: BR-EM-01.
  - **BDD**: `features/email-notifications.feature:Cenário: E-mail de boas-vindas enviado ao criar usuário`
  - **ATDD**: `test/email-notifications.e2e-spec.ts:POST /usuarios > deve disparar emailSender.send('usuarios.welcome', usuario.email, { nome, link }) após 201`
  - **TDD**: `src/usuarios/application/services/usuarios.service.spec.ts:create > deve chamar emailSenderService.send('usuarios.welcome', ...) após repository.create`

- **REQ-EM-03** [SHALL] — O sistema **SHALL** disparar o envio do e-mail **"Senha alterada com sucesso"** (`usuarios.password_changed`) após o commit bem-sucedido do `unitOfWork` em `PasswordRecoveryService.resetPassword()`. O template **SHALL** conter: nome do usuário, data/hora do reset e IP de origem (quando disponível via `Request` — fora desta change; usar `null`/`'desconhecido'` como fallback). O envio **SHALL** ocorrer **após** o `await this.unitOfWork.execute(...)` retornar (i.e., pós-transação).
  - **Origem**: BR-EM-02.
  - **BDD**: `features/email-notifications.feature:Cenário: E-mail de confirmação enviado após reset de senha`
  - **ATDD**: `test/email-notifications.e2e-spec.ts:POST /auth/reset-password > deve disparar emailSender.send('usuarios.password_changed', user.email, ...) após sucesso`
  - **TDD**: `src/auth/application/services/password-recovery.service.spec.ts:resetPassword > deve chamar emailSenderService.send('usuarios.password_changed', ...) após unitOfWork.execute`

- **REQ-EM-04** [SHALL] — O sistema **SHALL** disparar o envio do e-mail **"Você foi adicionado à empresa"** (`empresas.user_added`) após o sucesso de `EmpresasService.addUser()`. O template **SHALL** conter: nome do usuário, nome da empresa, lista de nomes dos perfis atribuídos (separados por vírgula) e link de login (`${APP_LOGIN_URL}/auth/login`). A lista de nomes de perfis **SHALL** ser resolvida via lookup paralelo no `PerfilRepository.findMany(perfilIds)` (1 round-trip em vez de N).
  - **Origem**: BR-EM-03.
  - **BDD**: `features/email-notifications.feature:Cenário: E-mail de vínculo a empresa lista os perfis atribuídos`
  - **ATDD**: `test/email-notifications.e2e-spec.ts:POST /empresas/:id/usuarios > deve disparar emailSender.send('empresas.user_added', ...) com perfis resolvidos`
  - **TDD**: `src/empresas/application/services/empresas.service.spec.ts:addUser > deve resolver nomes dos perfis via perfilRepository.findMany e chamar emailSender.send`

- **REQ-EM-05** [SHOULD] — O sistema **SHOULD** disparar o envio do e-mail **"Sua conta foi desativada"** (`usuarios.account_disabled`) quando `UsuariosService.update()` alterar `ativo` de `true` para `false` (soft-delete). O template **SHALL** conter: nome do usuário e data/hora da desativação. O envio **MAY** ser suprimido quando `EMAIL_NOTIFICATIONS_ENABLED=false` ou quando o motivo da desativação for técnico (ex.: `deletedAt` setado por job de limpeza — distinguir de desativação por admin via flag explícita no DTO, fora desta change).
  - **Origem**: BR-EM-04.
  - **BDD**: `features/email-notifications.feature:Cenário: E-mail de desativação enviado quando usuário é desativado`
  - **ATDD**: `test/email-notifications.e2e-spec.ts:PATCH /usuarios/:id (ativo=false) > deve disparar emailSender.send('usuarios.account_disabled', ...)`
  - **TDD**: `src/usuarios/application/services/usuarios.service.spec.ts:update (ativo=true→false) > deve chamar emailSenderService.send('usuarios.account_disabled', ...) quando ativo vira false`

- **REQ-EM-06** [MUST] — O sistema **MUST** preservar a propriedade de **anti-enumeração** do `POST /auth/forgot-password`: a resposta **MUST** ser sempre HTTP 200 com o **mesmo corpo** (`{ message: "Se o e-mail existir, enviaremos um link de redefinição." }`) e **MUST NOT** revelar se o e-mail está cadastrado, soft-deletado ou inativo. Esta REQ **MUST** ser testada explicitamente e **MUST NOT** regredir em nenhuma das mudanças desta change.
  - **Origem**: BR-EM-06 + herança de `REQ-PR-001`.
  - **BDD**: `features/email-notifications.feature:Cenário: E-mail de recuperação preserva anti-enumeração`
  - **ATDD**: `test/email-notifications.e2e-spec.ts:POST /auth/forgot-password > deve retornar 200 com mesmo corpo para e-mail existente e inexistente (anti-enumeração)`
  - **TDD**: `src/auth/application/services/password-recovery.service.spec.ts:forgotPassword > deve retornar void sem chamar emailSender para e-mail inexistente`

- **REQ-EM-07** [MUST] — Toda chamada a `EmailSenderService.send()` **MUST** ser **não-bloqueante** em relação à request HTTP do caller. A implementação **MUST** envolver a chamada ao `EmailService` em `try/catch` que loga erros em `warn` e retorna `void` sem propagar exceção. Falhas de envio **MUST NOT** afetar o status HTTP do endpoint que originou o envio.
  - **Origem**: REQ-N01 (latência) + princípio de resiliência da API.
  - **BDD**: `features/email-notifications.feature:Cenário: Falha no envio NÃO bloqueia a request`
  - **ATDD**: `test/email-notifications.e2e-spec.ts:POST /usuarios > deve retornar 201 mesmo quando emailService.send() lança exceção`
  - **TDD**: `src/shared/application/services/email-sender.service.spec.ts:send > deve capturar erro do emailService, logar warn e retornar void sem throw`

- **REQ-EM-08** [SHOULD] — O sistema **SHOULD** carregar os templates de e-mail a partir de arquivos versionados em `src/shared/infrastructure/templates/vN/`, onde `N` é a versão semântica do schema do template. O carregamento **MUST** ocorrer no boot via `TemplateLoaderService` (`onModuleInit` do `SharedModule`), lendo os arquivos de forma **síncrona** (`fs.readFileSync`) e cacheando em `Map<templateId, Template>`. Falha de leitura (arquivo ausente, permissão negada) **MUST** abortar o boot da aplicação (fail-fast).
  - **Origem**: Princípio de versionamento de artefatos de produto.
  - **BDD**: `features/email-notifications.feature:Cenário: Template desconhecido é ignorado` + `Cenário: Aplicação não sobe se template obrigatório está ausente`
  - **ATDD**: `test/email-notifications.e2e-spec.ts:beforeAll > deve falhar boot se arquivo de template está corrompido` (teste de integração, opcional)
  - **TDD**: `src/shared/infrastructure/services/template-loader.service.spec.ts:loadAll > deve carregar todos os templates v1/*.tpl no boot; template ausente → throw`

- **REQ-EM-09** [SHALL] — O `EmailSenderService.send(templateId, to, variables)` **SHALL** renderizar os placeholders `{{variavel}}` no `subject` e `body` do template, substituindo por valores de `variables` em **tempo de execução**. O renderer **MUST** falhar com erro explícito se algum placeholder do template **não** estiver presente em `variables` (fail-fast de authoring — template incompleto é bug, não runtime issue). Placeholders `{{APP_NAME}}`, `{{APP_LOGIN_URL}}` e `{{ano_atual}}` **SHALL** ser injetados automaticamente pelo serviço antes da renderização, sem exigir que o caller os passe em `variables`.
  - **Origem**: Princípio de authoring seguro de templates (não silenciar placeholders faltantes).
  - **BDD**: `features/email-notifications.feature:Cenário: Renderer de template substitui placeholders corretamente`
  - **ATDD**: `test/email-notifications.e2e-spec.ts:EmailSenderService > deve renderizar placeholders de variáveis e injetados automaticamente`
  - **TDD**: `src/shared/application/services/email-sender.service.spec.ts:send > deve substituir placeholders; placeholder faltando → throw`

- **REQ-EM-10** [MUST] — O `EmailSenderService` **MUST** validar que o `templateId` corresponde a um `^[a-z0-9_]+$` (whitelist regex) e **MUST** ser membro da `KNOWN_TEMPLATES` whitelist interna. `templateId` inválido **MUST** ser logado em `warn` e resultar em **no-op** (não throw) — defesa contra path-traversal e typos.
  - **Origem**: REQ-EM-08 (templates) + princípio de segurança de input.
  - **BDD**: `features/email-notifications.feature:Cenário: templateId inválido é rejeitado e logado`
  - **ATDD**: `test/email-notifications.e2e-spec.ts:EmailSenderService > deve ignorar templateId fora do padrão regex`
  - **TDD**: `src/shared/application/services/email-sender.service.spec.ts:send > deve fazer no-op e logar warn para templateId com caracteres inválidos`

### Non-Functional Requirements

- **REQ-EM-N01** [SHALL] — A latência do envio síncrono (mock `LoggerEmailService`) **SHALL** ser **≤ 50ms p95** medido em ambiente de teste (sem I/O de rede). A mudança **MUST NOT** aumentar a latência p95 dos endpoints que disparam envio (`POST /usuarios`, `POST /empresas/:id/usuarios`, `POST /auth/reset-password`) em mais de **20ms** quando comparada à versão sem envio.
  - **Categoria**: Performance / Eficiência (ISO 25010).
  - **Verificação**: `npm run test:e2e` com assertiva de tempo total (`Date.now() - start`); telemetria OTel no `EmailSenderService` emite métrica `email.send.duration_ms`.
  - **Rastreabilidade**: instrumentação OTel em `EmailSenderService.send` (span `email.send` com atributo `template`).

- **REQ-EM-N02** [MUST] — O `LoggerEmailService` (e qualquer adapter de `EmailService`) **MUST NOT** registrar (log) o corpo renderizado do e-mail (`body`) quando `NODE_ENV=production`. Em `development` e `test`, **MAY** registrar `to`, `subject` e `body` para facilitar DX. Tokens opacos (ex.: token plain de reset) **MUST NEVER** aparecer em logs — o `LoggerEmailService` é o único adapter que loga corpo, e o `EmailSenderService` **MUST NOT** passar o `body` renderizado para o `Logger` (apenas `template` + `to`).
  - **Categoria**: Segurança (ISO 25010 — Confidencialidade).
  - **Verificação**: spy no `Logger` durante `npm run test` (verifica que `body` nunca aparece nos argumentos); `npm run security:check`.
  - **Rastreabilidade**: implementação de `LoggerEmailService.send` com `if (process.env.NODE_ENV !== 'production') { this.logger.log(...) }`; `EmailSenderService` loga apenas `{ template, to, requestId }`.

- **REQ-EM-N03** [MUST] — O port `EmailService` **MUST** continuar obedecendo ao **Dependency Inversion Principle** (DIP): o service de aplicação (`EmailSenderService`) depende **apenas** da interface `EmailService`, e o binding concreto é resolvido via DI no `SharedModule` (`{ provide: EMAIL_SERVICE, useClass: LoggerEmailService }`). Trocar o adapter (ex.: para `SmtpEmailService` em prod) **MUST NOT** exigir mudança em nenhum service de feature — apenas no provider do `SharedModule`.
  - **Categoria**: Manutenibilidade / Arquitetura (ISO 25010).
  - **Verificação**: inspeção de imports em `UsuariosService`, `EmpresasService`, `PasswordRecoveryService` — nenhum importa `LoggerEmailService` diretamente; revisão de arquitetura (skill `code-review`).
  - **Rastreabilidade**: `LoggerEmailService` continua registrado apenas no `SharedModule.providers`.

- **REQ-EM-N04** [SHOULD] — Todos os templates `.tpl` **SHOULD** incluir um **rodapé** (última linha do `body`) com: link de "descadastro" (`${APP_LOGIN_URL}/account/unsubscribe`) — placeholder para change futura de preferências — e referência textual ao encarregado de tratamento de dados (DPO), com e-mail genérico (`dpo@<APP_NAME>`). Esta diretriz **SHOULD** ser validada por **teste estrutural** que lê todos os arquivos `.tpl` e verifica presença das substrings esperadas.
  - **Categoria**: LGPD / Compliance.
  - **Verificação**: teste unitário que varre `src/shared/infrastructure/templates/v1/*.tpl` e verifica regex `/descadastro|dpo@/i` em cada um.
  - **Rastreabilidade**: `src/shared/infrastructure/services/template-loader.service.spec.ts:loadAll > deve validar rodapé LGPD em todos os templates`.

- **REQ-EM-N05** [MUST] — A mudança **MUST** manter **100% de cobertura** dos novos requisitos pelos testes: cada `REQ-EM-NN` e `NFR-EM-NN` **MUST** ter ao menos 1 teste BDD, 1 teste ATDD e 1 teste TDD referenciado na RTM. Cobertura Jest **MUST** permanecer **≥ 80%** em todas as métricas (statements, branches, functions, lines), conforme `AGENTS.md §5`.
  - **Categoria**: Testabilidade (ISO 25010).
  - **Verificação**: `npm run test:cov` falha se cobertura global < 80%; RTM revisada no PR.
  - **Rastreabilidade**: `package.json` → `jest.coverageThreshold`.

- **REQ-EM-N06** [SHOULD] — O `EmailSenderService` **SHOULD** emitir uma **métrica** de contagem (counter) `email_sent_total` com label `template` e `status` (`'success' | 'failed'`), para integração com Prometheus/OTEL. A instrumentação **MUST** ser opt-out via env `EMAIL_NOTIFICATIONS_METRICS_ENABLED` (default `true` em dev/test, `false` em prod até a change `observability-v2`).
  - **Categoria**: Observabilidade (ISO 25010).
  - **Verificação**: inspeção de spans no Jaeger durante teste E2E manual.
  - **Rastreabilidade**: OTel meter em `EmailSenderService` (provedor `src/shared/infrastructure/observability/`).

## Mudanças no Schema

**Nenhuma migration necessária nesta change.** Não há novas tabelas, novos índices nem novas colunas — toda a informação de e-mails enviados é registrada em **logs estruturados do Pino** (NFR-EM-04 alternativa rejeitada: ver `proposal.md` §"Alternatives Considered" #4).

Caso o requisito de auditoria forte seja aprovado no futuro, a tabela `email_logs` será introduzida em change dedicada:

```prisma
// Fora do escopo — apenas ilustrativo para contexto futuro:
// model EmailLog {
//   id         String   @id @default(uuid())
//   templateId String
//   to         String
//   variables  Json
//   status     String   // 'sent' | 'failed'
//   error      String?
//   sentAt     DateTime @default(now())
//   @@index([to])
//   @@index([templateId, sentAt])
// }
```

## Contratos de API

**Nenhum endpoint novo/alterado.** A mudança é puramente **efeito colateral** em endpoints existentes: o usuário passa a receber e-mails após `POST /usuarios`, `POST /empresas/:id/usuarios`, `POST /auth/reset-password`, e (SHOULD) `PATCH /usuarios/:id` com `ativo=false`.

### Tabela de "triggers" (efeitos colaterais)

| Trigger (endpoint) | Condição de envio | Template ID | Variáveis | Bloqueante? |
|--------------------|-------------------|-------------|-----------|-------------|
| `POST /auth/forgot-password` (sucesso) | e-mail existe E usuário ativo | `auth.password_reset` | `nome, link, validade` | Não (REQ-EM-07) |
| `POST /auth/reset-password` (sucesso) | `unitOfWork.execute` commita | `usuarios.password_changed` | `nome, dataHora, ip?` | Não (REQ-EM-07) |
| `POST /usuarios` (201) | `repository.create` retorna usuário | `usuarios.welcome` | `nome, link` | Não (REQ-EM-07) |
| `POST /empresas/:id/usuarios` (201) | `addUserToCompany` retorna | `empresas.user_added` | `nomeUsuario, nomeEmpresa, perfis, loginUrl` | Não (REQ-EM-07) |
| `PATCH /usuarios/:id` com `ativo=false` | `ativo` transiciona `true→false` | `usuarios.account_disabled` | `nome, dataHora` | Não (REQ-EM-07) |

> **Nota sobre SHOULD**: o trigger `usuarios.account_disabled` é marcado como **SHOULD** (REQ-EM-05) — pode ser suprimido quando `EMAIL_NOTIFICATIONS_ENABLED=false`. Os outros 4 triggers são **SHALL** e disparam sempre (a menos que `EMAIL_NOTIFICATIONS_ENABLED=false` global — REQ-EM-09 + config).

### Variáveis de ambiente adicionadas (Joi em `src/config/env.validation.ts`)

```typescript
EMAIL_NOTIFICATIONS_ENABLED: Joi.boolean().default(true),
APP_NAME: Joi.string().min(1).max(80).default('API Padrão'),
APP_LOGIN_URL: Joi.string().uri().default('http://localhost:3000'),
EMAIL_NOTIFICATIONS_METRICS_ENABLED: Joi.boolean().default(false),
```

## Matriz de Rastreabilidade (RTM)

| REQ | Origem | BDD (cenário) | ATDD (teste e2e) | TDD (teste unitário) | Implementação planejada | Status |
|-----|--------|---------------|------------------|----------------------|-------------------------|--------|
| REQ-EM-01 (password_reset) | BR-EM-06 + REQ-PR-004 | `features/email-notifications.feature:Cenário: E-mail de recuperação de senha continua sendo enviado via template auth.password_reset` | `test/email-notifications.e2e-spec.ts:POST /auth/forgot-password > deve disparar emailSender.send com template auth.password_reset` | `src/auth/application/services/password-recovery.service.spec.ts:forgotPassword > deve chamar emailSenderService.send('auth.password_reset', ...)` | `password-recovery.service.ts:forgotPassword` | Pending |
| REQ-EM-02 (welcome) | BR-EM-01 | `features/email-notifications.feature:Cenário: E-mail de boas-vindas enviado ao criar usuário` | `test/email-notifications.e2e-spec.ts:POST /usuarios > deve disparar emailSender.send('usuarios.welcome', ...)` | `src/usuarios/application/services/usuarios.service.spec.ts:create > deve chamar emailSenderService.send('usuarios.welcome', ...)` | `usuarios.service.ts:create` | Pending |
| REQ-EM-03 (password_changed) | BR-EM-02 | `features/email-notifications.feature:Cenário: E-mail de confirmação enviado após reset de senha` | `test/email-notifications.e2e-spec.ts:POST /auth/reset-password > deve disparar emailSender.send('usuarios.password_changed', ...)` | `src/auth/application/services/password-recovery.service.spec.ts:resetPassword > deve chamar emailSenderService.send('usuarios.password_changed', ...)` | `password-recovery.service.ts:resetPassword` | Pending |
| REQ-EM-04 (user_added) | BR-EM-03 | `features/email-notifications.feature:Cenário: E-mail de vínculo a empresa lista os perfis atribuídos` | `test/email-notifications.e2e-spec.ts:POST /empresas/:id/usuarios > deve disparar emailSender.send('empresas.user_added', ...)` | `src/empresas/application/services/empresas.service.spec.ts:addUser > deve resolver nomes dos perfis via perfilRepository.findMany e chamar emailSender.send` | `empresas.service.ts:addUser` | Pending |
| REQ-EM-05 (account_disabled) | BR-EM-04 | `features/email-notifications.feature:Cenário: E-mail de desativação enviado quando usuário é desativado` | `test/email-notifications.e2e-spec.ts:PATCH /usuarios/:id (ativo=false) > deve disparar emailSender.send('usuarios.account_disabled', ...)` | `src/usuarios/application/services/usuarios.service.spec.ts:update (ativo=true→false) > deve chamar emailSenderService.send('usuarios.account_disabled', ...)` | `usuarios.service.ts:update` | Pending |
| REQ-EM-06 (anti-enumeração) | BR-EM-06 | `features/email-notifications.feature:Cenário: E-mail de recuperação preserva anti-enumeração` | `test/email-notifications.e2e-spec.ts:POST /auth/forgot-password > deve retornar 200 com mesmo corpo para e-mail existente e inexistente` | `src/auth/application/services/password-recovery.service.spec.ts:forgotPassword > deve retornar void sem chamar emailSender para e-mail inexistente` | `password-recovery.service.ts:forgotPassword` | Pending |
| REQ-EM-07 (não bloqueia) | Princípio de resiliência | `features/email-notifications.feature:Cenário: Falha no envio NÃO bloqueia a request` | `test/email-notifications.e2e-spec.ts:POST /usuarios > deve retornar 201 mesmo quando emailService.send() lança exceção` | `src/shared/application/services/email-sender.service.spec.ts:send > deve capturar erro do emailService, logar warn e retornar void` | `email-sender.service.ts:send` | Pending |
| REQ-EM-08 (templates versionados) | Princípio de versionamento | `features/email-notifications.feature:Cenário: Aplicação não sobe se template obrigatório está ausente` | `test/email-notifications.e2e-spec.ts:beforeAll > deve falhar boot se arquivo de template está corrompido` | `src/shared/infrastructure/services/template-loader.service.spec.ts:loadAll > deve carregar todos os templates v1/*.tpl no boot` | `template-loader.service.ts:loadAll` | Pending |
| REQ-EM-09 (renderer placeholders) | Princípio de authoring | `features/email-notifications.feature:Cenário: Renderer de template substitui placeholders corretamente` | `test/email-notifications.e2e-spec.ts:EmailSenderService > deve renderizar placeholders de variáveis e injetados automaticamente` | `src/shared/application/services/email-sender.service.spec.ts:send > deve substituir placeholders; placeholder faltando → throw` | `email-sender.service.ts:send` (renderer) | Pending |
| REQ-EM-10 (templateId whitelist) | Princípio de segurança | `features/email-notifications.feature:Cenário: templateId inválido é rejeitado e logado` | `test/email-notifications.e2e-spec.ts:EmailSenderService > deve ignorar templateId fora do padrão regex` | `src/shared/application/services/email-sender.service.spec.ts:send > deve fazer no-op e logar warn para templateId com caracteres inválidos` | `email-sender.service.ts:send` (validação) | Pending |
| REQ-EM-N01 (latência) | Performance | (implícito) | `test/email-notifications.e2e-spec.ts:POST /usuarios > deve responder em ≤ 200ms mesmo com envio de e-mail` | `src/shared/application/services/email-sender.service.spec.ts:send > deve completar em ≤ 50ms (mock)` | OTel span `email.send` | Pending |
| REQ-EM-N02 (não vaza PII) | Segurança | (implícito) | `test/email-notifications.e2e-spec.ts:EmailSenderService > não deve logar body em NODE_ENV=production` | `src/shared/infrastructure/services/logger-email.service.spec.ts:send > não deve logar body em produção` | `logger-email.service.ts:send` | Pending |
| REQ-EM-N03 (DIP) | Arquitetura | (implícito — verificado por inspeção) | (N/A — refactor) | `src/shared/infrastructure/services/logger-email.service.spec.ts:send > smoke test do adapter` | `shared.module.ts:providers` | Pending |
| REQ-EM-N04 (LGPD) | LGPD | (implícito — verificado por inspeção) | (N/A — estrutura) | `src/shared/infrastructure/services/template-loader.service.spec.ts:loadAll > deve validar rodapé LGPD em todos os templates` | `templates/v1/*.tpl` | Pending |
| REQ-EM-N05 (cobertura) | Testabilidade | (transversal) | `npm run test:cov` (≥ 80% global) | (transversal) | `package.json` → `jest.coverageThreshold` | Pending |
| REQ-EM-N06 (métricas) | Observabilidade | (implícito) | `test/email-notifications.e2e-spec.ts:EmailSenderService > deve emitir counter email_sent_total` | `src/shared/application/services/email-sender.service.spec.ts:send > deve incrementar counter via OTel meter` | `email-sender.service.ts:send` (métrica) | Pending |

## Acceptance Criteria

- [ ] AC-EM-01: `POST /usuarios` retorna HTTP 201 com o `Usuario` criado **E** o `EmailSenderService.send('usuarios.welcome', usuario.email, { nome, link })` é chamado exatamente 1 vez.
- [ ] AC-EM-02: `POST /empresas/:id/usuarios` com `perfilIds: [1, 2]` retorna HTTP 201 **E** o `EmailSenderService.send('empresas.user_added', usuario.email, { ..., perfis: 'Admin, Operador' })` é chamado exatamente 1 vez com os **nomes** dos perfis (não os IDs), resolvidos em 1 round-trip via `perfilRepository.findMany([1, 2])`.
- [ ] AC-EM-03: `POST /auth/reset-password` com token válido retorna HTTP 200 **E** o `EmailSenderService.send('usuarios.password_changed', user.email, ...)` é chamado exatamente 1 vez **após** o `unitOfWork.execute` commitar.
- [ ] AC-EM-04: `POST /auth/forgot-password` com e-mail válido retorna HTTP 200 **E** o `EmailSenderService.send('auth.password_reset', user.email, { link, validade, nome })` é chamado exatamente 1 vez; com e-mail **inexistente** retorna HTTP 200 com o **mesmo corpo** e o `send` **NÃO** é chamado (anti-enumeração preservada).
- [ ] AC-EM-05: `PATCH /usuarios/:id` com `ativo: false` retorna HTTP 200 **E** o `EmailSenderService.send('usuarios.account_disabled', usuario.email, ...)` é chamado exatamente 1 vez.
- [ ] AC-EM-06: `POST /usuarios` retorna HTTP 201 **mesmo quando** o `EmailService.send` lança `Error('SMTP down')` — a request **NÃO** falha. O erro é logado em `warn` com `{ event: 'email.failed', template, to, error }`.
- [ ] AC-EM-07: A aplicação **NÃO** sobe se o arquivo `src/shared/infrastructure/templates/v1/usuarios.welcome.tpl` está ausente, vazio ou não tem formato `subject: ...\nbody: ...`.
- [ ] AC-EM-08: `EmailSenderService.send('auth.password_reset', to, { nome: 'X', link: 'L' })` com template contendo `{{validade}}` (não fornecido em `variables`) lança `Error('Placeholder {{validade}} não encontrado em variables para template auth.password_reset')`.
- [ ] AC-EM-09: `EmailSenderService.send('../../etc/passwd', ...)` faz **no-op** + loga `warn` — **NÃO** chama `fs.readFile`.
- [ ] AC-EM-10: `EmailSenderService.send('template_inexistente', ...)` faz **no-op** + loga `warn` — não throw.
- [ ] AC-EM-11: Com `NODE_ENV=production`, o `LoggerEmailService.send` **NÃO** loga `body` (apenas `to` + `subject`). Em `development`/`test`, loga tudo.
- [ ] AC-EM-12: Todos os 5 templates em `src/shared/infrastructure/templates/v1/` contêm a string `descadastro` (ou `unsubscribe`) **E** a string `dpo@` no rodapé (NFR-EM-04).
- [ ] AC-EM-13: Cobertura Jest global permanece **≥ 80%** em todas as métricas após a mudança (`npm run test:cov` passa).
- [ ] AC-EM-14: O port `EmailService` **NÃO** é importado por nenhum service de feature (`UsuariosService`, `EmpresasService`, `PasswordRecoveryService`) — apenas `EmailSenderService` é injetado. Verificado por grep `grep -r "import.*EmailService" src/{usuarios,empresas,auth}/application/services/` retorna apenas `EmailSenderService`.

## API Specification

**Sem endpoints novos.** Os endpoints abaixo são os **gatilhos** (efeitos colaterais observáveis):

### Trigger 1: `POST /usuarios` (criação)

**Mudança observável**: criação de `Usuario` **dispara** `EmailSenderService.send('usuarios.welcome', ...)`.

**Contrato público**: inalterado. Ver [`src/usuarios/README.md`](../../../src/usuarios/README.md) para spec completa.

### Trigger 2: `POST /empresas/:id/usuarios` (vínculo)

**Mudança observável**: vínculo de `Usuario` a `Empresa` **dispara** `EmailSenderService.send('empresas.user_added', ...)`.

**Contrato público**: inalterado. Ver [`src/empresas/README.md`](../../../src/empresas/README.md) para spec completa.

### Trigger 3: `POST /auth/reset-password` (reset de senha)

**Mudança observável**: reset bem-sucedido **dispara** `EmailSenderService.send('usuarios.password_changed', ...)`.

**Contrato público**: inalterado. Ver [`src/auth/README.md`](../../../src/auth/README.md) para spec completa.

### Trigger 4: `POST /auth/forgot-password` (solicitação de reset)

**Mudança observável**: solicitação com e-mail válido **dispara** `EmailSenderService.send('auth.password_reset', ...)`.

**Contrato público**: inalterado (anti-enumeração preservada — ver `password-recovery/design.md:REQ-PR-001`).

### Trigger 5 (SHOULD): `PATCH /usuarios/:id` (com `ativo=false`)

**Mudança observável**: desativação **dispara** `EmailSenderService.send('usuarios.account_disabled', ...)`.

**Contrato público**: inalterado. Ver [`src/usuarios/README.md`](../../../src/usuarios/README.md) para spec completa.

## Data Models

### Refactor de localização (sem mudança de schema)

| Arquivo | Origem | Destino | Observação |
|---------|--------|---------|------------|
| `src/auth/domain/services/email.service.ts` | auth | `src/shared/domain/services/email.service.ts` | Re-export com `@deprecated` em `auth/...` |
| `src/auth/infrastructure/services/logger-email.service.ts` | auth | `src/shared/infrastructure/services/logger-email.service.ts` | Re-export com `@deprecated` em `auth/...` |

### Adições (novos artefatos — sem migration)

#### `EmailSenderService` (orquestrador — `src/shared/application/services/email-sender.service.ts`)

```typescript
export const EMAIL_SENDER_SERVICE = Symbol('EMAIL_SENDER_SERVICE');

export interface EmailSenderService {
  /**
   * Envia um e-mail transacional a partir de um template.
   * Não bloqueia a request em caso de erro (loga warn + retorna void).
   */
  send(
    templateId: string,
    to: string,
    variables: Record<string, string | number>,
  ): Promise<void>;
}
```

#### `TemplateLoaderService` (infraestrutura — `src/shared/infrastructure/services/template-loader.service.ts`)

```typescript
export interface EmailTemplate {
  templateId: string;
  subject: string;
  body: string;
}

export interface TemplateLoaderService {
  loadAll(): Map<string, EmailTemplate>;
  get(templateId: string): EmailTemplate | undefined;
}
```

#### Templates versionados (`src/shared/infrastructure/templates/v1/`)

| Arquivo | `templateId` | Subject | Variáveis esperadas |
|---------|--------------|---------|---------------------|
| `auth.password_reset.tpl` | `auth.password_reset` | `Recuperação de senha — {{APP_NAME}}` | `nome`, `link`, `validade` |
| `usuarios.welcome.tpl` | `usuarios.welcome` | `Bem-vindo ao {{APP_NAME}}!` | `nome`, `link` |
| `usuarios.password_changed.tpl` | `usuarios.password_changed` | `Sua senha foi alterada` | `nome`, `dataHora`, `ip` |
| `usuarios.account_disabled.tpl` | `usuarios.account_disabled` | `Sua conta foi desativada` | `nome`, `dataHora` |
| `empresas.user_added.tpl` | `empresas.user_added` | `Você foi adicionado à {{nomeEmpresa}}` | `nomeUsuario`, `nomeEmpresa`, `perfis`, `loginUrl` |

Formato de arquivo:

```text
subject: Recuperação de senha — {{APP_NAME}}

body:
Olá, {{nome}}!

Você solicitou a redefinição de sua senha no {{APP_NAME}}.
Clique no link abaixo (válido por {{validade}}):

{{link}}

Se você não fez essa solicitação, ignore esta mensagem.

---
{{APP_NAME}} — Você está recebendo este e-mail porque sua conta está cadastrada em nosso sistema.
Para dúvidas sobre privacidade, contate dpo@{{APP_NAME}}. Para descadastrar notificações, acesse {{APP_LOGIN_URL}}/account/unsubscribe.
```

## Edge Cases

| # | Caso | Tratamento |
|---|------|------------|
| 1 | `templateId` fora do padrão `^[a-z0-9_]+$` (path-traversal) | No-op + log `warn`. **NÃO** chama `fs.readFile`. (REQ-EM-10) |
| 2 | `templateId` válido mas não está em `KNOWN_TEMPLATES` | No-op + log `warn`. (REQ-EM-10) |
| 3 | Template carregado tem placeholder sem correspondente em `variables` | `EmailSenderService.send` lança `Error` (fail-fast de authoring). (REQ-EM-09) |
| 4 | `EmailService.send` lança exceção (mock SMTP falho) | `EmailSenderService.send` captura, loga `warn`, retorna `void`. Request HTTP não é afetada. (REQ-EM-07) |
| 5 | `to` é string vazia ou e-mail inválido | `EmailSenderService.send` valida com regex de e-mail; inválido → no-op + log `warn`. |
| 6 | Boot com arquivo de template ausente (ex.: `v1/usuarios.welcome.tpl` deletado) | `TemplateLoaderService.loadAll()` lança `Error`; NestFactory aborta; aplicação não sobe. (REQ-EM-08) |
| 7 | Boot com template presente mas sem `subject:` ou `body:` no formato esperado | `TemplateLoaderService` lança `Error('Template <id> malformado: esperado "subject: ..." e "body: ..."')`. |
| 8 | `EMAIL_NOTIFICATIONS_ENABLED=false` | `EmailSenderService.send` faz no-op (early return) sem chamar `EmailService`. |
| 9 | `addUser` chamado com `perfilIds` apontando para perfis soft-deletados | Validação existente (REQs do `empresas`) já lança `NotFoundException` antes de chegar ao trigger — comportamento inalterado. |
| 10 | `update(ativo=true→false)` chamado por admin em massa (loop sobre 1000 usuários) | 1000 e-mails são logados sequencialmente. Performance aceitável em mock (cada `send` é < 50ms). Em prod, change futura introduz fila. (Limitação documentada.) |
| 11 | `resetPassword` falha **após** commit (impossível com `unitOfWork`, mas hipotético) | `unitOfWork.execute` é atômico — ou tudo comita ou nada. Não há janela. (Decisão de arquitetura — REQ-EM-03 é pós-transação por construção.) |
| 12 | E-mail de boas-vindas enviado para usuário que **já existe** (caller esqueceu de checar) | `UsuariosService.create` lança `ConflictException` no `findByEmail` antes de chegar ao trigger. |
| 13 | `addUser` é idempotente (chamado 2x com mesmos params) | Prisma `addUserToCompany` é `connectOrCreate` — segunda chamada é no-op. Trigger **NÃO** dispara na segunda chamada. (Dependência do repo — verificar; se não idempotente, documentar como limitação.) |
| 14 | Falha de I/O ao ler template no boot (permissão negada, disco cheio) | `fs.readFileSync` lança `Error`; `loadAll` propaga; `onModuleInit` rejeita; NestFactory aborta. |
| 15 | `NODE_ENV=production` mas `LoggerEmailService` é o único adapter registrado | A request ainda funciona — o adapter apenas loga `to` + `subject` (sem `body`). Sem SMTP real, **nenhum e-mail é efetivamente entregue**. Esta é a **decisão consciente** desta change: SMTP real é a change `email-provider-integration`. |
| 16 | Renderer de template recebe `variables` com valor `undefined` (não declarado) | Filtra `undefined` antes da renderização (substitui por string vazia) — evita `{{var}}` virar `{{undefined}}`. Comportamento documentado. |

## Acceptance Tests (ATDD)

Localização: `test/email-notifications.e2e-spec.ts` (novo arquivo, dedicado).

```typescript
describe('EmailNotifications (e2e)', () => {
  let emailServiceSpy: jest.SpyInstance;

  beforeEach(async () => {
    // Spy no LoggerEmailService para contar envios e capturar argumentos
    emailServiceSpy = jest.spyOn(LoggerEmailService.prototype, 'send');
  });

  afterEach(() => {
    emailServiceSpy.mockRestore();
  });

  // REQ-EM-02
  it('AC-EM-01: POST /usuarios deve disparar emailSender.send com template usuarios.welcome', async () => {
    // setup: criar empresa, perfis
    // ação: POST /usuarios
    // asserção: emailServiceSpy foi chamado 1x com template 'usuarios.welcome' e to=novo email
  });

  // REQ-EM-04
  it('AC-EM-02: POST /empresas/:id/usuarios deve disparar emailSender.send com perfis resolvidos', async () => {
    // setup: empresa + 2 perfis (Admin, Operador)
    // ação: POST /empresas/:id/usuarios com perfilIds=[1, 2]
    // asserção: emailServiceSpy chamado com perfis='Admin, Operador' (1 round-trip)
  });

  // REQ-EM-03
  it('AC-EM-03: POST /auth/reset-password com token válido deve disparar emailSender.send usuarios.password_changed', async () => {
    // setup: forgot-password → extrair token do log
    // ação: POST /auth/reset-password com token + novaSenha
    // asserção: emailServiceSpy chamado 2x (1x para reset link, 1x para confirmação)
  });

  // REQ-EM-01 + REQ-EM-06
  it('AC-EM-04: POST /auth/forgot-password dispara template auth.password_reset para e-mail válido', async () => {
    // ...
  });

  it('AC-EM-04b: POST /auth/forgot-password com e-mail inexistente NÃO chama emailSender (anti-enumeração)', async () => {
    // ...
  });

  // REQ-EM-05
  it('AC-EM-05: PATCH /usuarios/:id com ativo=false deve disparar emailSender.send usuarios.account_disabled', async () => {
    // ...
  });

  // REQ-EM-07
  it('AC-EM-06: POST /usuarios retorna 201 mesmo quando emailService.send lança exceção', async () => {
    // setup: spy que mocka emailService.send para throw
    // ação: POST /usuarios
    // asserção: status 201, spy foi chamado, log warn emitido
  });

  // REQ-EM-09
  it('AC-EM-08: EmailSenderService lança erro se placeholder está faltando em variables', async () => {
    // ação: emailSenderService.send('auth.password_reset', 'x@x.com', { nome: 'X', link: 'L' })
    // asserção: throw 'Placeholder {{validade}} não encontrado'
  });

  // REQ-EM-10
  it('AC-EM-09: EmailSenderService ignora templateId com caracteres inválidos', async () => {
    // ação: emailSenderService.send('../../etc/passwd', ...)
    // asserção: no-op, warn logado, fs.readFile NÃO foi chamado
  });

  it('AC-EM-10: EmailSenderService ignora templateId não whitelistado', async () => {
    // ...
  });

  // NFR-EM-02
  it('AC-EM-11: LoggerEmailService NÃO loga body em NODE_ENV=production', async () => {
    // setup: NODE_ENV=production
    // ação: emailService.send({ to, subject, body: 'SECRET' })
    // asserção: spy do Logger NÃO foi chamado com 'SECRET'
  });
});
```

## Unit Tests (TDD)

Localização: 3 novos arquivos.

### `src/shared/infrastructure/services/logger-email.service.spec.ts` (TDD)

- `send` > deve ser definido
- `send` > deve logar to, subject e body em development
- `send` > NÃO deve logar body em production (apenas to + subject)
- `send` > deve aceitar EmailMessage com todos os campos

### `src/shared/application/services/email-sender.service.spec.ts` (TDD — ≥ 10 testes)

- `send` > deve ser definido
- `send` > deve renderizar placeholders e chamar emailService.send
- `send` > deve injetar automaticamente {{APP_NAME}}, {{APP_LOGIN_URL}}, {{ano_atual}}
- `send` > deve lançar erro se placeholder do template está faltando em variables (REQ-EM-09)
- `send` > deve capturar exceção do emailService e retornar void sem throw (REQ-EM-07)
- `send` > deve fazer no-op + warn para templateId com caracteres inválidos (REQ-EM-10)
- `send` > deve fazer no-op + warn para templateId não em KNOWN_TEMPLATES
- `send` > deve fazer no-op quando EMAIL_NOTIFICATIONS_ENABLED=false
- `send` > deve validar to como e-mail (regex); inválido → no-op
- `send` > deve logar evento estruturado { event: 'email.sent', template, to, requestId }
- `render` (interno) > deve substituir {{var}} por valor de variables
- `render` (interno) > deve filtrar valores undefined/vazios antes da substituição

### `src/shared/infrastructure/services/template-loader.service.spec.ts` (TDD)

- `loadAll` > deve carregar todos os arquivos em v1/*.tpl no boot
- `loadAll` > deve fazer parse de subject/body no formato esperado
- `loadAll` > deve lançar erro se template obrigatório está ausente
- `loadAll` > deve lançar erro se template está malformado (sem subject ou body)
- `loadAll` > deve validar rodapé LGPD (descadastro + dpo@) em todos os templates (NFR-EM-04)
- `get` > deve retornar template do cache por templateId
- `get` > deve retornar undefined para templateId desconhecido

## BDD Scenarios Associated

Arquivo: `features/email-notifications.feature` (novo — dedicado a esta feature).

```gherkin
# language: pt
Funcionalidade: Notificações por E-mail Transacionais

Eu como sistema
Quero enviar e-mails transacionais nos fluxos críticos
Para que os usuários sejam notificados sobre eventos relevantes da sua conta

Contexto:
  Dado que a API está configurada com EMAIL_NOTIFICATIONS_ENABLED=true
  E o adapter de e-mail é o LoggerEmailService (mock Pino)
  E o adapter é espiado para contagem de chamadas

Cenário: E-mail de recuperação de senha continua sendo enviado via template auth.password_reset
  Dado que existe um usuário cadastrado com e-mail "usuario@empresa.com"
  Quando eu enviar uma requisição POST para "/auth/forgot-password" com:
    | email | usuario@empresa.com |
  Então o status da resposta deve ser 200
  E o logger de e-mail deve ter sido chamado 1 vez
  E o template "auth.password_reset" deve ter sido renderizado com variáveis "nome, link, validade"

Cenário: E-mail de recuperação preserva anti-enumeração
  Quando eu enviar uma requisição POST para "/auth/forgot-password" com:
    | email | naoexiste@empresa.com |
  Então o status da resposta deve ser 200
  E o corpo da resposta deve conter "Se o e-mail existir"
  E o logger de e-mail NÃO deve ter sido chamado

Cenário: E-mail de confirmação enviado após reset de senha
  Dado que existe um token de reset válido para "usuario@empresa.com"
  Quando eu enviar uma requisição POST para "/auth/reset-password" com:
    | token      | TOKEN_VALIDO    |
    | novaSenha  | NovaSenha123!   |
  Então o status da resposta deve ser 200
  E o logger de e-mail deve ter sido chamado 2 vezes (1 para reset, 1 para confirmação)
  E o segundo envio deve usar o template "usuarios.password_changed"

Cenário: E-mail de boas-vindas enviado ao criar usuário
  Dado que existe uma empresa cadastrada com ID "empresa-1"
  Quando eu enviar uma requisição POST para "/usuarios" com:
    | email    | novo@empresa.com     |
    | senha    | SenhaForte123!       |
  Então o status da resposta deve ser 201
  E o logger de e-mail deve ter sido chamado 1 vez
  E o template "usuarios.welcome" deve ter sido renderizado com "nome=novo" e "link" presente

Cenário: E-mail de boas-vindas NÃO é enviado se EMAIL_NOTIFICATIONS_ENABLED=false
  Dado que EMAIL_NOTIFICATIONS_ENABLED está configurado como false
  Quando eu enviar uma requisição POST para "/usuarios" com:
    | email    | novo2@empresa.com    |
    | senha    | SenhaForte123!       |
  Então o status da resposta deve ser 201
  E o logger de e-mail NÃO deve ter sido chamado

Cenário: E-mail de vínculo a empresa lista os perfis atribuídos
  Dado que existe uma empresa com ID "empresa-1"
  E existem perfis cadastrados com nomes "Admin" e "Operador" para a empresa
  E existe um usuário com e-mail "novo@empresa.com"
  Quando eu enviar uma requisição POST para "/empresas/empresa-1/usuarios" com:
    | usuarioId | 1                  |
    | perfilIds | [1, 2]             |
  Então o status da resposta deve ser 201
  E o logger de e-mail deve ter sido chamado 1 vez
  E o template "empresas.user_added" deve ter sido renderizado com "perfis=Admin, Operador"

Cenário: E-mail de desativação enviado quando usuário é desativado
  Dado que existe um usuário ativo com e-mail "usuario@empresa.com"
  Quando eu enviar uma requisição PATCH para "/usuarios/1" com:
    | ativo | false |
  Então o status da resposta deve ser 200
  E o logger de e-mail deve ter sido chamado 1 vez
  E o template "usuarios.account_disabled" deve ter sido renderizado

Cenário: Falha no envio NÃO bloqueia a request
  Dado que o LoggerEmailService está configurado para lançar exceção em send
  Quando eu enviar uma requisição POST para "/usuarios" com:
    | email    | novo3@empresa.com    |
    | senha    | SenhaForte123!       |
  Então o status da resposta deve ser 201
  E o corpo da resposta deve conter o usuário criado
  E um log warn com "event: 'email.failed'" deve ter sido emitido

Cenário: Renderer de template substitui placeholders corretamente
  Quando o EmailSenderService.send for chamado com template "auth.password_reset", to "x@x.com" e variables "nome=João, link=https://..., validade=1 hora"
  Então o logger de e-mail deve receber um EmailMessage com subject contendo "API Padrão" (APP_NAME) e body contendo "João" e o link

Cenário: templateId inválido é rejeitado e logado
  Quando o EmailSenderService.send for chamado com templateId "../../etc/passwd"
  Então um log warn deve ser emitido
  E o logger de e-mail NÃO deve ter sido chamado

Cenário: Aplicação não sobe se template obrigatório está ausente
  Dado que o arquivo "src/shared/infrastructure/templates/v1/usuarios.welcome.tpl" não existe
  Quando a aplicação for inicializada
  Então o bootstrap deve falhar com erro mencionando o template ausente
```

**Total: 11 cenários BDD** (cobre REQ-EM-01..10 + REQ-EM-06 + REQ-EM-07 + NFR-EM-04 indiretamente).

## Technical Notes

- **Refactor não-quebrante**: o port `EmailService` e o adapter `LoggerEmailService` **continuam funcionando** durante a transição. Re-exports com `@deprecated` em `src/auth/{domain,infrastructure}/services/` mantêm compatibilidade com imports existentes. ESLint `@typescript-eslint/no-deprecated` alerta devs a migrarem.
- **DIP estrito**: services de feature (`UsuariosService`, `EmpresasService`, `PasswordRecoveryService`) **só** conhecem `EmailSenderService` — nunca `EmailService` diretamente. Isso garante que a troca futura para `queue.add()` no `EmailSenderService` não impacta callers.
- **Renderização de placeholders**: regex `/{{(\w+)}}/g` no `EmailSenderService` substitui por valor de `variables` (ou variáveis auto-injetadas). Variáveis auto-injetadas: `APP_NAME`, `APP_LOGIN_URL`, `ano_atual` (= `new Date().getFullYear()`).
- **Performance do renderer**: 1 chamada a `String.prototype.replace` por template — O(n) no tamanho do template. Templates têm < 2KB, latência < 1ms.
- **Cache de templates**: `Map<templateId, EmailTemplate>` em memória. Reload em hot-reload do NestJS (`onModuleInit` re-chama `loadAll`). Sem persistência (não há mudança de templates em runtime).
- **Idempotência**: o `EmailSenderService.send` **não** é idempotente por construção (cada chamada envia 1 e-mail). Idempotência é responsabilidade do caller (ex.: `UsuariosService.create` lança `ConflictException` em e-mail duplicado, não chega ao trigger).
- **Não-bloqueio (REQ-EM-07)**: o `await this.emailService.send(...)` é envolvido em `try/catch`. Em prod, quando o adapter for `SmtpEmailService` (latência ~ 200-500ms), o caller ainda assim completará em ~ 50ms (latência do `try/catch`), desde que a chamada seja `void` (sem esperar SMTP). Para isso, o adapter `SmtpEmailService` futuro **deve** enfileirar internamente (`queue.add()`) e retornar imediatamente — fora do escopo desta change.
- **Observabilidade**: cada `send` loga `{ event: 'email.sent', template, to, requestId, durationMs }` em `info`. Falhas logam `{ event: 'email.failed', template, to, error }` em `warn`. Nenhum `body` aparece nos logs.
- **Reuso máximo**: `TemplateLoaderService` é puramente local (não depende de nada externo). `EmailSenderService` depende apenas de `EmailService` (port) e `TemplateLoaderService` — testável em isolamento total.
- **Configuração via env**: 3 envs novas (`EMAIL_NOTIFICATIONS_ENABLED`, `APP_NAME`, `APP_LOGIN_URL`). Defaults sensatos para dev/test. `.env.test` deve setar `EMAIL_NOTIFICATIONS_ENABLED=true` para que os testes E2E dos triggers passem (assertivas de contagem).
- **Testes determinísticos**: `LoggerEmailService` é o único adapter registrado, e é puramente síncrono — não introduz flakiness. Spies no `Logger` capturam todas as chamadas.
- **Cobertura mínima**: ≥ 80% em todas as métricas (Jest), preservada pela suíte de testes. NFR-EM-05 é transversal.

## Status

- [x] Draft
- [ ] In Review
- [ ] Approved
- [ ] Implemented
