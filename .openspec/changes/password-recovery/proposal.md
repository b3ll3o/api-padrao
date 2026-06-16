# Feature: Recuperação de Senha (password-recovery) — Change Request

> **Tipo**: Change Request **prospectivo**. A feature **NÃO** está implementada — este documento abre o ciclo `DDD → BDD → SDD → ATDD → TDD` e guiará a fase de implementação.

## Why

A API `api-padrao` já implementa autenticação por e-mail + senha (change `auth`) e está pronta para produção, mas não oferece nenhum mecanismo self-service de **recuperação de senha**. Cenários reais exigem esse fluxo:

1. Usuário esquece a senha cadastrada (cenário mais comum — ~70% dos tickets de suporte a identidade).
2. Conta corporativa é provisionada com senha temporária e o usuário precisa trocá-la no primeiro acesso (onboarding).
3. Suspeita de vazamento: o usuário precisa **rotacionar** a credencial sem passar por suporte.
4. Lockout após várias tentativas de login erradas (futuro, mas o fluxo de reset cobre a mitigação).

Sem um canal self-service, o recovery depende inteiramente de intervenção manual (DBA ou suporte) — o que (a) **não escala**, (b) **expõe a hash de senha** durante o reset manual, (c) **gera atrito** e (d) **não gera trilha de auditoria** compatível com o resto do projeto.

A solução escolhida é o **fluxo clássico "forgot password + email com link de reset"** porque é:

- **Padrão de mercado** (NIST SP 800-63B, OWASP Forgot Password Cheat Sheet) — usuários já conhecem.
- **Compatível com a stack** (NestJS + Prisma + Fastify + Pino logger) — sem dependências externas obrigatórias.
- **Auditável** — persiste `usedAt` + `createdAt` + `ip` no `PasswordResetToken`, e revoga todos os `RefreshToken` ativos do usuário, criando trilha de "senha trocada → todas as sessões foram revogadas".
- **Desacoplado do canal** — o envio de e-mail é feito por um `EmailService` mockável (Pino logger), permitindo trocar por SMTP/SES/SendGrid sem alterar o service de aplicação.

A feature **NÃO** inclui (escopo):

- MFA, OAuth/OIDC, magic-link sem senha, sessões server-side.
- Reset por SMS (canal não confiável e não coberto pelo projeto).
- Bloqueio de conta por tentativas de login (change `tenant-rate-limit` cobre o rate limit; lockout é futuro).
- Reset de senha pelo próprio usuário logado (mudança de senha tradicional) — esse fluxo é coberto por `usuarios` (futuro).

## What Changes

### Adiciona

- **Modelo Prisma** `PasswordResetToken`:
  - `id` (UUID), `userId` (Int → `Usuario.id`), `tokenHash` (String @unique — SHA256 do token opaco), `expiresAt` (DateTime), `usedAt` (DateTime? — marca uso único), `createdAt` (DateTime @default(now())).
  - Índice em `userId` (busca por usuário) e em `tokenHash` (lookup principal já coberto por `@unique`).
  - Relação reversa `Usuario.passwordResetTokens PasswordResetToken[]`.
- **Dois endpoints públicos** no módulo `auth`:
  - `POST /auth/forgot-password` — recebe `email`, gera token opaco (32 bytes random → 64 hex chars), persiste o **hash SHA256** do token, e dispara "envio de e-mail" (Pino logger mock) com link `https://app.example.com/reset-password?token=<token_plain>`. Resposta **sempre 200**, mesmo se o e-mail não existir (anti-enumeração).
  - `POST /auth/reset-password` — recebe `token` (plain) + `nova_senha`, valida o token (hash + expiração + `usedAt`), aplica `PasswordHasher.hash` na nova senha, marca `usedAt = now()`, **revoga todos os `RefreshToken` ativos** do usuário, e retorna 200.
- **Serviço de aplicação** `PasswordRecoveryService` (em `src/auth/application/services/password-recovery.service.ts`) com métodos:
  - `requestReset(email)` — orquestra geração + persistência + envio.
  - `confirmReset(token, novaSenha)` — orquestra validação + rotação de hash + revogação de refresh tokens.
- **Serviço de infra mock** `LoggerEmailService` (em `src/auth/infrastructure/services/logger-email.service.ts`) implementando a interface `EmailService` (definida em `src/auth/domain/services/email.service.ts`) — apenas loga via `Logger` (Pino) com o link e o token em uma linha dedicada `Reset link:`.
- **Interface `EmailService`** (em `src/auth/domain/services/email.service.ts`) com método `sendPasswordReset(to: string, resetLink: string, expiresInMinutes: number): Promise<void>` — permite trocar Pino por SMTP sem tocar o service de aplicação (DIP).
- **4 cenários BDD** em `features/autenticacao.feature` (mesmo arquivo, feature estendida) cobrindo: e-mail válido, e-mail inexistente (silencioso), token expirado, token já usado.
- **2 testes e2e** em `test/auth.e2e-spec.ts` (módulo `POST /auth/forgot-password` e `POST /auth/reset-password`).
- **Testes unitários** em `src/auth/application/services/password-recovery.service.spec.ts` (TDD).

### Não altera (escopo)

- Não altera `Usuario`, `RefreshToken`, `LoginHistory` (apenas referencia).
- Não altera o contrato de `POST /auth/login` / `POST /auth/refresh`.
- Não introduz SMTP real — `EmailService` é uma interface e a implementação concreta em produção é decisão de change futura (`email-provider-integration` ou similar).
- Não introduz rate limit específico (reusa o tier `sensitive` global já configurado).
- Não cria uma rota autenticada de "trocar minha senha" — isso é feature de `usuarios` e exige `Authorization: Bearer`.

## Impact

| Área | Tipo de impacto | Descrição |
|------|-----------------|-----------|
| Banco de dados | Migration | Nova tabela `password_reset_tokens` (id, userId, tokenHash @unique, expiresAt, usedAt, createdAt) + índice em `userId` + relação em `Usuario`. |
| Módulo `auth` | Adição | Novo service (`PasswordRecoveryService`) + 2 novos endpoints no `AuthController` + provider `LoggerEmailService` binding para `EmailService`. **Sem novo módulo NestJS** — convive em `AuthModule` para manter coesão de domínio. |
| Domínio | Adição | Interface `EmailService` (port) + implementação `LoggerEmailService` (adapter). |
| Segurança | Endurecimento | Hash da senha via `PasswordHasher` (já existente). Revogação em cascata de `RefreshToken` no reset. SHA256 do token no DB (mesmo padrão de `RefreshToken` direto — não armazena o token plain). Anti-enumeração no `forgot-password`. |
| API pública | Contrato | 2 novos endpoints públicos (`/auth/forgot-password`, `/auth/reset-password`). |
| Configuração | Adição | `APP_RESET_PASSWORD_URL` (env, default `https://app.example.com/reset-password`) e `PASSWORD_RESET_EXPIRES_MINUTES` (env, default `60`) — validados pelo Joi. |
| Operacional | Observabilidade | Linhas de log `Reset link:` no Pino (mock) devem ser capturadas por agregador (Loki/ELK) em prod. |
| Testes | Cobertura | 4 cenários BDD + 2 testes e2e (ATDD) + ≥ 5 testes unitários (TDD) do `PasswordRecoveryService`. |

### Usuários impactados

- **Usuários finais**: recebem e-mail com link de reset (em prod, com SMTP real).
- **Operações**: precisam configurar `APP_RESET_PASSWORD_URL` apontando para o frontend.
- **Consumidores da API**: integram 2 novos endpoints no fluxo de UX de "esqueci minha senha".

## Risks

| Risco | Probabilidade | Impacto | Mitigação proposta |
|-------|---------------|---------|---------------------|
| **User enumeration** via `forgot-password` (atacante descobre e-mails cadastrados pelo tempo de resposta) | Média | Médio | Resposta **sempre 200** + mesmo corpo + tempo de resposta equivalente (sleep random/jitter se necessário). Documentar. |
| **Brute force** em `POST /auth/reset-password` (adivinhar token de 64 hex chars = 256 bits) | Muito baixa | Alto | Token de 32 bytes (256 bits) randomicos via `crypto.randomBytes`. Espaço inviável. Tier `sensitive` no rate limit (10 req/min/IP). |
| **Token vazado** (link em log de proxy, e-mail de terceiro, etc.) | Média | Alto | Hash SHA256 no DB (mesmo se DB vaza, token plain não). TTL de 1h. Uso único (`usedAt`). Revoga refresh tokens ativos do usuário. |
| **Timing attack** na comparação do hash do token | Baixa | Médio | Comparação em **tempo constante** (`crypto.timingSafeEqual`) — não usar `===`. |
| **Reuso de token** em janela de validade | Baixa | Alto | `usedAt != null` → 400 `Token já utilizado.` Não permite reset novamente com o mesmo token. |
| **Múltiplos tokens válidos** (usuário solicita 3 resets em sequência) | Alta | Baixo | Política explícita: **último token gerado invalida os anteriores** (UPDATE usado para marcar os pendentes como `usedAt = now()` antes de inserir o novo). Reduz superfície de ataque. |
| **Envio de e-mail bloqueia o request** (SMTP lento) | Baixa | Médio | Implementação mock é síncrona e instantânea. Em prod, a `EmailService` real **deverá** enfileirar (Bull/BullMQ) — fora do escopo desta change. |
| **Reset permite trocar senha de usuário com `deletedAt != null`** | Baixa | Alto | `forgot-password` consulta `findByEmail` com soft-delete: `deletedAt: null, ativo: true` — usuário soft-deletado não recebe link. |
| **Reset não revoga refresh tokens do usuário** (sessão antiga continua válida) | Média | Alto | Obrigatório: `prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } })` antes do 200. Documentado em REQ-PR-006. |

## Alternatives Considered

### 1. **Reset direto via resposta do `forgot-password`** (sem e-mail)

- **Proposta**: o próprio endpoint retornaria o token (ou link) no JSON.
- **Rejeitada**: vazaria credenciais via logs/HTTPS termination/proxies, não tem como o usuário provar identidade (qualquer um com o e-mail reseta), e fere o princípio de "verificação por canal secundário" (NIST 800-63B).

### 2. **OTP por SMS**

- **Rejeitada**: o projeto não tem provedor SMS configurado, SMS é caro e inseguro (SIM swap), e adiciona dependência operacional sem ganho real sobre e-mail.

### 3. **Magic link sem senha** (clicar no link = autenticar)

- **Rejeitada**: muda o modelo de autenticação (afasta do e-mail+senha) e exige refactor do `AuthGuard`/`JwtStrategy`. Fora de escopo e rejeitada pelo time na change `auth`.

### 4. **Armazenar o token plain no DB** (sem hash)

- **Rejeitada**: vaza o token em caso de dump do banco (mesma justificativa do `RefreshToken` em `auth/design.md`). Padrão da casa: sempre armazenar hash.

### 5. **Reset via perguntas de segurança**

- **Rejeitada**: NIST 800-63B **baniu** esse mecanismo em 2017. Inadequado para o nível de segurança esperado.

### 6. **Adiar a feature e aceitar resets manuais via suporte**

- **Rejeitada**: não escala, expõe hash de senha, e bloqueia onboarding self-service. A feature é de prioridade alta porque é pré-requisito de qualquer cliente com UX profissional.

## Status

- [x] Draft
- [ ] In Review
- [ ] Approved
- [ ] Implemented
