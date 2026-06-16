# Feature: Autenticação (auth) — Tasks

> **Status**: todas as tasks abaixo já estão concluídas. Esta é uma documentação retroativa (CR retroativo) — o trabalho foi feito e este registro o formaliza.

## Implementation Tasks

### Phase 1: Preparation

- [x] Criar diretório `.openspec/changes/auth/`
- [x] Escrever `proposal.md` (decisão de design, impacto, riscos)
- [x] Escrever `design.md` (requisitos RFC 2119, AC, API, modelos, edge cases)
- [x] Revisar e aprovar a proposal

### Phase 2: Domain Discovery (BDD)

- [x] Escrever `features/autenticacao.feature` cobrindo login e refresh (9 cenários)
- [x] Mapear cenários BDD para acceptance criteria (AC-AUTH-01..13)

### Phase 3: Test Development (ATDD + TDD)

- [x] Escrever testes de aceitação em `test/auth.e2e-spec.ts` (6 testes cobrindo os 9 cenários BDD)
  - `POST /auth/login` — credenciais válidas (BDD: Login com credenciais válidas)
  - `POST /auth/login` — 401 para credenciais inválidas (BDD: senha incorreta)
  - `POST /auth/login` — 401 para usuário inexistente (BDD: e-mail não cadastrado)
  - `POST /auth/login` — 400 para email inválido (BDD: e-mail inválido)
  - `POST /auth/login` — 400 para senha curta (BDD: senha curta)
  - `POST /auth/login` — 400 se faltar email/senha (BDD: Login sem credenciais, 2 cenários)
- [x] Verificar que os testes e2e passaram (Green Phase)
- [x] Escrever testes unitários em `src/auth/application/services/auth.service.spec.ts` (5 testes)
  - `login` — happy path com asserções em `loginHistory.create`, `refreshToken.create`, `jwtService.sign`
  - `login` — `UnauthorizedException` se usuário não existir
  - `login` — `UnauthorizedException` se senha for inválida
  - `refreshTokens` — rotação com sucesso
  - `refreshTokens` — `ForbiddenException` e revogação em cascata ao detectar reuso

### Phase 4: Data Model

- [x] Adicionar `model RefreshToken` em `prisma/schema.prisma` (token, userId, expiresAt, revokedAt, índices)
- [x] Adicionar `model LoginHistory` em `prisma/schema.prisma` (userId, ip, userAgent, índices)
- [x] Adicionar relações em `model Usuario` (`refreshTokens`, `loginHistory`)
- [x] Criar/aplicar migration Prisma

### Phase 5: DTOs

- [x] Criar `src/auth/dto/login-usuario.dto.ts` (`LoginUsuarioDto`)
  - Validações: `@IsNotEmpty` + `@IsEmail` em `email`; `@IsNotEmpty` + `@IsString` + `@MinLength(8)` em `senha`
  - Mensagens localizadas em PT-BR
- [x] Criar `src/auth/dto/refresh-token.dto.ts` (`RefreshTokenDto`)
  - Validação: `@IsNotEmpty` + `@IsString` em `refresh_token`

### Phase 6: Infrastructure (Strategy)

- [x] Criar `src/auth/infrastructure/strategies/jwt.strategy.ts` (`JwtStrategy`)
  - Extração via `Authorization: Bearer ...`
  - `ignoreExpiration: false`, `algorithms: ['HS256']`, `secretOrKey` de `ConfigService`
  - `validate()` reduz payload para `{ userId, email, empresas: [{ id, perfis: [{ codigo, permissoes: [{ codigo }] }] }] }`

### Phase 7: Application (Decorators, Guards, Service, Controller)

- [x] Criar `src/auth/application/decorators/public.decorator.ts` (`@Public()` + `IS_PUBLIC_KEY`)
- [x] Criar `src/auth/application/guards/auth.guard.ts` (`AuthGuard`)
  - Estende `PassportAuthGuard('jwt')`
  - Lê `IS_PUBLIC_KEY` via `Reflector` e libera rotas `@Public()`
  - Anexa `request.usuarioLogado = request.user` em sucesso
- [x] Criar `src/auth/application/services/auth.service.ts` (`AuthService`)
  - `login(email, senha, ip?, userAgent?)`:
    - `findByEmailWithPerfisAndPermissoes`
    - Valida hash via `PasswordHasher`
    - Grava `LoginHistory`
    - Chama `generateTokens`
  - `generateTokens(userId, email, empresas)`:
    - Mapeia empresas → perfis → permissões para o payload
    - Assina JWT com `HS256`, `JWT_SECRET`, `JWT_ACCESS_EXPIRES_IN`
    - Cria `RefreshToken` (UUID v4, `expiresAt = now + JWT_REFRESH_EXPIRES_DAYS`)
  - `refreshTokens(refreshToken)`:
    - `findUnique` com `include: { user, user.empresas.perfis.permissoes }`
    - Não encontrado → 401 `Refresh token inválido.`
    - `revokedAt` setado → `updateMany` revoga toda a cadeia + 403 `Atividade suspeita...`
    - Expirado → 401 `Refresh token expirado.`
    - Caso contrário: revoga o token atual e chama `generateTokens` (rotação)
- [x] Criar `src/auth/application/controllers/auth.controller.ts` (`AuthController`)
  - `POST /auth/login` — `@Public()`, `@Throttle({ sensitive: { limit: 5, ttl: 60000 } })`, Swagger `@ApiOperation/@ApiResponse`
  - `POST /auth/refresh` — `@Public()`, `@Throttle({ sensitive: { limit: 10, ttl: 60000 } })`, Swagger com 201/401/403
  - Limites lidos de `THROTTLER_SENSITIVE_LIMIT` / `THROTTLER_SENSITIVE_LIMIT_REFRESH` no boot (default 5/10; 10000 em `.env.test`)

### Phase 8: Module Wiring

- [x] Declarar `AuthModule` importando `JwtModule.registerAsync(...)`, providers (`AuthService`, `JwtStrategy`, `PasswordHasher`), controllers (`AuthController`)
- [x] Registrar `AuthGuard` como guard global da aplicação (`APP_GUARD`)
- [x] Importar `AuthModule` em `AppModule`

### Phase 9: Configuration

- [x] Adicionar envs em `.env.example` e schema Joi: `JWT_SECRET`, `JWT_ACCESS_EXPIRES_IN` (default `15m`), `JWT_REFRESH_EXPIRES_DAYS` (default `7`), `THROTTLER_SENSITIVE_LIMIT` (default `5`), `THROTTLER_SENSITIVE_LIMIT_REFRESH` (default `10`)
- [x] Sobrescrever limites em `.env.test` (`10000`) para não disparar 429 nos e2e

### Phase 10: Verification

- [x] Rodar testes de aceitação — passam (Green Phase)
- [x] Rodar testes unitários — passam
- [x] `npm run validate:quick` (lint + typecheck + testes) — passa
- [x] `npm run security:check` — passa

### Phase 11: Documentation

- [x] Criar `src/auth/README.md` documentando endpoints, payloads, códigos, rate limit, mecanismos de proteção (`AuthGuard`, `@Public()`, `@TemPermissao`)
- [x] Atualizar `AGENTS.md` raiz com referência ao módulo `auth` (catalog de módulos + guards globais)
- [x] Criar este CR retroativo (`.openspec/changes/auth/{proposal,design,tasks}.md`)

### Phase 12: Deployment / Archive

- [x] Merge dos commits (changelog presente no histórico git)
- [x] Arquivar specs em `.openspec/specs/auth.md` *(pendente de promoção ao fechar o ciclo de OpenSpec; o artefato canônico atual é este CR em `changes/`)*

## Task Dependencies (as executed)

```
features/autenticacao.feature (BDD)
        ↓
prisma/schema.prisma (RefreshToken + LoginHistory + migration)
        ↓
src/auth/dto/{login-usuario,refresh-token}.dto.ts
        ↓
src/auth/infrastructure/strategies/jwt.strategy.ts
src/auth/application/decorators/public.decorator.ts
        ↓
src/auth/application/services/auth.service.ts
        ↓
src/auth/application/guards/auth.guard.ts
src/auth/application/controllers/auth.controller.ts
        ↓
src/auth/auth.module.ts (wiring) + AppModule (global guard)
        ↓
test/auth.e2e-spec.ts + auth.service.spec.ts (TDD retroativo, todos verdes)
        ↓
src/auth/README.md + AGENTS.md + .openspec/changes/auth/{proposal,design,tasks}.md
```

## File-by-File Traceability

| Arquivo | Propósito | Requisitos cobertos |
|---------|-----------|----------------------|
| `features/autenticacao.feature` | 9 cenários BDD (login, refresh, validações) | REQ-AUTH-001..009 |
| `prisma/schema.prisma` | `RefreshToken`, `LoginHistory`, relações em `Usuario` | REQ-AUTH-005, REQ-AUTH-006 |
| `src/auth/dto/login-usuario.dto.ts` | DTO + validações (e-mail, senha ≥ 8) | REQ-AUTH-004 |
| `src/auth/dto/refresh-token.dto.ts` | DTO + validação `refresh_token` | REQ-AUTH-007, REQ-AUTH-008 |
| `src/auth/infrastructure/strategies/jwt.strategy.ts` | Estratégia JWT (`HS256`, claims) | REQ-AUTH-010, NFR-AUTH-002, NFR-AUTH-003 |
| `src/auth/application/decorators/public.decorator.ts` | Opt-out do guard global | REQ-AUTH-011 |
| `src/auth/application/guards/auth.guard.ts` | Guard global (Passport JWT) | REQ-AUTH-011, NFR-AUTH-007 |
| `src/auth/application/services/auth.service.ts` | `login`, `refreshTokens`, `generateTokens` | REQ-AUTH-001..010, NFR-AUTH-001, NFR-AUTH-004 |
| `src/auth/application/services/auth.service.spec.ts` | 5 testes unitários (TDD) | Cobre os caminhos críticos do service |
| `src/auth/application/controllers/auth.controller.ts` | Endpoints + rate limit | REQ-AUTH-001, REQ-AUTH-007, REQ-AUTH-012 |
| `test/auth.e2e-spec.ts` | 6 testes e2e (ATDD) | Cobre os 9 cenários BDD |
| `src/auth/README.md` | Documentação da feature | Todas as NFRs de API |
| `.openspec/changes/auth/proposal.md` | Proposta + impacto + riscos | — |
| `.openspec/changes/auth/design.md` | Spec RFC 2119 + AC + edge cases | Todas as REQ/NFR |
| `.openspec/changes/auth/tasks.md` | Este arquivo | — |

## Notes

- Cada task foi commit-ada com conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`).
- A spec é retroativa: o código veio primeiro, a documentação OpenSpec vem depois — o oposto do fluxo `DDD→BDD→SDD→ATDD→TDD` em modo prospectivo.
- O guard `PermissaoGuard` e o decorator `@TemPermissao(...)` foram declarados em `auth` no `AGENTS.md`, mas a implementação material vive em `src/shared/application/guards/` e `src/shared/application/decorators/`; a feature `auth` os **sustenta** (fornece o payload JWT necessário) sem redefini-los.
- Mudanças futuras no contrato `/auth/*` (ex.: adicionar `mfa_required`, `passwordless`, scopes OAuth) **MUST** ser feitas em uma nova change request, conforme `NFR-AUTH-008`.
