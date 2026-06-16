# Feature: Autenticação (auth) — Design Specification

## Overview

A feature `auth` provê autenticação baseada em **e-mail + senha** com emissão de **par de tokens** (JWT curto + refresh opaco e rotacionado). O token carrega o contexto multi-tenant e RBAC do usuário (empresas, perfis e permissões) para que os guards globais e o decorator `@TemPermissao(...)` operem sem lookups adicionais ao banco.

**Casos de uso cobertos:**

- Login de usuário cadastrado.
- Renovação de sessão via refresh token.
- Detecção de reuso de refresh token revogado (defesa contra roubo).
- Bloqueio de credenciais inválidas com mensagem genérica.
- Auditoria básica de logins (IP + User-Agent).

**Não cobertos** (outras changes): password recovery, MFA, OAuth/OIDC, sessões server-side.

## Requirements (RFC 2119)

### Functional Requirements

- **REQ-AUTH-001**: The system **MUST** authenticate users via e-mail + password at `POST /auth/login`.
  - Rastreabilidade:
    - BDD: `features/autenticacao.feature:Cenário: Login com credenciais válidas`
    - ATDD: `test/auth.e2e-spec.ts:POST /auth/login > deve permitir que um usuário faça login com sucesso`
    - TDD: `src/auth/application/services/auth.service.spec.ts:login > deve retornar tokens de acesso e refresh se o login for bem-sucedido`

- **REQ-AUTH-002**: The system **MUST** return a JSON body containing `access_token` and `refresh_token` on successful login, plus `usuario` and `empresas` from the persisted user.
  - Rastreabilidade: BDD: `Cenário: Login com credenciais válidas`; TDD: `auth.service.spec.ts:login > deve retornar tokens...`

- **REQ-AUTH-003**: The system **MUST** reject any login attempt with invalid credentials (unknown e-mail **or** wrong password) with HTTP 401 and a generic message `Credenciais inválidas.` (no user-enumeration leakage).
  - Rastreabilidade:
    - BDD: `Cenário: Login com credenciais inválidas - senha incorreta`, `Cenário: Login com e-mail não cadastrado`
    - ATDD: `test/auth.e2e-spec.ts:POST /auth/login > deve retornar 401 para credenciais inválidas` e `> deve retornar 401 para usuário inexistente`
    - TDD: `auth.service.spec.ts:login > deve lançar UnauthorizedException se o usuário não existir` e `> se a senha for inválida`

- **REQ-AUTH-004**: The system **MUST** validate `LoginUsuarioDto` (e-mail válido + senha com mínimo 8 caracteres, não vazios) and return HTTP 400 with localized error messages on validation failure.
  - Rastreabilidade:
    - BDD: `Cenário: Login com e-mail inválido`, `Cenário: Login com senha curta`, `Cenário: Login sem credenciais`
    - ATDD: `test/auth.e2e-spec.ts:POST /auth/login > deve retornar 400 para email inválido` / `400 para senha muito curta` / `400 se o email estiver faltando` / `400 se a senha estiver faltando`

- **REQ-AUTH-005**: The system **MUST** persist a `LoginHistory` record (`userId`, `ip`, `userAgent`, `createdAt`) on every successful login.
  - Rastreabilidade: TDD: `auth.service.spec.ts:login > ... expect(mockPrismaService.loginHistory.create)...`

- **REQ-AUTH-006**: The system **MUST** issue a new refresh token (UUID v4) and persist it in `RefreshToken` with `userId`, `token`, `expiresAt` on every login and every successful refresh.
  - Rastreabilidade: TDD: `auth.service.spec.ts:login > mockPrismaService.refreshToken.create`; TDD: `refreshTokens > deve renovar tokens com sucesso`

- **REQ-AUTH-007**: The system **MUST** support token rotation at `POST /auth/refresh`: given a valid, non-revoked, non-expired refresh token, the system **SHALL** revoke the presented token and return a new access + refresh pair.
  - Rastreabilidade:
    - BDD: `Cenário: Refresh token válido`
    - TDD: `auth.service.spec.ts:refreshTokens > deve renovar tokens com sucesso`

- **REQ-AUTH-008**: The system **MUST** reject `POST /auth/refresh` with HTTP 401 and message `Refresh token inválido.` if the token is not found, and `Refresh token expirado.` if `expiresAt` is in the past.
  - Rastreabilidade:
    - BDD: `Cenário: Refresh token inválido`, `Cenário: Refresh token expirado`
    - TDD: `auth.service.spec.ts:refreshTokens` (implícita via `findUnique` mock retornando `null`)

- **REQ-AUTH-009**: The system **MUST** detect reuse of a revoked refresh token: when a `revokedAt != null` token is presented, the system **SHALL** revoke **all** refresh tokens of that user and respond HTTP 403 with `Atividade suspeita detectada. Todos os tokens revogados.`
  - Rastreabilidade:
    - BDD: implicit (cenário de ataque); spec: `src/auth/README.md` — "atividade suspeita detectada (token reusado após revogação — invalida toda a cadeia)"
    - TDD: `auth.service.spec.ts:refreshTokens > deve lançar ForbiddenException e revogar tudo se o token já foi usado (detecção de reuso)`

- **REQ-AUTH-010**: The JWT `access_token` **MUST** contain the claims `sub` (user id), `email`, and `empresas` (array of `{ id, perfis: [{ id, nome, codigo, descricao, permissoes: [{ id, nome, codigo, descricao }] }] }`).
  - Rastreabilidade: TDD: `auth.service.spec.ts:login > expect(mockJwtService.sign).toHaveBeenCalled()`; ATDD: `test/auth.e2e-spec.ts:POST /auth/login > ... expect(decoded).toHaveProperty('empresas')`

- **REQ-AUTH-011**: The system **MUST** protect all routes by default via a global `AuthGuard` (Passport JWT), and **SHALL** allow opt-out via the `@Public()` decorator for `POST /auth/login`, `POST /auth/refresh`, and health endpoints.
  - Rastreabilidade: `src/auth/application/guards/auth.guard.ts`, `src/auth/application/decorators/public.decorator.ts`, controller com `@Public()` em ambas as rotas.

- **REQ-AUTH-012**: The system **MUST** apply tier `sensitive` rate limiting: 5 req/min/IP on `POST /auth/login` and 10 req/min/IP on `POST /auth/refresh` (configurable via env, defaults overridable em `.env.test` para 10000).
  - Rastreabilidade: `src/auth/application/controllers/auth.controller.ts` — `LOGIN_THROTTLE_LIMIT` / `REFRESH_THROTTLE_LIMIT` + `@Throttle({ sensitive: { limit, ttl: 60000 } })`.

### Non-Functional Requirements

- **NFR-AUTH-001 (Security)**: Passwords **MUST** be stored only as hashes (delegated to `PasswordHasher` — `bcrypt`/`argon2` family). Plaintext passwords **MUST NOT** be logged or persisted.
  - Rastreabilidade: `src/auth/application/services/auth.service.ts` — uso exclusivo de `passwordHasher.compare()`.

- **NFR-AUTH-002 (Security)**: JWTs **MUST** be signed with `HS256` using a server-side `JWT_SECRET` loaded from `ConfigService.getOrThrow('JWT_SECRET')`. Missing secret **MUST** prevent application boot.
  - Rastreabilidade: `src/auth/infrastructure/strategies/jwt.strategy.ts` — `algorithms: ['HS256']`, `secretOrKey: configService.getOrThrow<string>('JWT_SECRET')`.

- **NFR-AUTH-003 (Security)**: `access_token` expiration **SHALL** be controlled by `JWT_ACCESS_EXPIRES_IN` (default `15m`) and refresh token expiration by `JWT_REFRESH_EXPIRES_DAYS` (default `7`). Expired access tokens **MUST** be rejected (`ignoreExpiration: false`).
  - Rastreabilidade: `auth.service.ts:generateTokens`; `jwt.strategy.ts:ignoreExpiration: false`.

- **NFR-AUTH-004 (Security)**: Error messages for login failures **MUST NOT** distinguish between "user not found" and "wrong password" (prevention of user enumeration).
  - Rastreabilidade: `auth.service.ts:login` — lança `UnauthorizedException('Credenciais inválidas.')` em ambos os casos.

- **NFR-AUTH-005 (Performance)**: The `POST /auth/login` endpoint **SHOULD** be served in < 200 ms p95 under nominal load (single DB roundtrip para `findByEmailWithPerfisAndPermissoes` + `passwordHasher.compare` + 2 inserts). Refresh **SHOULD** be < 150 ms p95.
  - Rastreabilidade: implícita; baseado em `auth.service.ts:login` e `refreshTokens`.

- **NFR-AUTH-006 (Observability)**: All authentication failures and the suspicious-reuse event **SHOULD** be logged with structured context (user id quando conhecido, IP, User-Agent, motivo). Successful logins **SHALL** persist `LoginHistory`.
  - Rastreabilidade: `auth.service.ts:login` — `prisma.loginHistory.create`; logs são emitidos pelo `Logger` global do NestJS.

- **NFR-AUTH-007 (Statelessness)**: O fluxo de autenticação **MUST** ser stateless — a API **MUST NOT** manter estado de sessão em memória ou store externo entre requests. Toda informação necessária (tenancy + RBAC) **MUST** estar no payload do JWT.
  - Rastreabilidade: nenhum session store é importado; `auth.service.ts` opera apenas com Prisma + JwtService.

- **NFR-AUTH-008 (API Contract Stability)**: O contrato dos endpoints `/auth/login` e `/auth/refresh` **SHOULD** ser considerado estável. Mudanças incompatíveis (remoção de campo, mudança de tipo) **MUST** ser feitas em nova change request.
  - Rastreabilidade: `src/auth/README.md` documenta o contrato atual.

- **NFR-AUTH-009 (Testability)**: A feature **MUST** manter 100% de cobertura dos 9 cenários BDD em `features/autenticacao.feature`, com testes e2e correspondentes em `test/auth.e2e-spec.ts` e testes unitários em `src/auth/application/services/auth.service.spec.ts`.
  - Rastreabilidade: cobertura atual nos arquivos referenciados.

## Acceptance Criteria

- [x] AC-AUTH-01: `POST /auth/login` com credenciais válidas retorna HTTP 201 e corpo contendo `access_token` e `refresh_token`.
- [x] AC-AUTH-02: `POST /auth/login` com senha incorreta retorna HTTP 401 e mensagem `Credenciais inválidas`.
- [x] AC-AUTH-03: `POST /auth/login` com e-mail não cadastrado retorna HTTP 401 e **mesma** mensagem `Credenciais inválidas` (sem user enumeration).
- [x] AC-AUTH-04: `POST /auth/login` com e-mail em formato inválido retorna HTTP 400 e mensagem `E-mail inválido`.
- [x] AC-AUTH-05: `POST /auth/login` com senha de menos de 8 caracteres retorna HTTP 400 e mensagem `no mínimo 8 caracteres`.
- [x] AC-AUTH-06: `POST /auth/login` com body vazio, faltando `email` ou `senha`, retorna HTTP 400.
- [x] AC-AUTH-07: `POST /auth/refresh` com refresh token válido retorna HTTP 201 e novo par de tokens; o token apresentado é revogado.
- [x] AC-AUTH-08: `POST /auth/refresh` com refresh token expirado retorna HTTP 401 e mensagem `expirado`.
- [x] AC-AUTH-09: `POST /auth/refresh` com refresh token desconhecido/inválido retorna HTTP 401 e mensagem `inválido`.
- [x] AC-AUTH-10: `POST /auth/refresh` com refresh token revogado (reuso) retorna HTTP 403, revoga **todos** os tokens do usuário, e mensagem `Atividade suspeita detectada`.
- [x] AC-AUTH-11: O JWT contém as claims `sub`, `email` e `empresas` (com perfis e permissões).
- [x] AC-AUTH-12: Cada login bem-sucedido grava um registro em `LoginHistory` com `userId`, `ip`, `userAgent`.
- [x] AC-AUTH-13: `POST /auth/login` está limitado a 5 req/min/IP; `POST /auth/refresh` a 10 req/min/IP (ambos overridable por env em testes).

## API Specification

### Endpoint 1: `POST /auth/login`

**Decorators**: `@Public()`, `@Throttle({ sensitive: { limit: 5, ttl: 60000 } })`.

**Request**:

```json
{
  "email": "usuario@empresa.com",
  "senha": "Password123!"
}
```

**Response 201**:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "uuid-v4-opaco",
  "usuario": { "id": 1, "email": "usuario@empresa.com" },
  "empresas": [
    {
      "id": "uuid-empresa",
      "perfis": [
        {
          "id": 1,
          "nome": "Admin",
          "codigo": "ADMIN",
          "descricao": "Administrador",
          "permissoes": [
            { "id": 1, "nome": "read:users", "codigo": "READ_USERS", "descricao": "..." }
          ]
        }
      ]
    }
  ]
}
```

**Error Responses**:

- `400 Bad Request` — body inválido (e-mail vazio/formatado, senha < 8 chars, campos ausentes).
- `401 Unauthorized` — `Credenciais inválidas.` (genérica, sem distinção user/senha).
- `429 Too Many Requests` — rate limit `sensitive` excedido.

### Endpoint 2: `POST /auth/refresh`

**Decorators**: `@Public()`, `@Throttle({ sensitive: { limit: 10, ttl: 60000 } })`.

**Request**:

```json
{
  "refresh_token": "uuid-v4-opaco"
}
```

**Response 201**:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "novo-uuid-v4-opaco"
}
```

**Error Responses**:

- `400 Bad Request` — `refresh_token` ausente.
- `401 Unauthorized` — `Refresh token inválido.` (não encontrado) ou `Refresh token expirado.` (`expiresAt < now`).
- `403 Forbidden` — `Atividade suspeita detectada. Todos os tokens revogados.` (token revogado apresentado; cadeia inteira do usuário revogada).
- `429 Too Many Requests` — rate limit excedido.

## Data Models

### Entity: `Usuario` (referenciada)

| Field    | Type      | Required | Description              |
| -------- | --------- | -------- | ------------------------ |
| id       | Int       | Yes      | PK auto-increment         |
| email    | String    | Yes      | Único                     |
| senha    | String?   | No       | Hash (bcrypt/argon2)      |
| ativo    | Boolean   | Yes      | Default `true`            |
| deletedAt| DateTime? | No       | Soft-delete               |

### Entity: `RefreshToken` (Prisma)

| Field     | Type      | Required | Description                                |
| --------- | --------- | -------- | ------------------------------------------ |
| id        | String    | Yes      | PK UUID                                    |
| token     | String    | Yes      | Único (UUID v4 opaco)                      |
| userId    | Int       | Yes      | FK → `Usuario.id`                          |
| expiresAt | DateTime  | Yes      | Data de expiração                          |
| revokedAt | DateTime? | No       | Data de revogação (rotação ou detecção reuso) |
| createdAt | DateTime  | Yes      | Default `now()`                            |

Índices: `@@index([userId])`.

### Entity: `LoginHistory` (Prisma)

| Field     | Type      | Required | Description                |
| --------- | --------- | -------- | -------------------------- |
| id        | String    | Yes      | PK UUID                    |
| userId    | Int       | Yes      | FK → `Usuario.id`          |
| ip        | String?   | No       | IP do cliente              |
| userAgent | String?   | No       | User-Agent do cliente      |
| createdAt | DateTime  | Yes      | Default `now()`            |

Índices: `@@index([userId])`.

## Edge Cases

| # | Caso | Tratamento |
|---|------|------------|
| 1 | Usuário cadastrado mas com `senha = null` (ex.: conta social futura) | `login` lança `UnauthorizedException('Credenciais inválidas.')` — `!user.senha` é checado. |
| 2 | Usuário com `deletedAt != null` (soft-delete) | `findByEmailWithPerfisAndPermissoes` deve respeitar soft-delete; tratamento documentado em `src/usuarios`. |
| 3 | `JWT_SECRET` ausente em runtime | `ConfigService.getOrThrow` lança → aplicação não boota. |
| 4 | `JWT_ACCESS_EXPIRES_IN` inválido | `@nestjs/jwt` lança em `sign()` → request falha com 500. Erro de configuração, não de request. |
| 5 | `expiresInDays` não configurado | Fallback `?? 7` dias. |
| 6 | `userAgent`/`ip` ausentes (chamada interna) | `LoginHistory` aceita `null` para ambos. |
| 7 | Refresh token **reusado** (revoked) | Revoga **todos** os tokens do usuário e responde 403. |
| 8 | Race condition em rotação (mesmo token apresentado 2x em paralelo) | A 2ª chamada encontra `revokedAt` setado pela 1ª → cai no caso de reuso → revoga tudo. |
| 9 | Throttler em testes E2E | `THROTTLER_SENSITIVE_LIMIT=10000` e `THROTTLER_SENSITIVE_LIMIT_REFRESH=10000` em `.env.test` desativam o limite. |
| 10 | E-mail com caixa diferente (`User@x` vs `user@x`) | Assume case-sensitive no lookup (Postgres collation). Documentar se a política mudar. |

## Acceptance Tests (ATDD)

Localização: `test/auth.e2e-spec.ts`.

```typescript
describe('AuthController (e2e)', () => {
  describe('POST /auth/login', () => {
    // BDD: features/autenticacao.feature:Cenário: Login com credenciais válidas
    it('deve permitir que um usuário faça login com sucesso...', ...);
    // BDD: ...senha incorreta
    it('deve retornar 401 para credenciais inválidas', ...);
    // BDD: ...e-mail não cadastrado
    it('deve retornar 401 para usuário inexistente', ...);
    // BDD: ...e-mail inválido
    it('deve retornar 400 para email inválido', ...);
    // BDD: ...senha curta
    it('deve retornar 400 para senha muito curta', ...);
    // BDD: Login sem credenciais (2 cenários)
    it('deve retornar 400 se o email estiver faltando', ...);
    it('deve retornar 400 se a senha estiver faltando', ...);
  });
});
```

## Unit Tests (TDD)

Localização: `src/auth/application/services/auth.service.spec.ts`.

- `login`:
  - deve ser definido
  - deve retornar tokens de acesso e refresh se o login for bem-sucedido (com asserts em `loginHistory.create`, `refreshToken.create`, `jwtService.sign`)
  - deve lançar `UnauthorizedException` se o usuário não existir
  - deve lançar `UnauthorizedException` se a senha for inválida
- `refreshTokens`:
  - deve renovar tokens com sucesso (revoga o antigo e emite novo par)
  - deve lançar `ForbiddenException` e revogar tudo se o token já foi usado (detecção de reuso)

## Technical Notes

- **Stateless**: nenhuma sessão server-side; toda informação de tenancy/RBAC vai no JWT.
- **RBAC embarcado**: o `JwtStrategy.validate` reduz a árvore para apenas `id/codigo` de perfis e permissões, mantendo o payload enxuto.
- **Refresh opaco (UUID v4)**: preferível a JWT para refresh — não carrega claims, é simplesmente um handle revogável.
- **Detecção de reuso**: trade-off entre UX (logout em todas as sessões ao menor sinal) e segurança (anti-theft forte). Optou-se pelo lado seguro.
- **Configuração**: `JWT_*` e `THROTTLER_SENSITIVE_*` são validados por Joi no `ConfigModule`; ver `src/config/`.
- **Rate limit tier `sensitive`**: configurado globalmente em `AppModule`; controller apenas define o limite por rota.

## BDD Scenarios Associated

- `features/autenticacao.feature:Cenário: Login com credenciais válidas`
- `features/autenticacao.feature:Cenário: Login com credenciais inválidas - senha incorreta`
- `features/autenticacao.feature:Cenário: Login com e-mail não cadastrado`
- `features/autenticacao.feature:Cenário: Login com e-mail inválido`
- `features/autenticacao.feature:Cenário: Login com senha curta`
- `features/autenticacao.feature:Cenário: Refresh token válido`
- `features/autenticacao.feature:Cenário: Refresh token expirado`
- `features/autenticacao.feature:Cenário: Refresh token inválido`
- `features/autenticacao.feature:Cenário: Login sem credenciais` (cobre email faltando + senha faltando, 2 testes ATDD)

**Total: 9 cenários BDD.**

## Status

- [x] Draft
- [x] In Review
- [x] Approved
- [x] Implemented
