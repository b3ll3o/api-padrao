# Feature: Recuperação de Senha (password-recovery) — Design Specification

## Overview

A feature **password-recovery** adiciona o fluxo self-service "esqueci minha senha" à API `api-padrao`. A persona é o **usuário final** que perdeu acesso à sua conta (esqueceu a senha) ou que suspeita de comprometimento. A jornada é:

1. O usuário acessa a tela "Esqueci minha senha" no frontend e informa o e-mail.
2. O frontend chama `POST /auth/forgot-password` e mostra uma mensagem genérica ("Se o e-mail existir, enviaremos um link de redefinição") — **independentemente de o e-mail existir ou não** (anti-enumeração).
3. O backend gera um token opaco de 32 bytes (256 bits, ~5.3e76 combinações), persiste o **hash SHA256** no DB com `expiresAt = now + 1h`, e envia um "e-mail" (logado via Pino no dev/test) contendo o link `https://app.example.com/reset-password?token=<token_plain>`.
4. O usuário clica no link, é levado ao frontend, e preenche `nova_senha`.
5. O frontend chama `POST /auth/reset-password` com `{ token, nova_senha }`.
6. O backend valida o token (hash + expiração + `usedAt`), aplica o `PasswordHasher.hash` na nova senha, marca `usedAt = now()`, **revoga todos os `RefreshToken` ativos do usuário** (forçando logout de todas as sessões), e responde 200.

**Casos de uso cobertos:**

- Esqueci minha senha (cenário principal).
- Reset forçado após suspeita de vazamento.
- Onboarding: troca de senha temporária no primeiro acesso.
- Revogação em cascata de todas as sessões do usuário após reset (defesa em profundidade — mesmo se a senha nova vazar, sessões antigas ficam inválidas).

**Não cobertos** (outras changes ou futuro): troca de senha por usuário logado (sem token), MFA, OAuth/OIDC, magic-link, lockout por tentativas, reset por SMS, provisionamento de SMTP real.

## Requirements (RFC 2119)

### Functional Requirements

- **REQ-PR-001**: The system **MUST** expose `POST /auth/forgot-password` as a public endpoint (`@Public()`) that accepts `ForgotPasswordDto` (`email`) and **MUST** always return HTTP 200 with a generic body — **regardless of whether the e-mail exists** — to prevent user enumeration.
  - Rastreabilidade:
    - BDD: `features/autenticacao.feature:Cenário: Esqueci minha senha com e-mail válido`, `Cenário: Esqueci minha senha com e-mail inexistente retorna 200`
    - ATDD: `test/auth.e2e-spec.ts:POST /auth/forgot-password > deve retornar 200 para e-mail cadastrado` / `> deve retornar 200 para e-mail inexistente (sem user enumeration)`
    - TDD: `src/auth/application/services/password-recovery.service.spec.ts:requestReset > deve retornar mesmo corpo para e-mail existente e inexistente`

- **REQ-PR-002**: The system **MUST** generate a 32-byte cryptographically random token (`crypto.randomBytes(32).toString('hex')` — 64 hex chars / 256 bits) for each `forgot-password` request whose e-mail matches an **active** `Usuario` (not soft-deleted, `ativo = true`).
  - Rastreabilidade:
    - TDD: `password-recovery.service.spec.ts:requestReset > deve gerar token de 64 hex chars quando o e-mail existe` (asserção: `length === 64` e regex `/^[0-9a-f]+$/`)
    - TDD: `> deve chamar prisma.passwordResetToken.create com tokenHash = sha256(token)`

- **REQ-PR-003**: The system **MUST** persist the **SHA256 hash** of the generated token in `PasswordResetToken.tokenHash` (not the plain token), along with `userId`, `expiresAt = now + PASSWORD_RESET_EXPIRES_MINUTES` (default `60` min), `usedAt = null`, `createdAt = now()`. The plain token **MUST** be returned only in the e-mail (and never stored).
  - Rastreabilidade:
    - TDD: `password-recovery.service.spec.ts:requestReset > deve chamar prisma.passwordResetToken.create com tokenHash e nunca com token plain`
    - Implementação: `crypto.createHash('sha256').update(token).digest('hex')` aplicado **antes** do `prisma.create`.

- **REQ-PR-004**: The system **MUST** send the reset link to the user via the `EmailService` port. The link **MUST** be `${APP_RESET_PASSWORD_URL}?token=<token_plain>`. The token in the link **MUST** be the **plain** token (not the hash) — só assim o portador pode usá-lo.
  - Rastreabilidade:
    - TDD: `password-recovery.service.spec.ts:requestReset > deve chamar emailService.sendPasswordReset(to, link, expiresInMinutes)`

- **REQ-PR-005**: The system **MUST** invalidate any previous **unused** (`usedAt IS NULL AND expiresAt > now`) `PasswordResetToken` for the same user when issuing a new one, to prevent multiple valid tokens in flight.
  - Rastreabilidade:
    - TDD: `password-recovery.service.spec.ts:requestReset > deve marcar usedAt=now() em tokens pendentes do mesmo usuário antes de inserir o novo`

- **REQ-PR-006**: The system **MUST** expose `POST /auth/reset-password` as a public endpoint (`@Public()`) that accepts `ResetPasswordDto` (`token`, `nova_senha`) and, on success, **MUST**:
  - (a) hash `nova_senha` via `PasswordHasher.hash` and update `Usuario.senha`;
  - (b) mark the `PasswordResetToken.usedAt = now()`;
  - (c) revoke **all** `RefreshToken` of the user (`updateMany` where `revokedAt IS NULL` and `expiresAt > now`) — forçando logout de todas as sessões ativas;
  - (d) return HTTP 200 with `{ message: "Senha redefinida com sucesso." }`.
  - Rastreabilidade:
    - BDD: `Cenário: Reset de senha com token válido`
    - ATDD: `test/auth.e2e-spec.ts:POST /auth/reset-password > deve redefinir a senha, marcar usedAt e revogar refresh tokens`
    - TDD: `password-recovery.service.spec.ts:confirmReset > deve aplicar hash, marcar usedAt e revogar refresh tokens em sucesso`

- **REQ-PR-007**: The system **MUST** reject `POST /auth/reset-password` with HTTP 400 and message `Token expirado.` when `expiresAt < now`, with HTTP 400 and message `Token já utilizado.` when `usedAt != null`, and with HTTP 400 and message `Token inválido.` when no row matches the `tokenHash`.
  - Rastreabilidade:
    - BDD: `Cenário: Token de reset expirado`, `Cenário: Token de reset já utilizado`
    - TDD: `password-recovery.service.spec.ts:confirmReset > deve lançar BadRequestException 'Token expirado.'` / `'Token já utilizado.'` / `'Token inválido.'`

- **REQ-PR-008**: The system **MUST** validate `ResetPasswordDto` (`nova_senha` with `MinLength(8)`, `IsString`, `IsNotEmpty`; `token` with `IsString`, `IsNotEmpty`, length `>= 64`) and return HTTP 400 with localized error messages on validation failure. The `token` **MUST** be **at most 128 chars** to mitigate payload-based DoS.
  - Rastreabilidade:
    - BDD: `Cenário: Reset de senha com senha curta`, `Cenário: Reset de senha sem token`
    - ATDD: `test/auth.e2e-spec.ts:POST /auth/reset-password > deve retornar 400 para senha curta` / `400 para token faltando`
    - TDD: `password-recovery.service.spec.ts` cobre o caminho do DTO via testes do `ValidationPipe` (não do service).

- **REQ-PR-009**: The system **MUST** apply the `sensitive` rate limit tier (configurable via env, default `5 req/min/IP` for `forgot-password` and `10 req/min/IP` for `reset-password`) to both endpoints, reusing the existing throttler infrastructure (`@Throttle({ sensitive: { limit, ttl: 60000 } })`).
  - Rastreabilidade:
    - Implementação: `auth.controller.ts` com `@Throttle({ sensitive: { limit: FORGOT_PASSWORD_THROTTLE_LIMIT, ttl: 60000 } })` e `@Throttle({ sensitive: { limit: RESET_PASSWORD_THROTTLE_LIMIT, ttl: 60000 } })`.

- **REQ-PR-010**: The system **MUST** treat e-mail lookup in `forgot-password` as **case-insensitive** (Postgres `mode: 'insensitive'`) and **MUST NOT** match users with `deletedAt != null` or `ativo = false`.
  - Rastreabilidade:
    - TDD: `password-recovery.service.spec.ts:requestReset > deve normalizar e-mail para lowercase antes de buscar` e `> não deve emitir token para usuário soft-deletado`

### Non-Functional Requirements

- **NFR-PR-001 (Security — token randomness)**: The token **MUST** be generated with `crypto.randomBytes(32)` (CSPRNG do Node), nunca `Math.random`. Espaço: 2^256 ≈ 1.16e77 — inviável de adivinhar. **MUST NOT** ser logado em lugar nenhum (apenas dentro do e-mail).
  - Rastreabilidade: `password-recovery.service.ts:requestReset` — uso de `crypto.randomBytes`; testes verificam ausência de token plain em logs (via spy no `Logger`).

- **NFR-PR-002 (Security — constant-time comparison)**: The hash lookup **MUST** rely on Prisma's parameterized `findUnique({ where: { tokenHash } })` (que usa índice `@unique` e comparação exata no Postgres). **MUST NOT** ser implementado como `findMany` + filter em memória.
  - Rastreabilidade: `password-recovery.service.ts:confirmReset` — `prisma.passwordResetToken.findUnique({ where: { tokenHash } })` como única operação de lookup.

- **NFR-PR-003 (Security — anti-enumeration)**: Both `forgot-password` (regardless of e-mail existence) **and** `reset-password` (regardless of token validity) **MUST** respond in approximately the same time (jitter de até 50ms se necessário) e com **o mesmo shape de resposta** para sucesso. Detalhes do motivo do erro (expirado vs usado vs inválido) só aparecem no `reset-password` para o **próprio portador do token** (que já é presumido autorizado a usá-lo), e não no `forgot-password`.
  - Rastreabilidade: `password-recovery.service.ts:requestReset` — fluxo de e-mail inexistente executa `setTimeout` mínimo (~25ms) antes de retornar; testes verificam `expect(response.body).toEqual({ message: ... })` igual.

- **NFR-PR-004 (Security — transport & storage)**: Tokens **MUST** travel only over HTTPS in production. In dev/test, podem ser logados pelo Pino logger (mock), mas isso é responsabilidade de configurar `NODE_ENV !== 'production'` no `LoggerEmailService` (omitir log em prod). Hash SHA256 do token **MUST** ser a única forma persistida — mesma justificativa do `RefreshToken.token` em `auth/design.md`.
  - Rastreabilidade: `logger-email.service.ts:sendPasswordReset` — `if (process.env.NODE_ENV !== 'production') this.logger.log(...)` com `Reset link:`.

- **NFR-PR-005 (Security — cascade revocation)**: Reset **MUST** revogar **todos** os `RefreshToken` ativos do usuário (defesa em profundidade: assume-se que a senha antiga vazou, e qualquer sessão aberta é tratada como comprometida). O cascade **MUST** usar `updateMany` em transação Prisma com a atualização de senha para garantir atomicidade.
  - Rastreabilidade: `password-recovery.service.ts:confirmReset` — `prisma.$transaction([updateUser, updateManyTokens, markUsedAt])` (ordem importa — o `markUsedAt` é o último para que um erro no cascade não "consuma" o token).

- **NFR-PR-006 (Observability)**: O `LoggerEmailService` (mock) **SHOULD** logar uma linha estruturada `{ event: 'password_reset.requested', userId, expiresAt, requestId }` em `info`. Erros de fluxo (token expirado, token já usado, cascade) **SHOULD** ser logados em `warn` com o **hash** do token (não o plain) para permitir investigação sem vazar credencial.
  - Rastreabilidade: `password-recovery.service.ts` — uso de `Logger` (Pino) injetado via `Logger` do NestJS (`@nestjs/common`); `emailService.sendPasswordReset` é chamado mesmo se logger é mock.

- **NFR-PR-007 (Testability)**: A feature **MUST** manter 100% de cobertura dos 4 cenários BDD em `features/autenticacao.feature` (estendidos), com testes e2e em `test/auth.e2e-spec.ts` e testes unitários em `src/auth/application/services/password-recovery.service.spec.ts` (mínimo 5 testes: e-mail válido, e-mail inexistente, token válido, token expirado, token já usado).
  - Rastreabilidade: cobertura atual nos arquivos a serem criados.

- **NFR-PR-008 (API Contract Stability)**: O contrato de `POST /auth/forgot-password` e `POST /auth/reset-password` **SHOULD** ser considerado estável. Mudanças incompatíveis (remoção de campo, mudança no shape de erro) **MUST** ser feitas em nova change request, consistente com `NFR-AUTH-008`.
  - Rastreabilidade: `src/auth/README.md` documenta o contrato; este design é a fonte canônica.

## Acceptance Criteria

- [ ] AC-PR-01: `POST /auth/forgot-password` com e-mail de usuário **cadastrado e ativo** retorna HTTP 200 com corpo `{ message: "Se o e-mail existir, enviaremos um link de redefinição." }`, cria um `PasswordResetToken` com `tokenHash` (SHA256 de 64 hex chars), `expiresAt = now + 60min`, `usedAt = null`, e invoca `emailService.sendPasswordReset(to, link, 60)`.
- [ ] AC-PR-02: `POST /auth/forgot-password` com e-mail **inexistente** ou de usuário **soft-deletado/inativo** retorna HTTP 200 com **o mesmo corpo** de AC-PR-01 (sem user enumeration) e **NÃO** cria token nem chama `emailService`.
- [ ] AC-PR-03: `POST /auth/forgot-password` com e-mail em formato inválido retorna HTTP 400 com mensagem `E-mail inválido`.
- [ ] AC-PR-04: `POST /auth/reset-password` com `token` válido (existe, não expirado, `usedAt = null`) e `nova_senha` ≥ 8 chars retorna HTTP 200 com `{ message: "Senha redefinida com sucesso." }`, atualiza `Usuario.senha` para o hash bcrypt/argon2, marca `PasswordResetToken.usedAt = now()`, e revoga **todos** os `RefreshToken` ativos do usuário.
- [ ] AC-PR-05: `POST /auth/reset-password` com `token` cujo `expiresAt < now` retorna HTTP 400 com mensagem `Token expirado.` (e **NÃO** revoga nada).
- [ ] AC-PR-06: `POST /auth/reset-password` com `token` já marcado com `usedAt != null` retorna HTTP 400 com mensagem `Token já utilizado.` (e **NÃO** revoga nada — idempotente em falha).
- [ ] AC-PR-07: `POST /auth/reset-password` com `token` desconhecido (hash não consta no DB) retorna HTTP 400 com mensagem `Token inválido.`.
- [ ] AC-PR-08: `POST /auth/reset-password` com `nova_senha` < 8 chars ou ausente retorna HTTP 400 (validação de DTO).
- [ ] AC-PR-09: Solicitar 2 resets consecutivos para o mesmo e-mail **invalida** o primeiro token (`usedAt` setado em ambos, ou o primeiro é marcado como `usedAt` antes do segundo ser criado).
- [ ] AC-PR-10: O token plain **NUNCA** aparece no DB (apenas `tokenHash`); a única forma de obtê-lo é via `emailService` (no mock: log Pino em dev/test).
- [ ] AC-PR-11: `POST /auth/forgot-password` está limitado a 5 req/min/IP (overridable por env em `.env.test`); `POST /auth/reset-password` a 10 req/min/IP — ambos com tier `sensitive`.

## API Specification

### Endpoint 1: `POST /auth/forgot-password`

**Decorators**: `@Public()`, `@Throttle({ sensitive: { limit: FORGOT_PASSWORD_THROTTLE_LIMIT, ttl: 60000 } })` (default 5/min).

**Request**:

```json
{
  "email": "usuario@empresa.com"
}
```

**Response 200** (sempre, inclusive se o e-mail não existir):

```json
{
  "message": "Se o e-mail existir, enviaremos um link de redefinição."
}
```

**Error Responses**:

- `400 Bad Request` — `email` ausente ou em formato inválido (`E-mail inválido`).
- `429 Too Many Requests` — rate limit `sensitive` excedido.

**Side-effects (somente se e-mail existir e usuário estiver ativo)**:

1. `PasswordResetToken` criado com `tokenHash = sha256(token)`, `expiresAt = now + 60min`, `usedAt = null`.
2. Tokens pendentes do mesmo usuário marcados como `usedAt = now()` (cascade — REQ-PR-005).
3. `emailService.sendPasswordReset(to, resetLink, 60)` chamado.
4. Log estruturado Pino `{ event: 'password_reset.requested', userId, expiresAt, requestId }` em `info`.

### Endpoint 2: `POST /auth/reset-password`

**Decorators**: `@Public()`, `@Throttle({ sensitive: { limit: RESET_PASSWORD_THROTTLE_LIMIT, ttl: 60000 } })` (default 10/min).

**Request**:

```json
{
  "token": "a]1f0e...64-hex-chars...c4d5",
  "nova_senha": "NovaSenhaForte123!"
}
```

**Response 200** (em sucesso):

```json
{
  "message": "Senha redefinida com sucesso."
}
```

**Error Responses**:

- `400 Bad Request` — `Token expirado.` / `Token já utilizado.` / `Token inválido.` / validação de DTO (senha curta, token faltando, etc).
- `429 Too Many Requests` — rate limit excedido.

**Side-effects (somente em sucesso)**:

1. `prisma.$transaction([...])`:
   - `prisma.usuario.update({ where: { id: userId }, data: { senha: hash } })`
   - `prisma.refreshToken.updateMany({ where: { userId, revokedAt: null, expiresAt: { gt: now } }, data: { revokedAt: now } })`
   - `prisma.passwordResetToken.update({ where: { id: tokenId }, data: { usedAt: now } })`
2. Log estruturado Pino `{ event: 'password_reset.confirmed', userId, tokenId }` em `info`.

## Data Models

### Entity: `PasswordResetToken` (Prisma — nova)

| Field      | Type      | Required | Description                                                  |
| ---------- | --------- | -------- | ------------------------------------------------------------ |
| id         | String    | Yes      | PK UUID (`@default(uuid())`)                                 |
| userId     | Int       | Yes      | FK → `Usuario.id` (cascade on delete — mas soft-delete aqui) |
| user       | Usuario   | Yes      | Relação reversa                                              |
| tokenHash  | String    | Yes      | Único — SHA256 hex (64 chars) do token plain                 |
| expiresAt  | DateTime  | Yes      | Data de expiração (`now + PASSWORD_RESET_EXPIRES_MINUTES`)   |
| usedAt     | DateTime? | No       | Marca de uso único (idempotente)                             |
| createdAt  | DateTime  | Yes      | Default `now()`                                              |

Índices: `@@index([userId])`, `@@index([expiresAt])` (limpeza periódica opcional).

Relação em `Usuario`:

```prisma
passwordResetTokens PasswordResetToken[]
```

### Interface: `EmailService` (Port — novo)

```typescript
// src/auth/domain/services/email.service.ts
export abstract class EmailService {
  abstract sendPasswordReset(
    to: string,
    resetLink: string,
    expiresInMinutes: number,
  ): Promise<void>;
}
```

### Implementação mock: `LoggerEmailService` (Adapter — novo)

```typescript
// src/auth/infrastructure/services/logger-email.service.ts
@Injectable()
export class LoggerEmailService extends EmailService {
  private readonly logger = new Logger(LoggerEmailService.name);

  async sendPasswordReset(to, resetLink, expiresInMinutes): Promise<void> {
    // Em produção, isso chamaria SMTP/SES/SendGrid.
    // Em dev/test, apenas loga via Pino.
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(
        `Reset link: ${resetLink} (expira em ${expiresInMinutes}min, to=${to})`,
      );
    }
  }
}
```

## Edge Cases

| # | Caso | Tratamento |
|---|------|------------|
| 1 | E-mail **não cadastrado** em `forgot-password` | Resposta 200 com **mesmo corpo** do caso sucesso; nenhum `PasswordResetToken` criado; `emailService` **não** chamado. Anti-enumeração (REQ-PR-001, NFR-PR-003). |
| 2 | E-mail de usuário **soft-deletado** (`deletedAt != null`) | Tratado como "e-mail inexistente" (mesmo response, mesmo side-effects nulos). |
| 3 | E-mail de usuário **inativo** (`ativo = false`) | Tratado como "e-mail inexistente" (mesma justificativa — não revela estado da conta). |
| 4 | **Token expirado** (`expiresAt < now`) | HTTP 400 `Token expirado.`; nenhuma mutação (senha, refresh tokens, usedAt ficam intactos). |
| 5 | **Token já usado** (`usedAt != null`) | HTTP 400 `Token já utilizado.`; nenhuma mutação. Idempotente — re-apresentar o mesmo token falha sempre. |
| 6 | **Token desconhecido** (hash não está no DB) | HTTP 400 `Token inválido.`; nenhuma mutação. |
| 7 | **Múltiplos tokens válidos** (usuário solicitou 3 resets em sequência) | O segundo request **marca `usedAt` no primeiro** (cascade em `requestReset`) antes de criar o terceiro. Apenas o **último** token gerado está usável. |
| 8 | **Reset com sucesso seguido de novo reset usando o mesmo token** | A 2ª chamada encontra `usedAt != null` → HTTP 400 `Token já utilizado.` (idempotente em falha). |
| 9 | **Reset com sucesso seguido de novo reset com token NOVO** | OK — gera novo token (e marca o anterior como `usedAt` na criação). Senha do usuário muda novamente, refresh tokens são revogados novamente. |
| 10 | **Senha plain idêntica à anterior** (usuário "reseta" para a mesma senha) | Permitido — a feature não checa reutilização de senha. Trade-off consciente: evita vazamento de informação ("você usava essa senha antes") e simplifica onboarding. Decisão documentada. |
| 11 | **E-mail com caixa diferente** (`User@x` vs `user@x`) | Normalização para `lowercase` antes do lookup (`Usuario.email` é `String @unique` mas collation do Postgres é case-sensitive por padrão; usar `mode: 'insensitive'` ou `LOWER(email)`). |
| 12 | **`APP_RESET_PASSWORD_URL` mal configurado** (env ausente) | `ConfigService.getOrThrow` lança no boot — aplicação não sobe. Falha rápido. |
| 13 | **`PASSWORD_RESET_EXPIRES_MINUTES` configurado como `0` ou negativo** | Joi validation rejeita (`.min(1)`) — aplicação não sobe. |
| 14 | **Race condition**: 2 resets simultâneos com tokens diferentes para o mesmo usuário | O `prisma.$transaction` no `confirmReset` garante atomicidade do cascade. O `last-write-wins` no `Usuario.senha` é aceitável — ambos os resets partem da mesma senha e geram hash do mesmo input válido. |
| 15 | **Cadeia inteira de refresh tokens é revogada mas o usuário está logado** | Próxima chamada a endpoint protegido falha com 401 (`AuthGuard` rejeita JWT expirado... ou não, JWT pode ainda ser válido até `exp`). O `access_token` (JWT) só expira em `JWT_ACCESS_EXPIRES_IN` (default `15m`) — usuário pode continuar usando o access token em uma janela de até 15min após o reset. **Trade-off consciente**: o custo de uma **revogação de JWT em tempo real** (blacklist) supera o benefício, dado o TTL curto. **Decisão**: 15min de janela de risco residual. Documentar. |
| 16 | **Throttler em testes E2E** | `THROTTLER_SENSITIVE_LIMIT=10000` em `.env.test` desativa o limite (já existente). Não criar env nova. |

## Migration Plan

### Migration 1: `add_password_reset_tokens`

```sql
-- prisma/migrations/<timestamp>_add_password_reset_tokens/migration.sql
CREATE TABLE "password_reset_tokens" (
  "id"        TEXT NOT NULL,
  "userId"    INTEGER NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- Unique no tokenHash garante lookup O(log n) e impede colisão.
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");
CREATE INDEX "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");

ALTER TABLE "password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "usuarios"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
```

### Mudanças no `prisma/schema.prisma`

```prisma
model Usuario {
  // ... campos existentes ...
  passwordResetTokens PasswordResetToken[]
}

model PasswordResetToken {
  id         String    @id @default(uuid())
  userId     Int
  user       Usuario   @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash  String    @unique
  expiresAt  DateTime
  usedAt     DateTime?
  createdAt  DateTime  @default(now())

  @@index([userId])
  @@index([expiresAt])
}
```

### Configuração (envs adicionadas em `src/config/env.validation.ts`)

```typescript
APP_RESET_PASSWORD_URL: Joi.string()
  .uri()
  .default('https://app.example.com/reset-password'),
PASSWORD_RESET_EXPIRES_MINUTES: Joi.number().default(60).min(1),
THROTTLER_SENSITIVE_LIMIT_FORGOT: Joi.number().default(5), // já existia o sensitive genérico
THROTTLER_SENSITIVE_LIMIT_RESET: Joi.number().default(10),
```

## Acceptance Tests (ATDD)

Localização: `test/auth.e2e-spec.ts` (estender o existente, ou criar `test/auth.password-recovery.e2e-spec.ts` — preferência: **estender** `test/auth.e2e-spec.ts` com `describe('POST /auth/forgot-password', ...)` e `describe('POST /auth/reset-password', ...)` para coesão).

```typescript
describe('AuthController (e2e) - Password Recovery', () => {
  describe('POST /auth/forgot-password', () => {
    // BDD: features/autenticacao.feature:Cenário: Esqueci minha senha com e-mail válido
    it('deve retornar 200 e criar PasswordResetToken para e-mail cadastrado', ...);
    // BDD: Cenário: Esqueci minha senha com e-mail inexistente retorna 200
    it('deve retornar 200 (sem user enumeration) para e-mail inexistente', ...);
    // BDD: Cenário: Forgot com e-mail inválido
    it('deve retornar 400 para e-mail em formato inválido', ...);
  });

  describe('POST /auth/reset-password', () => {
    // BDD: Cenário: Reset com token válido
    it('deve redefinir a senha, marcar usedAt e revogar refresh tokens', ...);
    // BDD: Cenário: Token de reset expirado
    it('deve retornar 400 "Token expirado." para token com expiresAt no passado', ...);
    // BDD: Cenário: Token de reset já utilizado
    it('deve retornar 400 "Token já utilizado." para token com usedAt setado', ...);
    // BDD: Cenário: Reset com senha curta
    it('deve retornar 400 para nova_senha < 8 chars', ...);
  });
});
```

## Unit Tests (TDD)

Localização: `src/auth/application/services/password-recovery.service.spec.ts` (novo).

- `requestReset`:
  - deve ser definido
  - deve criar `PasswordResetToken` com `tokenHash = sha256(token)` e `expiresAt` futuro quando e-mail existe e usuário ativo
  - deve chamar `emailService.sendPasswordReset` com link contendo token plain
  - deve **NÃO** criar token nem chamar `emailService` quando e-mail não existe (anti-enumeração)
  - deve **NÃO** criar token quando usuário está soft-deletado
  - deve marcar `usedAt = now()` em tokens pendentes do mesmo usuário antes de inserir novo
- `confirmReset`:
  - deve aplicar `passwordHasher.hash`, marcar `usedAt` e revogar refresh tokens em sucesso
  - deve lançar `BadRequestException('Token expirado.')` se `expiresAt < now`
  - deve lançar `BadRequestException('Token já utilizado.')` se `usedAt != null`
  - deve lançar `BadRequestException('Token inválido.')` se tokenHash não encontrado

## Technical Notes

- **Reuso de `PasswordHasher`**: injetado via `PasswordHasher` (interface em `src/shared/domain/services/password-hasher.service.ts`) — não criar nova abstração.
- **Token hash via `crypto`**: `crypto.createHash('sha256').update(token).digest('hex')` — não usar bcrypt/argon2 (overhead desnecessário para o hash do token; a senha em si já passa por bcrypt/argon2 via `PasswordHasher`).
- **`EmailService` é uma porta (DIP)**: o service de aplicação depende da abstração; o `AuthModule` faz o binding `LoggerEmailService` → `EmailService` no `providers`. Em prod, troca-se por `SmtpEmailService` sem tocar o service.
- **Cascade revocation atomic**: usar `prisma.$transaction([...])` no `confirmReset` para garantir que a senha, os refresh tokens e o `usedAt` mudem em uma única operação. Falha no cascade = nenhuma mutação.
- **Trade-off da janela de JWT**: o `access_token` (JWT) sobrevive ao reset por até `JWT_ACCESS_EXPIRES_IN` (15min). Decisão consciente: blacklist de JWT não compensa o custo operacional dado o TTL curto. Documentado em Edge Case #15.
- **Performance**: `forgot-password` é 1 lookup (`findByEmail`) + 1 `updateMany` (cascade) + 1 `create` + 1 `emailService.sendPasswordReset` (no-op em mock). < 100ms p95 em dev. `reset-password` é 1 `findUnique` (tokenHash) + 1 `update` (senha) + 1 `updateMany` (refresh tokens) + 1 `update` (usedAt) = 4 round-trips wrapped em `$transaction`. < 200ms p95.
- **Configuração via env**: `APP_RESET_PASSWORD_URL` é o único env novo obrigatório. `PASSWORD_RESET_EXPIRES_MINUTES` tem default 60 (1h).
- **Reuso do rate limit tier `sensitive`**: já configurado globalmente (`THROTTLER_SENSITIVE_*`). O controller apenas declara `@Throttle({ sensitive: { limit, ttl: 60000 } })`.

## BDD Scenarios Associated

Novos cenários a serem adicionados em `features/autenticacao.feature` (estender a `Funcionalidade: Autenticação de Usuário` ou criar `Funcionalidade: Recuperação de Senha` — preferência: nova `Funcionalidade:` para isolamento):

```gherkin
Funcionalidade: Recuperação de Senha

Eu como usuário do sistema
Quero recuperar minha senha esquecida
Para que eu possa voltar a acessar minha conta

Cenário: Esqueci minha senha com e-mail válido
  Dado que o usuário está cadastrado com e-mail "usuario@empresa.com" e senha "Password123!"
  Quando eu enviar uma requisição POST para "/auth/forgot-password" com:
    | email | usuario@empresa.com |
  Então o status da resposta deve ser 200
  E o corpo da resposta deve conter "Se o e-mail existir"
  E um PasswordResetToken deve ter sido criado com tokenHash e expiresAt futuro

Cenário: Esqueci minha senha com e-mail inexistente retorna 200
  Quando eu enviar uma requisição POST para "/auth/forgot-password" com:
    | email | naoexiste@empresa.com |
  Então o status da resposta deve ser 200
  E o corpo da resposta deve conter "Se o e-mail existir"
  E nenhum PasswordResetToken deve ter sido criado

Cenário: Reset de senha com token válido
  Dado que o usuário solicitou reset de senha e recebeu um token válido
  Quando eu enviar uma requisição POST para "/auth/reset-password" com:
    | token       | <token_recebido>              |
    | nova_senha  | NovaSenhaForte123!            |
  Então o status da resposta deve ser 200
  E o corpo da resposta deve conter "Senha redefinida com sucesso"
  E o token deve estar marcado como usado (usedAt)
  E todos os refresh tokens ativos do usuário devem estar revogados

Cenário: Token de reset expirado
  Dado que o usuário solicitou reset de senha há mais de 1 hora
  Quando eu enviar uma requisição POST para "/auth/reset-password" com o token expirado
  Então o status da resposta deve ser 400
  E o corpo da resposta deve conter "Token expirado"

Cenário: Token de reset já utilizado
  Dado que o usuário já utilizou o token de reset recebido
  Quando eu enviar uma requisição POST para "/auth/reset-password" com o mesmo token
  Então o status da resposta deve ser 400
  E o corpo da resposta deve conter "Token já utilizado"
```

**Total: 5 cenários BDD** (sendo 4 obrigatórios por escopo + 1 bônus "reset com senha curta" coberto via AC, não BDD explícito).

## Status

- [x] Draft
- [ ] In Review
- [ ] Approved
- [ ] Implemented
