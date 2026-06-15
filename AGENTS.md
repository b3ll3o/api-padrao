# AGENTS.md — Fonte de Verdade Única

> Este arquivo é a **fonte canônica de arquitetura, comandos, workflow e convenções** para todos os agentes (humanos ou IA) que operam neste repositório. Outros documentos (README, READMEs de módulo, workflows) referenciam este. Se algo aqui conflitar com outro doc, este vence.

## Índice

- [1. Visão Geral](#1-visão-geral)
- [2. Stack](#2-stack)
- [3. Setup e Comandos](#3-setup-e-comandos)
- [4. Arquitetura](#4-arquitetura)
- [5. Convenções](#5-convenções)
- [6. Workflow de Desenvolvimento (DDD → BDD → SDD → ATDD → TDD)](#6-workflow-de-desenvolvimento-ddd--bdd--sdd--atdd--tdd)
- [7. Catálogo de Módulos](#7-catálogo-de-módulos)
- [8. Pré-commit e Validação de Alterações](#8-pré-commit-e-validação-de-alterações)
- [9. Infra e Observabilidade](#9-infra-e-observabilidade)
- [10. Variáveis de Ambiente](#10-variáveis-de-ambiente)
- [11. Testing](#11-testing)
- [12. Entry Points Úteis](#12-entry-points-úteis)
- [Apêndice A. Documentos do Repositório](#apêndice-a-documentos-do-repositório)

---

## 1. Visão Geral

API RESTful multi-tenant construída com **NestJS 11** sobre **Fastify**, **Prisma 6** + **PostgreSQL 16**, autenticação via **JWT/Passport**, rate-limit com **Throttler** (4 tiers), cache e filas com **Redis** + **BullMQ**, observabilidade via **OpenTelemetry → Jaeger**. Arquitetura em camadas (**Clean Architecture**) por módulo, com separação `domain` / `application` / `infrastructure` / `dto`. Veja a [visão pública e quickstart no README.md](./README.md) e o [guia de infra em src/shared/README_infra.md](./src/shared/README_infra.md).

## 2. Stack

- **Framework**: NestJS 11 (`@nestjs/core`, `@nestjs/common`, `@nestjs/platform-fastify`)
- **HTTP Server**: Fastify (`@nestjs/platform-fastify`)
- **ORM**: Prisma 6 (`@prisma/client`, `prisma`)
- **Banco**: PostgreSQL 16 (via Docker)
- **Cache/Filas**: Redis 7 + BullMQ + cache-manager-redis-yet
- **Auth**: JWT (`@nestjs/jwt`) + Passport.js + bcrypt
- **Rate Limit**: `@nestjs/throttler` com 4 tiers (short/medium/long/sensitive)
- **Validação**: `class-validator` + `class-transformer` + `Joi` (env)
- **Logging**: `nestjs-pino` (pino-http + pino-pretty em dev)
- **Segurança HTTP**: `@fastify/helmet`, CORS configurável
- **Documentação**: Swagger via `@nestjs/swagger` em `/swagger`
- **Observabilidade**: OpenTelemetry SDK + auto-instrumentations + Jaeger
- **Testes**: Jest + Supertest
- **Qualidade**: ESLint + Prettier + Husky + lint-staged

## 3. Setup e Comandos

### Pré-requisitos

- Node.js 20+
- Docker 20.10+ e **Docker Compose v2** (comando `docker compose` com espaço)

### Primeira execução

```bash
npm install
cp .env.example .env       # editar JWT_SECRET e demais
sudo usermod -aG docker $USER   # se ainda não estiver no grupo docker
docker compose up -d postgres redis
npx prisma migrate dev
npm run start:dev
```

API disponível em `http://localhost:3001`, Swagger em `http://localhost:3001/swagger`, Jaeger em `http://localhost:16686`.

### Comandos npm

```bash
# Dev
npm run start:dev          # nest --watch (porta 3001)
npm run start:debug        # com --inspect
npm run start:prod         # roda dist/main

# Testes
npm run test               # unitários (jest, rootDir: src, *.spec.ts)
npm run test -- path/para/arquivo.spec.ts               # 1 arquivo
npm run test -- -t "texto do describe ou it"            # filtro por nome
npm run test -- path/arquivo.spec.ts -t "caso"          # arquivo + filtro
npm run test:watch         # modo watch
npm run test:cov           # com cobertura
npm run test:e2e           # E2E (NODE_ENV=test, usa .env.test)
npm run test:migrate       # prisma migrate deploy (lê DATABASE_URL atual)

# Qualidade
npm run lint               # eslint --fix
npm run format             # prettier --write
npm run build              # nest build
npm run validate           # lint + build + test + test:e2e
npm run validate:quick     # lint + build + test  ← roda no pre-commit
npm run security:check     # npm audit --audit-level=high (bloqueia em high+)
npm run deps:check         # npm outdated
npm run deps:update        # npm update

# Prisma
npx prisma migrate dev --name <nome>     # nova migração em dev
npx prisma migrate deploy                # aplicar migrações (CI/prod)
npx prisma studio                        # GUI do banco
npx prisma generate                      # regenerar cliente
```

### Comandos Docker

```bash
docker compose up -d                      # stack completa (Postgres+pgAdmin+Jaeger+OTEL+Redis+API)
docker compose up -d postgres redis       # mínimo para dev local
docker compose -f docker-compose.dev.yml up -d   # stack de dev sem API nem Redis
docker compose down                       # parar tudo
docker compose down -v                    # parar e remover volumes (reset)
docker compose logs -f <serviço>          # acompanhar logs
docker compose ps                         # status
```

> **Permissão Docker (Linux)**: se receber `permission denied`, adicione seu usuário ao grupo `docker` (`sudo usermod -aG docker $USER`) e faça logout/login, ou use `newgrp docker` na sessão atual.

## 4. Arquitetura

### Estrutura de cada módulo

Cada módulo de negócio fica em `src/<modulo>/` e segue Clean Architecture:

```text
src/<modulo>/
├── domain/
│   ├── entities/          # classes de entidade com @Exclude() em campos sensíveis
│   └── repositories/      # apenas interfaces (tokens de DI)
├── application/
│   ├── controllers/       # HTTP: use @UsuarioLogado() e @EmpresaId(), nunca @Req()
│   └── services/          # casos de uso
├── infrastructure/
│   └── repositories/      # Prisma<Modulo>Repository implementa a interface do domain
├── dto/                   # DTOs com class-validator
└── <modulo>.module.ts
```

### Multi-tenancy (escopo central da aplicação)

Autorização é contextual por `Empresa`. Endpoints protegidos exigem **ambos** os headers:

- `Authorization: Bearer <jwt>`
- `x-empresa-id: <uuid>`

Fluxo: `EmpresaInterceptor` → `EmpresaContext` (provider request-scoped) → `@EmpresaId()` no controller → `PermissaoGuard` valida os `perfis` do usuário especificamente naquele `empresaId`.

> **Pontos-chave**:
>
> - **Perfis são escopados por empresa** (não globais). O mesmo nome de perfil pode existir em empresas diferentes com permissões diferentes.
> - **Permissões são globais** (representam ações do código, ex.: `READ_USUARIOS`).
> - O JWT carrega o `sub` (id do usuário) e a lista de empresas+perfis do usuário.

### Soft delete

Todas as entidades persistentes estendem `BaseEntity` com `id`, `createdAt`, `updatedAt`, `deletedAt`, `ativo`. **Deletes são sempre lógicos** — setar `deletedAt` e `ativo=false`. `PrismaService` ([src/prisma/prisma.service.ts](./src/prisma/prisma.service.ts)) é estendido com um query extension que **auto-filtra `deletedAt: null`** — repositórios não precisam lembrar de adicionar a cláusula. Restore via PATCH limpando `deletedAt` e setando `ativo=true`.

### Guards globais (registrados em `src/app.module.ts`)

Ordem de execução: `ThrottlerGuard` → `AuthGuard` → `PermissaoGuard`.

- `ThrottlerGuard` — rate limit, 4 tiers (ver seção 10).
- `AuthGuard` ([src/auth/application/guards/auth.guard.ts](./src/auth/application/guards/auth.guard.ts)) — JWT em todas as rotas por padrão; rotas públicas marcam com `@Public()`.
- `PermissaoGuard` ([src/auth/application/guards/permissao.guard.ts](./src/auth/application/guards/permissao.guard.ts)) — valida `@TemPermissao('...')` no contexto da `x-empresa-id`.

### Interceptors globais

- `ClassSerializerInterceptor` — aplica `@Exclude()` das entidades automaticamente.
- `LoggingInterceptor` — log de método/URL/status/latência.
- `EmpresaInterceptor` — popula `EmpresaContext` com base no header `x-empresa-id`.
- `AuditInterceptor` — auditoria de ações marcadas com `@Audit('ação')`.

### Filter global

- `AllExceptionsFilter` ([src/shared/infrastructure/filters/all-exceptions.filter.ts](./src/shared/infrastructure/filters/all-exceptions.filter.ts)) — formato padrão de erro: `{ statusCode, timestamp, path, message }`.

### Decorators customizados (use estes, não `@Req()`)

- `@Public()` — `auth/application/decorators/public.decorator.ts`. Marca rota como pública (bypassa `AuthGuard`).
- `@TemPermissao('CODE_1', ...)` — `auth/application/decorators/temPermissao.decorator.ts`. Exige permissões específicas.
- `@UsuarioLogado()` — `shared/application/decorators/usuario-logado.decorator.ts`. Injeta o `JwtPayload` no parâmetro.
- `@EmpresaId()` — `shared/application/decorators/empresa-id.decorator.ts`. Injeta o UUID da empresa do header `x-empresa-id`.
- `@Audit('ação')` — `shared/application/decorators/audit.decorator.ts`. Marca ação para `AuditInterceptor`.

## 5. Convenções

- **Idioma**: **português (pt-BR)** para comentários de código, descrições Swagger, Gherkin, docs de tarefa e commits. Identifiers e descrições de API podem ficar em inglês.
- **Segurança de dados**: **nunca** delete campos sensíveis manualmente nos services (`delete user.password`). Use `@Exclude()` na entidade e confie no `ClassSerializerInterceptor` global.
- **Paginação**: todos os endpoints de listagem **devem** usar `PaginationDto` (default `page=1`, `limit=10`) e retornar `PaginatedResponseDto<T>` (campos: `data`, `total`, `page`, `limit`, `totalPages`).
- **Swagger**: anote endpoints novos/alterados com `@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth` etc. OpenAPI em `/swagger`.
- **Logging**: use o `Logger` de `@nestjs/common` (ou o de `nestjs-pino`) dentro de services. `LoggingInterceptor` cuida do HTTP.
- **Validação**: `ValidationPipe` global está configurado com `whitelist: true` e `forbidNonWhitelisted: true` — DTOs novos só precisam de `class-validator`.
- **Qualidade**: SOLID, Clean Code. **Sem warnings, sem regras de lint desabilitadas sem justificativa**. Husky roda `validate:quick` em arquivos staged via lint-staged.
- **Config**: variáveis validadas por Joi em [src/config/env.validation.ts](./src/config/env.validation.ts). Defaults vêm de lá — não hardcode em services.
- **Documentação**: ao mudar contratos de API ou arquitetura, atualize `README.md`, `AGENTS.md` e o `README.md` do módulo afetado.

## 6. Workflow de Desenvolvimento (DDD → BDD → SDD → ATDD → TDD)

**Ordem obrigatória. Nunca escreva código de produção antes de completar todas as etapas anteriores.**

1. **DDD** (Plan) — modelar agregados, entidades, value objects, repositórios. Artefato: esqueleto em `src/<modulo>/domain/`, update no AGENTS.md.
2. **BDD** (Plan) — escrever cenários Gherkin (happy path + exceções). Artefato: `features/<modulo>.feature`.
3. **SDD** (Plan) — spec formal com requisitos RFC 2119. Artefato: `.openspec/changes/<feature>/{proposal,design,tasks}.md`.
4. **ATDD** (Plan) — testes de aceitação que **falham** inicialmente. Artefato: `test/*.e2e-spec.ts` ou `*.acceptance.spec.ts`.
5. **TDD red** (Plan/Build) — testes unitários por cenário, que **falham**. Artefato: `src/**/*.spec.ts`.
6. **Implementação** (Build) — implementar o mínimo para os testes passarem (green). Artefato: código de produção.
7. **Refactor** (Build) — refatorar mantendo testes verdes. Artefato: código refatorado.
8. **ATDD verify** (Build) — rodar aceitação — devem passar. Artefato: relatório.
9. **SDD verify** (Build) — validar conformidade com `design.md`. Artefato: compliance report.
10. **Archive** (Build) — mover de `changes/<feature>/` para `specs/<feature>/`. Artefato: `.openspec/specs/` atualizado.

- **Plan Mode**: DDD, BDD, SDD, ATDD, TDD (escrita de testes). **Read-only — sem código de produção.**
- **Build Mode**: implementação, refactor, execução de testes.

Guias detalhados em [`.agent/workflows/sdd-workflow.md`](./.agent/workflows/sdd-workflow.md) (pipeline SDD+ATDD de 7 etapas) e [`.openspec/AGENTS.md`](./.openspec/AGENTS.md) (regras OpenSpec, RFC 2119, formato de spec).

### Rastreabilidade (comentários no código)

Cada arquivo de produção deve linkar seus artefatos:

```typescript
// BDD: features/discount.feature:Cenário: Cliente premium
// SDD: .openspec/changes/discount/design.md:REQ-DISC-01
// ATDD: test/discount.e2e-spec.ts
// TDD: src/discount/application/services/discount.service.spec.ts
function calculateDiscount(price: Money, userType: UserType): Discount { ... }
```

## 7. Catálogo de Módulos

```
AppModule
├── AuthModule         → depende de UsuariosModule
├── UsuariosModule     ↔ EmpresasModule (forwardRef, dependência circular)
├── EmpresasModule     → UsuariosModule, PerfisModule
├── PerfisModule       → PermissoesModule
├── PermissoesModule   → AuthModule
├── PrismaModule       (global, sem deps)
├── HealthModule       (Terminus)
├── SharedModule       (decorators, filters, interceptors, config)
└── ThrottlerModule    (global)
```

- `auth` — [src/auth/](./src/auth/): JWT, AuthGuard, PermissaoGuard, strategies, decorators de auth. [README](./src/auth/README.md).
- `usuarios` — [src/usuarios/](./src/usuarios/): CRUD de usuários, soft delete/restore, vínculo usuário↔empresa. [README](./src/usuarios/README.md).
- `empresas` — [src/empresas/](./src/empresas/): CRUD de empresas, vínculo de usuários com perfis, escopo multi-tenant. [README](./src/empresas/README.md).
- `perfis` — [src/perfis/](./src/perfis/): Perfis escopados por empresa, atribuição de permissões. [README](./src/perfis/README.md).
- `permissoes` — [src/permissoes/](./src/permissoes/): Permissões atômicas globais (READ_*, CREATE_*, etc.). [README](./src/permissoes/README.md).
- `prisma` — [src/prisma/](./src/prisma/): PrismaService + extensão de soft delete.
- `shared` — [src/shared/](./src/shared/): Decorators, filters, interceptors, services, config, DTOs, health. [README](./src/shared/README.md) · [Infra](./src/shared/README_infra.md).

**Endpoints de saúde** (em `src/shared/infrastructure/health/`):

- `GET /health/live` — liveness (memória heap ≤ 150MB)
- `GET /health/ready` — readiness (DB + disco)
- `GET /health/network` — conectividade externa

## 8. Pré-commit e Validação de Alterações

O hook do Husky ([.husky/pre-commit](./.husky/pre-commit)) roda `npm run validate:quick` em arquivos staged via lint-staged (configurado em `package.json`):

```json
"lint-staged": {
  "*.{ts,tsx}": [
    "eslint --fix",
    "jest --findRelatedTests --passWithNoTests"
  ]
}
```

**Ciclo completo antes de commit** (obrigatório, ver [`.agent/workflows/alteracao-segura.md`](./.agent/workflows/alteracao-segura.md)):

1. `npm run security:check` — bloqueia em vulnerabilidade `high`+
2. `npm run deps:check` — identifica desatualizações
3. `npm run lint` — corrige tudo que aparecer
4. `npm run format` — padroniza formatação
5. `npm run test` — testes unitários
6. `npm run test:e2e` — E2E (requer `test:migrate` e infra)
7. `npm run build` — valida compilação

Se qualquer passo falhar, corrija e reinicie a partir do passo 1. **Só faça commit após uma rodada completa sem alterações.**

## 9. Infra e Observabilidade

Detalhamento em [src/shared/README_infra.md](./src/shared/README_infra.md). Resumo:

- **Porta host → container**: Postgres `5434` → `5432`, pgAdmin `8081` → `80`, Jaeger UI `16686`, OTEL HTTP `4318`, OTEL gRPC `4317` (host) → `4317` (container), Redis `6379`.
- **Tracing init em [src/tracing.ts](./src/tracing.ts)**: importado como **primeira linha** de `src/main.ts` para garantir que o SDK do OpenTelemetry inicia antes do NestFactory. Não reordene os imports.
- **Jaeger UI**: `http://localhost:16686` para inspecionar traces.
- **OTEL Collector** ([otel-collector-config.yaml](./otel-collector-config.yaml)): recebe OTLP (HTTP/gRPC) e exporta para Jaeger via gRPC.

## 10. Variáveis de Ambiente

Validadas em [src/config/env.validation.ts](./src/config/env.validation.ts) (Joi). Defaults aplicados quando a variável é omitida.

- `NODE_ENV` — não obrigatório, default `development`. Aceita `development` | `production` | `test` | `provision`.
- `PORT` — não obrigatório, default `3001`. Porta do app.
- `DATABASE_URL` — **obrigatório**. Connection string do Prisma.
- `JWT_SECRET` — **obrigatório**. Chave de assinatura dos tokens.
- `JWT_ACCESS_EXPIRES_IN` — não obrigatório, default `15m`. Expiração do access token.
- `JWT_REFRESH_EXPIRES_DAYS` — não obrigatório, default `7`. Expiração do refresh token (em dias).
- `REDIS_HOST` — não obrigatório, default `localhost`. Host do Redis.
- `REDIS_PORT` — não obrigatório, default `6379`. Porta do Redis.
- `CACHE_TTL` — não obrigatório, default `600`. TTL do cache (segundos).
- `THROTTLER_SHORT_TTL` / `THROTTLER_SHORT_LIMIT` — não obrigatórios, defaults `1000` / `3`. Tier `short` (janela ms / req).
- `THROTTLER_MEDIUM_TTL` / `THROTTLER_MEDIUM_LIMIT` — defaults `10000` / `20`. Tier `medium`.
- `THROTTLER_LONG_TTL` / `THROTTLER_LONG_LIMIT` — defaults `60000` / `100`. Tier `long` (dominante).
- `THROTTLER_SENSITIVE_TTL` / `THROTTLER_SENSITIVE_LIMIT` — defaults `60000` / `10`. Tier `sensitive` (rotas com `@Throttle`).
- `ALLOWED_ORIGINS` — opcional. CSV de origens CORS (em produção).
- `OTEL_EXPORTER_OTLP_ENDPOINT` — não obrigatório, default `http://localhost:4318`. Coletor OTEL.

Para a stack Docker, ver [docker-compose.yml](./docker-compose.yml) — o serviço `api` lê `DATABASE_URL`, `JWT_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `OTEL_EXPORTER_OTLP_ENDPOINT` e define `NODE_ENV=production`.

## 11. Testing

- **Unitários** (`*.spec.ts`): co-localizados em `src/`. Jest `rootDir: src`. Use `npm run test -- <caminho>` para arquivo único, `npm run test -- -t "<texto>"` para filtro por nome.
- **E2E** (`*.e2e-spec.ts`): em `test/`. Config em [test/jest-e2e.json](./test/jest-e2e.json) (`maxWorkers: 1` para serializar). Setup global em [test/setup-e2e.ts](./test/setup-e2e.ts) carrega `.env.test`. Helpers compartilhados em [test/e2e-utils.ts](./test/e2e-utils.ts) — **reaproveite-os** em vez de rolar fixtures novas.
- **Cobertura**: `npm run test:cov`. Saída em `coverage/`.
- **Contagem atual** (verificável): `find src -name '*.spec.ts' | wc -l` para unitários, `find test -name '*.e2e-spec.ts' | wc -l` para E2E.
- **Pré-condição para E2E**: banco de teste migrado (`npm run test:migrate`) e infra rodando (`docker compose up -d postgres redis`).

## 12. Entry Points Úteis

- [src/main.ts](./src/main.ts) — bootstrap: Fastify, Helmet, CORS, ValidationPipe, Swagger, Pino logger.
- [src/app.module.ts](./src/app.module.ts) — DI composition, guards/interceptors globais, Redis cache + Bull, Throttler config.
- [src/tracing.ts](./src/tracing.ts) — OpenTelemetry SDK init.
- [src/config/env.validation.ts](./src/config/env.validation.ts) — schema Joi das env vars.
- [src/auth/auth.module.ts](./src/auth/auth.module.ts) — wiring do JWT (lê `JWT_ACCESS_EXPIRES_IN`).
- [src/auth/application/guards/auth.guard.ts](./src/auth/application/guards/auth.guard.ts) — auth via JWT.
- [src/auth/application/guards/permissao.guard.ts](./src/auth/application/guards/permissao.guard.ts) — `@TemPermissao`.
- [src/prisma/prisma.service.ts](./src/prisma/prisma.service.ts) — Prisma client + extensão de soft delete.
- [src/shared/infrastructure/filters/all-exceptions.filter.ts](./src/shared/infrastructure/filters/all-exceptions.filter.ts) — formato de erro padrão.
- [prisma/schema.prisma](./prisma/schema.prisma) — fonte de verdade do modelo de dados.

---

## Apêndice A. Documentos do Repositório

- [README.md](./README.md) — entry point público: descrição, quickstart, multi-tenant, índice de docs. Manter enxuto.
- [AGENTS.md](./AGENTS.md) — **este arquivo**. Fonte canônica de arquitetura, comandos, workflow, convenções. Atualizar quando arquitetura/convenção mudar.
- [src/auth/README.md](./src/auth/README.md) — API reference do módulo `auth`. Atualizar ao mudar endpoints/guards.
- [src/usuarios/README.md](./src/usuarios/README.md) — API reference do módulo `usuarios`. Atualizar ao mudar endpoints/regras.
- [src/empresas/README.md](./src/empresas/README.md) — API reference do módulo `empresas`. Atualizar ao mudar endpoints/regras.
- [src/perfis/README.md](./src/perfis/README.md) — API reference do módulo `perfis`. Atualizar ao mudar endpoints/regras.
- [src/permissoes/README.md](./src/permissoes/README.md) — API reference do módulo `permissoes`. Atualizar ao mudar endpoints/regras.
- [src/shared/README.md](./src/shared/README.md) — visão do módulo `shared` (decorators, filters, interceptors). Atualizar ao mudar componentes cross-cutting.
- [src/shared/README_infra.md](./src/shared/README_infra.md) — infra: Docker, OTEL/Jaeger, env vars. Atualizar ao mudar infra.
- [.agent/workflows/](./.agent/workflows/) — procedimentos passo a passo (SDD, alteração segura, E2E, verificação). Atualizar ao mudar processo.
- [.openspec/AGENTS.md](./.openspec/AGENTS.md) — regras OpenSpec (formato de spec, RFC 2119). Mudanças raras.
- [.openspec/changes/](./.openspec/changes/) — specs em andamento (`<feature>/{proposal,design,tasks}.md`). Apaga após archive.
- [.openspec/specs/](./.openspec/specs/) — specs **archived** (histórico, imutável). **Não modificar**.

**Regra**: este arquivo é a fonte de verdade. Não crie `CLAUDE.md`, `GEMINI.md`, `Cursor`/`.cursorrules`/`.github/copilot-instructions.md` ou similares — essas ferramentas também reconhecem `AGENTS.md` na raiz.
