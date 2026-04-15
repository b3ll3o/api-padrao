# AGENTS.md

## SDD (Specification-Driven Development)

### Core Principle

You MUST follow Specification-Driven Development (SDD). **NEVER write implementation code before the specification is defined and approved.**

### Workflow

1. **Understand**: Ask clarifying questions to understand the requirement fully.
2. **Specify**: Write or update specifications in the `.openspec/specs/` directory.
3. **Plan**: Break down the spec into a task list in `.openspec/changes/<feature>/tasks.md`.
4. **Implement**: Only after the spec and plan are complete, switch to **Build Mode** to write code.

### Mode Usage

- Use **Plan Mode** for: analysis, creating/editing specs, planning tasks. (Read-only)
- Use **Build Mode** ONLY for: writing code, running tests, applying migrations. (Write permissions)

### SDD Directories

- `.openspec/specs/` - Specification documents
- `.openspec/changes/` - Feature-specific changes and tasks

## Developer Commands

```bash
npm run start:dev # Start dev server with hot reload (port 3001)
npm run test # Unit tests (jest, rootDir: src, testRegex: .spec.ts)
npm run test:e2e # E2E tests (requires npm run test:migrate first)
npm run test:migrate # Run prisma migrate deploy
npm run lint # ESLint with --fix
npm run build # Nest build
npm run format # Prettier write
npm run validate # lint + build + test + test:e2e
npm run validate:quick # lint + build + test
npm run security:check # Audit de segurança (bloqueia em high+)
npm run deps:check # Lista dependências desatualizadas
npm run deps:update # Atualiza dependências
```

## Test Requirements

- E2E tests require `npm run test:migrate` first to apply migrations
- E2E tests use `NODE_ENV=test` which loads `.env.test` (not `.env`)
- E2E tests run on port 3002 (configured in `.env.test`)
- Unit tests run from `src/` root with `jest --config` in package.json

## Multi-tenant Context

Protected endpoints require:

- `Authorization: Bearer <jwt_token>` header
- `x-empresa-id: <uuid>` header to scope permissions/data to a company

## Architecture

- **Framework:** NestJS v11 with Fastify adapter (not Express)
- **ORM:** Prisma v6 with PostgreSQL
- **Paths:** `src/*` aliased to `src/*` (tsconfig paths)
- **Layers:** Domain (entities, repository interfaces) → Application (services, controllers, DTOs) → Infrastructure (repositories, external services)
- **Global guards:** ThrottlerGuard, AuthGuard, PermissaoGuard
- **Global interceptors:** ClassSerializerInterceptor (auto-excludes @Exclude fields), LoggingInterceptor, EmpresaInterceptor, AuditInterceptor

## Required Services (Docker)

- **PostgreSQL** (port 5434 host, 5432 container)
- **Redis** (port 6379) for cache and BullMQ queues
- **Jaeger** (port 16686) and **OTEL Collector** (4318) for tracing

## Environment

- `.env` for development, `.env.test` for test environment
- `env.validation.ts` validates: NODE_ENV, PORT, DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, REDIS_HOST, REDIS_PORT, ALLOWED_ORIGINS
- OpenTelemetry tracing initialized in `src/tracing.ts` before app bootstrap
