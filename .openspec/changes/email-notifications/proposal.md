# Feature: Notificações por E-mail (email-notifications) — Change Request

> **Tipo**: Change Request **prospectivo**. A feature **NÃO** está implementada em sua forma consolidada — este documento abre o ciclo `DDD → BDD → SDD → ATDD → TDD` para mover a porta `EmailService` de `auth/` para `shared/` e estender seu uso aos módulos `usuarios` e `empresas`. A integração com provedor SMTP/SES real é **fora de escopo** (change futura `email-provider-integration`).

## Why

A API `api-padrao` já possui o **port** (`EmailService`) e o **adapter mock** (`LoggerEmailService`) para envio de e-mails, mas eles estão acoplados ao módulo `auth` (criados pela change `password-recovery`) e são usados em **um único caso** (link de reset de senha). Em produção, nenhum e-mail transacional é enviado ao usuário — a única "comunicação" depende de logs estruturados do Pino (que ninguém lê).

Cenários reais onde o usuário precisa ser notificado por e-mail:

1. **Boas-vindas** ao criar um `Usuario` (informa credencial inicial, link para primeiro acesso, dicas de segurança).
2. **Confirmação de alteração de senha** após `reset-password` (e em eventual mudança de senha por usuário logado — futuro).
3. **Vínculo a empresa** quando um admin adiciona um usuário a uma `Empresa` com `Perfil`/perfis atribuídos (informar contexto, papel, nome da empresa).
4. **Exclusão/desativação de conta** (`Usuario.ativo = false` ou soft-delete) para que o usuário perceba que perdeu acesso e entre em contato com o admin.
5. (Já existente) **Recuperação de senha** — link de reset (RE-uso do port `EmailService`).

Hoje, nenhum desses fluxos dispara e-mail:

- `UsuariosService.create()` retorna o `Usuario` mas não notifica.
- `EmpresasService.addUser()` cria o vínculo mas o usuário **descobre** apenas quando tenta logar e recebe 403 por falta de perfil/permissão — péssima UX.
- `UsuariosService.update()` com `ativo = false` (soft-delete via `remove()`) não avisa o usuário.
- O `PasswordRecoveryService.resetPassword()` redefine a senha mas não confirma ao usuário (o atacante que tomou controle silenciosamente não pode ser detectado pelo titular legítimo).

A solução é **promover o port `EmailService` a um serviço compartilhado do `SharedModule`** e adicionar **3 triggers** de envio (boas-vindas, confirmação de reset, vínculo a empresa) + **1 trigger opcional** (desativação), com templates versionados e orquestração assíncrona-friendly (mock síncrono nesta change; troca para BullMQ em change futura).

Benefícios:

- **Reuso**: o mesmo `EmailService` serve a qualquer módulo que precise notificar o usuário, sem duplicar a abstração.
- **Testabilidade**: o adapter `LoggerEmailService` continua mockável em testes; nenhum teste E2E precisa de SMTP real.
- **Observabilidade**: cada envio loga um evento estruturado (`auth.email.sent`, `usuarios.email.welcome`, etc.) — Loki/ELK consegue auditar quem recebeu o quê.
- **LGPD-ready**: o template do e-mail traz rodapé com link de "descadastro" e referência ao encarregado (DPO), pronto para SMTP real em change futura.
- **Onboarding profissional**: hoje o primeiro acesso é silencioso; amanhã o usuário recebe um e-mail de boas-vindas com link "definir minha senha" — UX esperada em qualquer SaaS.

A feature **NÃO** inclui (escopo):

- SMTP/SES/SendGrid real — `LoggerEmailService` (Pino) continua sendo o adapter. Change futura: `email-provider-integration`.
- Fila assíncrona (BullMQ) para envio — esta change mantém o mock síncrono (instantâneo) e define um `EmailSenderService` (orquestrador) cuja implementação futura pode trocar `Promise.resolve()` por `queue.add()`. Trade-off consciente: simplicidade > throughput nesta fase.
- Persistência de histórico de e-mails enviados (`EmailLog` / `EmailQueue`) — fora de escopo; logs estruturados do Pino são suficientes para auditoria nesta change.
- E-mails transacionais customizáveis por `Empresa` (multi-tenant com template próprio) — fora de escopo; templates são globais, versionados em `src/shared/infrastructure/templates/`.
- Internacionalização dos templates — pt-BR fixo, com placeholders `{{nome}}`, `{{link}}`, `{{validade}}`. i18n fica para change futura.
- Envio de e-mail ao **admin** (ex.: "novo usuário cadastrado") — apenas destinatários diretos (`Usuario.email`).

## What Changes

### Adiciona

- **Mudança de localização** do port e adapter (sem mudança de contrato público):
  - `src/auth/domain/services/email.service.ts` → `src/shared/domain/services/email.service.ts` (re-exporta em `src/auth/domain/services/email.service.ts` para backward-compat, com `@deprecated`).
  - `src/auth/infrastructure/services/logger-email.service.ts` → `src/shared/infrastructure/services/logger-email.service.ts` (re-exporta com `@deprecated`).
  - Token de DI `EMAIL_SERVICE` permanece o mesmo símbolo (apenas muda o caminho de import).
- **Novo orquestrador** `EmailSenderService` em `src/shared/application/services/email-sender.service.ts`:
  - API: `send(templateId: string, to: string, variables: Record<string, string | number>): Promise<void>`.
  - Resolve template por `templateId` (ex.: `'auth.password_reset'`, `'usuarios.welcome'`, `'empresas.user_added'`, `'usuarios.password_changed'`, `'usuarios.account_disabled'`), renderiza placeholders `{{var}}` e delega ao `EmailService` port.
  - Loga evento estruturado `{ event: 'email.sent', template, to, requestId }` (Pino) — **NÃO** loga o corpo renderizado.
  - Resiliência: **envio NÃO bloqueia a request** — falhas são logadas em `warn` e engolidas (retornam `void`), conforme REQ-EM-07.
- **Templates versionados** em `src/shared/infrastructure/templates/`:
  - `v1/auth.password_reset.tpl` (move lógica de `password-recovery` para cá)
  - `v1/usuarios.welcome.tpl`
  - `v1/usuarios.password_changed.tpl`
  - `v1/usuarios.account_disabled.tpl`
  - `v1/empresas.user_added.tpl`
  - Cada arquivo exporta `{ subject, body }` em texto plano (renderização HTML fica para change futura), com placeholders `{{nome}}`, `{{link}}`, `{{validade}}`, `{{empresa}}`, `{{perfis}}` etc.
  - Carregamento via `fs.readFileSync` no boot (síncrono, templates são pequenos) e cache em `Map<templateId, Template>`. Falha de leitura → erro fatal no boot (fail-fast).
- **Trigger de envio de e-mail de boas-vindas** em `UsuariosService.create()`:
  - Após `usuarioRepository.create(usuario)`, dispara `emailSenderService.send('usuarios.welcome', usuario.email, { nome, email, senhaTemporaria? })`.
  - **Não bloqueia** a resposta do endpoint (`try/catch` + log em `warn`).
  - **Não inclui senha em texto plano** — apenas referencia "defina sua senha" e link para `/auth/forgot-password` (decisão de segurança: LGPD + boas práticas).
- **Trigger de envio de e-mail de vínculo a empresa** em `EmpresasService.addUser()`:
  - Após `empresaRepository.addUserToCompany(empresaId, usuarioId, perfilIds)`, dispara `emailSenderService.send('empresas.user_added', usuario.email, { nomeUsuario, nomeEmpresa, perfis, loginUrl })`.
  - Lista os nomes dos perfis atribuídos (lookup via `perfilRepository.findMany` em paralelo à operação atual — não impacta o round-trip crítico).
- **Trigger de envio de e-mail de confirmação de reset** em `PasswordRecoveryService.resetPassword()`:
  - Após o `unitOfWork.execute(...)` commitar, dispara `emailSenderService.send('usuarios.password_changed', user.email, { nome, ip, dataHora })`.
  - Substitui o body hard-coded atual do `forgotPassword` (que monta o e-mail de reset inline) por chamada ao `EmailSenderService` com template `auth.password_reset`.
- **Trigger de envio de e-mail de desativação** em `UsuariosService.update()` quando `ativo` muda de `true` para `false`:
  - Dispara `emailSenderService.send('usuarios.account_disabled', usuario.email, { nome, dataHora })`.
  - Marcado como **SHOULD** (REQ-EM-05) — pode ser desabilitado por flag `EMAIL_NOTIFICATIONS_ENABLED` se a operação exigir.
- **Configuração (envs adicionadas em `src/config/env.validation.ts`)**:
  - `EMAIL_NOTIFICATIONS_ENABLED: Joi.boolean().default(true)` — kill-switch global.
  - `APP_NAME: Joi.string().default('API Padrão')` — usado nos templates como remetente/identidade.
  - `APP_LOGIN_URL: Joi.string().uri().default('http://localhost:3000')` — link "definir minha senha" / "fazer login" nos templates.
- **Cenários BDD** em `features/email-notifications.feature` (novo arquivo, função dedicada):
  - `Cenário: E-mail de boas-vindas enviado ao criar usuário`
  - `Cenário: E-mail de boas-vindas NÃO é enviado se EMAIL_NOTIFICATIONS_ENABLED=false`
  - `Cenário: E-mail de confirmação enviado após reset de senha`
  - `Cenário: E-mail de vínculo a empresa lista os perfis atribuídos`
  - `Cenário: E-mail de desativação enviado quando usuário é desativado`
  - `Cenário: Falha no envio NÃO bloqueia a request`
  - `Cenário: Template desconhecido lança erro no boot`
- **Testes e2e** em `test/email-notifications.e2e-spec.ts` (ATDD, ~7 testes) — espiam o `EmailService` para validar triggers e contagem de envios.
- **Testes unitários** em `src/shared/infrastructure/services/logger-email.service.spec.ts` (TDD) e `src/shared/application/services/email-sender.service.spec.ts` (TDD, ≥ 10 testes cobrindo render de placeholders, template ausente, envio assíncrono, log estruturado).

### Não altera (escopo)

- Não introduz SMTP/SES/SendGrid real (change futura `email-provider-integration`).
- Não introduz fila assíncrona (BullMQ) para envio — o `EmailSenderService` é síncrono, mas a arquitetura permite trocar por `queue.add()` sem mexer nos callers.
- Não persiste histórico de e-mails enviados (`EmailLog`) — logs estruturados do Pino são a fonte de auditoria.
- Não introduz internacionalização (i18n) — pt-BR fixo.
- Não altera os endpoints públicos de `auth` (`/auth/forgot-password`, `/auth/reset-password`) — apenas a implementação interna do `PasswordRecoveryService` muda para usar `EmailSenderService`.
- Não altera o contrato de `POST /usuarios` ou `POST /empresas/:id/usuarios` — a única mudança observável externamente é o usuário **recebendo** um e-mail (em prod).
- Não introduz e-mails ao **admin** (notificação de novos cadastros) — apenas destinatários diretos.
- Não introduz templates customizáveis por empresa (multi-tenant) — templates são globais.

## Impact

| Área | Tipo de impacto | Descrição |
|------|-----------------|-----------|
| Estrutura de pastas | **Movimentação** | `EmailService` e `LoggerEmailService` saem de `src/auth/{domain,infrastructure}/services/` e passam a morar em `src/shared/{domain,infrastructure}/services/`. Re-exports com `@deprecated` em `src/auth/...` para não quebrar imports externos. |
| `SharedModule` | **Estende providers/exports** | Adiciona `EmailService` (binding `LoggerEmailService`), `EmailSenderService`, e o `TemplateLoaderService` (lê templates do disco no boot). Exporta `EMAIL_SERVICE` + `EmailSenderService` para reuso nos módulos de feature. |
| `AuthModule` | **Refactor** | Remove o binding `{ provide: EMAIL_SERVICE, useClass: LoggerEmailService }` (passa a vir do `SharedModule`). `PasswordRecoveryService` passa a injetar `EmailSenderService` em vez de `EmailService` diretamente. Imports atualizados. |
| Módulo `usuarios` | **Adição de trigger** | `UsuariosService` ganha injeção de `EmailSenderService`. `UsuariosModule` importa `SharedModule` (já importa indiretamente via `forwardRef(() => EmpresasModule)`, mas precisa do export explícito de `EmailSenderService`). |
| Módulo `empresas` | **Adição de trigger** | `EmpresasService` ganha injeção de `EmailSenderService` + `PerfilRepository` (para resolver nomes dos perfis no e-mail de vínculo). `EmpresasModule` importa `SharedModule` (já importa). |
| Domínio | **Refactor + adição** | `EmailService` muda de pacote (caminho). `EmailSenderService` (orquestrador) é nova porta lógica. `TemplateLoaderService` é nova porta de infraestrutura. |
| API pública | **Nenhuma mudança** | Nenhum endpoint novo/alterado. Nenhum payload muda. O único efeito externo observável é o usuário **recebendo** um e-mail (em prod). |
| Templates | **Adição** | 5 novos arquivos `.tpl` em `src/shared/infrastructure/templates/v1/`. Formato: `subject: <linha>\nbody: <texto com placeholders>`. |
| Configuração | **Adição** | 3 envs novas em `src/config/env.validation.ts`: `EMAIL_NOTIFICATIONS_ENABLED` (default `true`), `APP_NAME` (default `'API Padrão'`), `APP_LOGIN_URL` (default `http://localhost:3000`). |
| Segurança | **Endurecimento** | Templates **NÃO** contêm PII estática (apenas placeholders). Pino logger **NÃO** loga o corpo renderizado em produção (NFR-EM-02). Anti-enumeração preservada no `forgot-password` (não muda contrato). LGPD: rodapé com link de descadastro e referência ao encarregado (NFR-EM-04). |
| Operacional | **Observabilidade** | Cada envio loga `{ event: 'email.sent', template, to, requestId }` em `info`. Falhas logam `{ event: 'email.failed', template, to, error }` em `warn`. O token plain de reset **não** aparece no log do envio (NFR-EM-02). |
| Testes | **Cobertura** | 7 cenários BDD + ~7 testes e2e (ATDD) + ≥ 10 testes unitários (TDD) para o `EmailSenderService` + testes do `LoggerEmailService`. Cobertura mínima (≥ 80% em todas as métricas) preservada. |

### Usuários impactados

- **Usuários finais**: passam a receber e-mails transacionais (boas-vindas, confirmação de reset, vínculo a empresa, desativação) em vez de descobrir mudanças por tentativa-e-erro.
- **Operações / DevOps**: precisam configurar `APP_NAME` e `APP_LOGIN_URL` (defaults prontos para dev). Em prod, devem garantir que logs Pino com `event: 'email.sent'` são coletados (Loki/ELK).
- **Desenvolvedores** que estendem a API: ganham `EmailSenderService` injetável em qualquer service — disparar e-mail em novos fluxos requer 1 linha (`await this.emailSender.send('modulo.evento', to, vars)`).
- **Consumidores da API**: **nenhuma** mudança contratual. Endpoint público de `POST /usuarios` segue retornando o `Usuario` criado — o e-mail é efeito colateral.

## Risks

| Risco | Probabilidade | Impacto | Mitigação proposta |
|-------|---------------|---------|---------------------|
| **Movimentação quebra imports externos** (libs internas, imports relativos em outros módulos) | Média | Alto | Re-export com `@deprecated` em `src/auth/domain/services/email.service.ts` e `src/auth/infrastructure/services/logger-email.service.ts` apontando para os novos caminhos. ESLint `@typescript-eslint/no-deprecated` alerta mas não bloqueia. Build verifica zero `any` regressão. |
| **Envio de e-mail bloqueia a request** (adapter lento em prod, mesmo sendo mock) | Baixa | Médio | `EmailSenderService` é envolvido em `try/catch` que loga `warn` e retorna `void` (REQ-EM-07). Implementação futura BullMQ troca a chamada por `queue.add()` sem mexer nos callers. |
| **Vazamento de PII no log** (template com nome/e-mail renderizado cai no Pino) | Média | Alto | Logger do `EmailSenderService` **NÃO** recebe o `body` renderizado, apenas `{ template, to }` (NFR-EM-02). O `LoggerEmailService` em modo dev loga o corpo para DX, mas em `NODE_ENV=production` omite o `body` (apenas `to` + `subject`). Documentar e cobrir com teste. |
| **Templates path-traversal** (carregamento de arquivo arbitrário via `templateId` malicioso) | Baixa | Alto | `templateId` é validado por regex `^[a-z0-9_]+$` antes do `fs.readFileSync`. Whitelist de templates conhecidos (constante `KNOWN_TEMPLATES`). `templateId` desconhecido → log `warn` + no-op (não throw — REQ-EM-07). |
| **Falha no boot por template ausente/corrompido** | Baixa | Médio | `TemplateLoaderService.loadAll()` é chamado no `onModuleInit` do `SharedModule`; falha de leitura → `Error` fatal → NestFactory aborta o boot. Trade-off consciente: melhor falhar cedo do que enviar e-mails quebrados. |
| **Trigger dispara em excesso** (e-mail de boas-vindas em import em massa de 1000 usuários) | Média | Médio | Cada envio é logado com `requestId` e `templateId` para rate-limit manual em prod (futuro: hook no `EmailSenderService` que aplica rate limit por `templateId`). Por enquanto, aceitamos o volume e documentamos. |
| **Idempotência ausente** (retry da request dispara e-mail duplicado) | Média | Médio | Esta change **não** implementa deduplicação. A responsabilidade é do caller (ex.: o `UsuariosService.create()` é idempotente via `ConflictException` no e-mail duplicado — não chega a chamar `emailSender.send`). Para futuras integrações assíncronas com retry, a deduplicação pode ser feita por `requestId` ou hash `(templateId, to, hash(variables))` em `EmailLog` (change futura). |
| **Trigger de vínculo a empresa dispara para usuário já vinculado** (race condition) | Baixa | Baixo | `addUserToCompany` é idempotente no Prisma (`upsert` ou `connectOrCreate` na tabela de junção). Se o vínculo já existe, **não** reenvia e-mail (futuro: condicionar o envio à criação efetiva, não à chamada). |
| **Mudança no `forgotPassword` quebra teste e2e existente** (template novo em vez do body hard-coded) | Baixa | Médio | `test/auth-password-recovery.e2e-spec.ts` valida o envio via spy no `EmailService` (conta de chamadas), não inspeciona o corpo. Mudança é transparente. Verificar. |
| **LGPD: e-mail de desativação expõe motivo** (`"você foi desativado por ter feito X"`) | Baixa | Médio | Template `usuarios.account_disabled` é genérico ("Sua conta foi desativada. Entre em contato com o administrador."), **não** cita motivo. Decisão registrada. |

## Alternatives Considered

### 1. **Manter `EmailService` em `auth/` e fazer cada módulo ter seu próprio port**

- **Proposta**: `usuarios` define `UsuarioEmailService`, `empresas` define `EmpresaEmailService`, etc. — cada um com sua interface e seu adapter.
- **Rejeitada**: duplicação massiva (4+ ports + 4+ adapters), quebra DRY, e a abstração é a mesma ("enviar e-mail"). O port pertence a `shared/`, não ao domínio de um único módulo. Bad smell arquitetural.

### 2. **Enviar e-mails via hook no Prisma (middleware `$extends`)**

- **Proposta**: definir triggers via `prisma.$extends({ query: { usuario: { create: async ({ args, query }) => { /* send email */ return query(args); } } } })`.
- **Rejeitada**: mistura orquestração de caso de uso com persistência; o service de aplicação (`UsuariosService`) deixa de ter controle sobre **quando** e **o que** enviar (ex.: e-mail de boas-vindas com senha temporária exige variáveis que só o service tem). Hooks Prisma são bons para auditoria (`AuditInterceptor` usa esse padrão), ruins para fluxos de negócio.

### 3. **Usar fila assíncrona (BullMQ) já nesta change**

- **Proposta**: enfileirar todo e-mail em `email-queue` no Redis e processar em worker dedicado.
- **Rejeitada** (parcialmente — fica para change futura): adiciona complexidade operacional (worker, retry policy, dead-letter) sem ganho imediato, dado que `LoggerEmailService` é mock síncrono e instantâneo. Decisão: definir o `EmailSenderService` com **assinatura** compatível com troca futura por `queue.add()` (`await this.queue.add(templateId, { to, variables })`), mas implementar como `Promise.resolve()` por enquanto. Em prod, o esforço de enfileirar real depende de SMTP real — change `email-provider-integration` cobre ambos juntos.

### 4. **Persistir e-mails enviados em `EmailLog` (auditoria forte)**

- **Proposta**: tabela `email_logs` com `templateId`, `to`, `variablesJson`, `sentAt`, `status` — consulta para o usuário "ver todos os e-mails que recebeu" (transparência LGPD).
- **Rejeitada** (nesta change): LGPD Art. 37 obriga o controlador a manter registro dos tratamentos, mas o **e-mail em si** é dado de tratamento cuja base legal é execução de contrato (não precisa de `EmailLog` dedicado). Logs estruturados do Pino (com retenção de 90 dias via Loki) são suficientes. `EmailLog` fica para change futura se houver requisito regulatório específico.

### 5. **Internacionalizar templates já nesta change (i18n)**

- **Proposta**: usar `@nestjs/i18n` para renderizar templates em `pt-BR` / `en-US` / `es-ES`.
- **Rejeitada**: i18n multiplica a complexidade (MessageFormat, pluralização, fallback) e a API tem um único idioma público (pt-BR). YAGNI — i18n fica para change dedicada quando houver cliente internacional.

### 6. **Adiar a feature e enviar e-mails manualmente via admin**

- **Rejeitada**: a UX "descobrir por tentativa-e-erro" do vínculo a empresa é o **bloqueador número 1** relatado pelos times que avaliaram o piloto. A feature é de prioridade alta porque corrige um gap de produto e libera onboarding self-service de verdade (a `password-recovery` sozinha não basta — sem boas-vindas, o primeiro login é "tela em branco").

## Status

- [x] Draft
- [ ] In Review
- [ ] Approved
- [ ] Implemented
