# Feature: Recuperação de Senha (password-recovery) — Tasks

> **Status**: tasks **pendentes** (change prospectivo). Esta é a lista de execução que guia a implementação na fase de Build Mode, após aprovação do `proposal.md` e `design.md`. Marcar `[x]` apenas após o teste/verificação rodar verde.

## Implementation Tasks

### Phase 1: Preparation (OpenSpec)

- [ ] Criar diretório `.openspec/changes/password-recovery/`
- [ ] Escrever `proposal.md` (Why, What Changes, Impact, Risks, Alternatives)
- [ ] Escrever `design.md` (RFC 2119: 10 FR + 8 NFR; 11 AC; API spec; Data Models; 16 Edge Cases; Migration Plan)
- [ ] **Revisar e aprovar** `proposal.md` + `design.md` antes de prosseguir

### Phase 2: Domain Discovery (BDD)

- [ ] Estender `features/autenticacao.feature` (ou criar `features/password-recovery.feature`) com a `Funcionalidade: Recuperação de Senha` e os **5 cenários BDD**:
  - `Cenário: Esqueci minha senha com e-mail válido` (AC-PR-01)
  - `Cenário: Esqueci minha senha com e-mail inexistente retorna 200` (AC-PR-02)
  - `Cenário: Reset de senha com token válido` (AC-PR-04)
  - `Cenário: Token de reset expirado` (AC-PR-05)
  - `Cenário: Token de reset já utilizado` (AC-PR-06)
- [ ] Mapear cenários BDD → Acceptance Criteria (AC-PR-01..11) — referência cruzada em `design.md`

### Phase 3: Test Development (ATDD — Red Phase)

- [ ] Escrever **testes e2e** em `test/auth.e2e-spec.ts` (estender):
  - `describe('POST /auth/forgot-password')`:
    - deve retornar 200 e criar `PasswordResetToken` para e-mail cadastrado (AC-PR-01)
    - deve retornar 200 (sem user enumeration) para e-mail inexistente (AC-PR-02)
    - deve retornar 400 para e-mail em formato inválido (AC-PR-03)
  - `describe('POST /auth/reset-password')`:
    - deve redefinir a senha, marcar `usedAt` e revogar refresh tokens (AC-PR-04)
    - deve retornar 400 "Token expirado." para token com `expiresAt` no passado (AC-PR-05)
    - deve retornar 400 "Token já utilizado." para token com `usedAt` setado (AC-PR-06)
    - deve retornar 400 "Token inválido." para token desconhecido (AC-PR-07)
    - deve retornar 400 para `nova_senha` < 8 chars (AC-PR-08)
- [ ] **Verificar que os testes e2e FALHAM** (Red Phase) — endpoints ainda não implementados
- [ ] Revisar aceitação dos testes com o time

### Phase 4: Data Model (Prisma)

- [ ] Adicionar `model PasswordResetToken` em `prisma/schema.prisma` (`id`, `userId`, `tokenHash @unique`, `expiresAt`, `usedAt?`, `createdAt`, índices `userId` e `expiresAt`)
- [ ] Adicionar relação reversa `passwordResetTokens PasswordResetToken[]` em `model Usuario`
- [ ] Gerar migration Prisma: `npx prisma migrate dev --name add_password_reset_tokens`
- [ ] Aplicar migration em dev e validar com `npx prisma migrate status`

### Phase 5: DTOs

- [ ] Criar `src/auth/dto/forgot-password.dto.ts`:
  - Campo `email` com `@IsNotEmpty({ message: 'O e-mail não pode ser vazio' })` + `@IsEmail({}, { message: 'E-mail inválido' })`
  - JSDoc + `@ApiProperty` (Swagger)
- [ ] Criar `src/auth/dto/reset-password.dto.ts`:
  - Campo `token` com `@IsString()` + `@IsNotEmpty()` + `@Length(64, 128)`
  - Campo `nova_senha` com `@IsString()` + `@IsNotEmpty()` + `@MinLength(8, { message: 'A senha deve ter no mínimo 8 caracteres' })`
  - JSDoc + `@ApiProperty` (Swagger)
- [ ] Criar `src/auth/dto/forgot-password.dto.spec.ts` (teste unitário do DTO via `validate()`)
- [ ] Criar `src/auth/dto/reset-password.dto.spec.ts` (teste unitário do DTO via `validate()`)

### Phase 6: Domain Port (EmailService)

- [ ] Criar `src/auth/domain/services/email.service.ts`:
  - Classe abstrata `EmailService` com método `sendPasswordReset(to: string, resetLink: string, expiresInMinutes: number): Promise<void>`
  - JSDoc explicando o contrato (link contém token plain, idempotência, sem retry no adapter)
- [ ] Criar `src/auth/infrastructure/services/logger-email.service.ts` (adapter mock):
  - `@Injectable()` extendendo `EmailService`
  - Usa `private readonly logger = new Logger(LoggerEmailService.name)` (Pino via NestJS)
  - Em `sendPasswordReset`: `if (process.env.NODE_ENV !== 'production') this.logger.log(\`Reset link: \${resetLink} (expira em \${expiresInMinutes}min, to=\${to})\`)`
  - Em produção, lança `Error('LoggerEmailService não deve ser usado em produção')` (fail-fast)

### Phase 7: Application — TDD (Red → Green)

- [ ] Criar `src/auth/application/services/password-recovery.service.spec.ts` (TDD, Red Phase):
  - Mockar `PrismaService`, `PasswordHasher`, `ConfigService`, `EmailService`, `UsuarioRepository`, `Logger`
  - Testes:
    - `requestReset` → cria `PasswordResetToken` com `tokenHash` e `expiresAt` futuro
    - `requestReset` → chama `emailService.sendPasswordReset` com link contendo token plain
    - `requestReset` → NÃO cria token nem chama `emailService` para e-mail inexistente
    - `requestReset` → NÃO cria token para usuário soft-deletado
    - `requestReset` → marca `usedAt=now()` em tokens pendentes antes de inserir novo
    - `confirmReset` → aplica hash, marca `usedAt` e revoga refresh tokens em sucesso
    - `confirmReset` → lança `BadRequestException('Token expirado.')` se `expiresAt < now`
    - `confirmReset` → lança `BadRequestException('Token já utilizado.')` se `usedAt != null`
    - `confirmReset` → lança `BadRequestException('Token inválido.')` se tokenHash não encontrado
- [ ] **Rodar** `npm run test -- password-recovery.service.spec.ts` — testes devem FALHAR (Red)
- [ ] Criar `src/auth/application/services/password-recovery.service.ts`:
  - `@Injectable()`, construtor com `prisma`, `passwordHasher`, `configService`, `emailService`, `usuarioRepository`, `logger`
  - Método `requestReset(email: string): Promise<{ message: string }>`:
    - Normaliza `email = email.toLowerCase().trim()`
    - `user = await this.usuarioRepository.findByEmail(email)` (com soft-delete + ativo)
    - Se `!user` → `await sleep(jitter)` (mitigar timing attack) → retornar `{ message: GEN_MESSAGE }`
    - `token = crypto.randomBytes(32).toString('hex')`
    - `tokenHash = crypto.createHash('sha256').update(token).digest('hex')`
    - `expiresAt = now + PASSWORD_RESET_EXPIRES_MINUTES * 60 * 1000`
    - Em transação:
      - `prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } })`
      - `prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } })`
    - `link = \`\${APP_RESET_PASSWORD_URL}?token=\${token}\``
    - `await this.emailService.sendPasswordReset(user.email, link, PASSWORD_RESET_EXPIRES_MINUTES)`
    - `this.logger.log({ event: 'password_reset.requested', userId: user.id, expiresAt })`
    - Retornar `{ message: GEN_MESSAGE }`
  - Método `confirmReset(token: string, novaSenha: string): Promise<{ message: string }>`:
    - `tokenHash = crypto.createHash('sha256').update(token).digest('hex')`
    - `record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } })`
    - Se `!record` → throw `BadRequestException('Token inválido.')`
    - Se `record.usedAt` → throw `BadRequestException('Token já utilizado.')`
    - Se `record.expiresAt < now` → throw `BadRequestException('Token expirado.')`
    - `hash = await this.passwordHasher.hash(novaSenha)`
    - `await prisma.$transaction([...])`:
      - `prisma.usuario.update({ where: { id: record.userId }, data: { senha: hash } })`
      - `prisma.refreshToken.updateMany({ where: { userId: record.userId, revokedAt: null, expiresAt: { gt: now } }, data: { revokedAt: now } })`
      - `prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: now } })`
    - `this.logger.log({ event: 'password_reset.confirmed', userId: record.userId, tokenId: record.id })`
    - Retornar `{ message: 'Senha redefinida com sucesso.' }`
- [ ] **Rodar** `npm run test -- password-recovery.service.spec.ts` — testes devem PASSAR (Green)

### Phase 8: Application — Controller

- [ ] Estender `src/auth/application/controllers/auth.controller.ts`:
  - Injetar `PasswordRecoveryService` no construtor
  - Adicionar constantes no topo do arquivo:
    ```typescript
    const FORGOT_PASSWORD_THROTTLE_LIMIT = parseInt(
      process.env.THROTTLER_SENSITIVE_LIMIT_FORGOT || '5', 10,
    );
    const RESET_PASSWORD_THROTTLE_LIMIT = parseInt(
      process.env.THROTTLER_SENSITIVE_LIMIT_RESET || '10', 10,
    );
    ```
  - Endpoint `POST /auth/forgot-password`:
    - `@Public()`, `@Throttle({ sensitive: { limit: FORGOT_PASSWORD_THROTTLE_LIMIT, ttl: 60000 } })`
    - `@ApiOperation({ summary: 'Solicita um link de redefinição de senha' })`
    - `@ApiResponse({ status: 200, description: '...' })`
    - `@ApiResponse({ status: 400, description: 'E-mail inválido.' })`
    - `@ApiResponse({ status: 429, description: 'Rate limit excedido.' })`
    - Body: `ForgotPasswordDto`
    - Chamada: `return this.passwordRecoveryService.requestReset(dto.email);`
  - Endpoint `POST /auth/reset-password`:
    - `@Public()`, `@Throttle({ sensitive: { limit: RESET_PASSWORD_THROTTLE_LIMIT, ttl: 60000 } })`
    - `@ApiOperation({ summary: 'Redefine a senha usando um token válido' })`
    - `@ApiResponse({ status: 200, description: 'Senha redefinida.' })`
    - `@ApiResponse({ status: 400, description: 'Token inválido/expirado/usado.' })`
    - `@ApiResponse({ status: 429, description: 'Rate limit excedido.' })`
    - Body: `ResetPasswordDto`
    - Chamada: `return this.passwordRecoveryService.confirmReset(dto.token, dto.nova_senha);`

### Phase 9: Module Wiring

- [ ] Atualizar `src/auth/auth.module.ts`:
  - Adicionar `providers: [..., PasswordRecoveryService, LoggerEmailService]`
  - Adicionar binding `{ provide: EmailService, useClass: LoggerEmailService }`
  - (Endpoints ficam no mesmo `AuthController` — não precisa de novo controller)

### Phase 10: Configuration

- [ ] Adicionar envs em `src/config/env.validation.ts` (Joi):
  - `APP_RESET_PASSWORD_URL: Joi.string().uri().default('https://app.example.com/reset-password')`
  - `PASSWORD_RESET_EXPIRES_MINUTES: Joi.number().default(60).min(1)`
  - `THROTTLER_SENSITIVE_LIMIT_FORGOT: Joi.number().default(5)`
  - `THROTTLER_SENSITIVE_LIMIT_RESET: Joi.number().default(10)`
- [ ] Atualizar `.env.example` com as 4 novas envs (comentadas + exemplo)
- [ ] Atualizar `.env.test` (já existente) com `THROTTLER_SENSITIVE_LIMIT_FORGOT=10000` e `THROTTLER_SENSITIVE_LIMIT_RESET=10000` (desativar rate limit em testes)
- [ ] Atualizar `docker-compose.yml` se necessário (apenas se as envs precisarem estar lá)

### Phase 11: Verification (ATDD — Green Phase)

- [ ] **Rodar testes e2e** — devem PASSAR (Green Phase):
  - `npm run test:e2e -- auth.e2e-spec.ts`
- [ ] **Rodar testes unitários** — devem PASSAR:
  - `npm run test -- password-recovery.service.spec.ts`
  - `npm run test -- forgot-password.dto.spec.ts`
  - `npm run test -- reset-password.dto.spec.ts`
- [ ] **Rodar suíte completa** para garantir zero regressão:
  - `npm run test` (unit)
  - `npm run test:e2e` (e2e)
- [ ] `npm run validate:quick` (lint + typecheck + testes) — deve PASSAR
- [ ] `npm run security:check` — deve PASSAR (verifica que o token plain não vaza em logs, etc.)
- [ ] **Smoke test manual** (opcional, mas recomendado):
  - `docker compose up -d`
  - `curl -X POST http://localhost:3001/auth/forgot-password -H 'Content-Type: application/json' -d '{"email":"<seed>"}'`
  - Verificar log Pino: deve aparecer `Reset link: https://app.example.com/reset-password?token=...`
  - Extrair token, `curl -X POST http://localhost:3001/auth/reset-password -H 'Content-Type: application/json' -d '{"token":"<token>","nova_senha":"NovaSenhaForte123!"}'`
  - Verificar 200 + `Senha redefinida com sucesso.`
  - Tentar reusar o mesmo token: deve retornar 400 `Token já utilizado.`

### Phase 12: Documentation

- [ ] Atualizar `src/auth/README.md`:
  - Adicionar seção "### Recuperação de Senha" com `POST /auth/forgot-password` e `POST /auth/reset-password` (URL, payload, respostas, rate limit, observações de segurança)
  - Atualizar índice de endpoints
- [ ] Atualizar `AGENTS.md` (raiz) — referenciar a feature `password-recovery` no catálogo de módulos (se aplicável)
- [ ] Adicionar comentários de rastreabilidade nos arquivos novos:
  - `// BDD: features/autenticacao.feature:Cenário: Esqueci minha senha com e-mail válido`
  - `// SDD: .openspec/changes/password-recovery/design.md:REQ-PR-001`
  - `// ATDD: test/auth.e2e-spec.ts:POST /auth/forgot-password > ...`
  - `// TDD: src/auth/application/services/password-recovery.service.spec.ts:requestReset > ...`
- [ ] Criar `src/auth/README.md` seção "Política de segurança" referenciando: anti-enumeração, TTL 1h, cascade revocation, SHA256 do token no DB

### Phase 13: Deployment / Archive

- [ ] **Code review** do PR (referência: `code-review` skill)
- [ ] **Security review** (referência: `security-review` skill) — confirmar:
  - Token plain não logado em prod
  - SHA256 do token no DB
  - Cascade revocation funciona
  - Anti-enumeração no `forgot-password`
- [ ] Merge do PR com conventional commits:
  - `feat(auth): add password recovery (forgot + reset)`
  - `feat(prisma): add PasswordResetToken model`
  - `test(auth): add BDD + ATDD + TDD for password recovery`
  - `docs(auth): document password recovery endpoints`
- [ ] Mover spec de `.openspec/changes/password-recovery/` para `.openspec/specs/password-recovery.md` (consolidar proposal + design + tasks em um único arquivo canônico, ou manter 3 — verificar convenção do projeto)
- [ ] **Fechar o ciclo OpenSpec**: arquivar a change após merge em `main`

## Task Dependencies

```
proposal.md → design.md → tasks.md
        ↓
features/autenticacao.feature (BDD)
        ↓
prisma/schema.prisma (PasswordResetToken + migration)
        ↓
src/auth/dto/{forgot-password,reset-password}.dto.ts
        ↓
src/auth/domain/services/email.service.ts (port)
src/auth/infrastructure/services/logger-email.service.ts (adapter)
        ↓
test/auth.e2e-spec.ts (estender — ATDD Red)
        ↓
src/auth/application/services/password-recovery.service.spec.ts (TDD Red)
        ↓
src/auth/application/services/password-recovery.service.ts (Green)
        ↓
src/auth/application/controllers/auth.controller.ts (estender)
src/auth/auth.module.ts (wiring + DI binding)
src/config/env.validation.ts (Joi)
.env.example / .env.test
        ↓
[ATDD Green] + [TDD Green] + npm run validate:quick + security:check
        ↓
src/auth/README.md (documentar) + comentários de rastreabilidade
        ↓
PR + code review + security review + merge
        ↓
.openspec/changes/password-recovery/ → .openspec/specs/ (archive)
```

## File-by-File Traceability (planejado)

| Arquivo | Propósito | Requisitos cobertos |
|---------|-----------|---------------------|
| `features/autenticacao.feature` (estendido) | 5 cenários BDD | REQ-PR-001, REQ-PR-006, REQ-PR-007, REQ-PR-008 |
| `prisma/schema.prisma` (estendido) | `PasswordResetToken` + relação em `Usuario` | REQ-PR-003, REQ-PR-005, REQ-PR-010 |
| `prisma/migrations/<ts>_add_password_reset_tokens/` | Migration SQL | (idempotente com o schema) |
| `src/auth/dto/forgot-password.dto.ts` | DTO + validação e-mail | REQ-PR-001, REQ-PR-003 |
| `src/auth/dto/reset-password.dto.ts` | DTO + validação token + nova_senha | REQ-PR-008 |
| `src/auth/domain/services/email.service.ts` | Port (interface abstrata) | REQ-PR-004, NFR-PR-006 |
| `src/auth/infrastructure/services/logger-email.service.ts` | Adapter (Pino mock) | REQ-PR-004, NFR-PR-004 |
| `src/auth/application/services/password-recovery.service.ts` | `requestReset` + `confirmReset` | REQ-PR-001..010, NFR-PR-001..005 |
| `src/auth/application/services/password-recovery.service.spec.ts` | TDD (≥ 9 testes) | Cobre todos os caminhos do service |
| `src/auth/application/controllers/auth.controller.ts` (estendido) | 2 novos endpoints + rate limit | REQ-PR-001, REQ-PR-006, REQ-PR-009 |
| `src/auth/auth.module.ts` (estendido) | Wiring + DI binding | — |
| `src/config/env.validation.ts` (estendido) | Joi envs | — |
| `test/auth.e2e-spec.ts` (estendido) | 8 testes e2e (ATDD) | Cobre os 5 cenários BDD + edge cases |
| `src/auth/README.md` (estendido) | Documentação | NFR-PR-008 |
| `.openspec/changes/password-recovery/proposal.md` | Proposta + impacto + riscos | — |
| `.openspec/changes/password-recovery/design.md` | Spec RFC 2119 + AC + edge cases | Todas as REQ/NFR |
| `.openspec/changes/password-recovery/tasks.md` | Este arquivo | — |

## Notes

- Cada task deve ser **independentemente commitável** com conventional commits.
- **Reuso máximo**: `PasswordHasher` (já existente em `src/shared/domain/services/password-hasher.service.ts`), `AuthGuard` (já global), `@Public()` (já existente), `@Throttle({ tier: 'sensitive' })` (já configurado), `Logger` do NestJS (Pino).
- **NÃO** criar módulo NestJS novo — conviver no `AuthModule` para coesão de domínio. Service de aplicação é `PasswordRecoveryService` mas mora em `auth/application/services/`.
- **Cuidado com o rate limit em testes**: as envs `THROTTLER_SENSITIVE_LIMIT_FORGOT=10000` e `THROTTLER_SENSITIVE_LIMIT_RESET=10000` em `.env.test` são **obrigatórias** desde o primeiro teste e2e, ou o suite vai disparar 429.
- **Hash do token no DB**: usar `crypto.createHash('sha256')`, **nunca** bcrypt/argon2 para o hash do token (overhead desnecessário — a senha em si já passa pelo `PasswordHasher`).
- **Pino logger**: nunca usar `console.log` no service — usar `private readonly logger = new Logger(PasswordRecoveryService.name)` (Pino via NestJS).
- **Anti-enumeração**: tempo de resposta de `forgot-password` deve ser **equivalente** entre e-mail existente e inexistente. Considerar `await sleep(jitter)` antes de retornar no caminho de e-mail inexistente se o lookup for rápido demais.
- **Migrar feature para `.openspec/specs/`** apenas após merge em `main` (não antes — a change está "WIP" até ser aprovada e mergeada).
