# OpenCode Global Rules: DDD + BDD + SDD + ATDD + TDD

## Core Principle

You MUST follow, in strict order: **Domain-Driven Development (DDD)** → **Behavior-Driven Development (BDD)** → **Specification-Driven Development (SDD)** → **Acceptance Test-Driven Development (ATDD)** → **Test-Driven Development (TDD)** → **Implementation**.

**NEVER write implementation code before ALL previous steps are complete and approved.**

## Workflow (Strict Order)

| Phase | Paradigm              | Mode       | Action                                                                                                | Artifact                                                         |
| ----- | --------------------- | ---------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1     | **DDD**               | Plan       | Analyze domain, extract ubiquitous language, define aggregates, entities, value objects, repositories | `domain/` skeleton, AGENTS.md update                             |
| 2     | **BDD**               | Plan       | Create Gherkin scenarios using ubiquitous language (happy path + exceptions)                          | `features/*.feature`                                             |
| 3     | **SDD**               | Plan       | Generate formal spec: `design.md` with RFC 2119 requirements, `tasks.md`                              | `.openspec/changes/<feature>/`                                   |
| 4     | **ATDD**              | Plan       | Write acceptance tests that initially fail                                                            | `tests/acceptance/*.spec.ts` or `.feature` with step definitions |
| 5     | **TDD (red)**         | Plan/Build | For each acceptance scenario, write unit tests that fail                                              | `tests/unit/**/*.spec.ts`                                        |
| 6     | **Implementation**    | Build      | Implement minimal code to make unit tests pass (green)                                                | Production code                                                  |
| 7     | **Refactoring**       | Build      | Refactor while keeping tests green                                                                    | Refactored code                                                  |
| 8     | **ATDD Verification** | Build      | Run acceptance tests - must pass                                                                      | Test report                                                      |
| 9     | **SDD Verification**  | Build      | Validate code meets spec (`design.md`)                                                                | Compliance report                                                |
| 10    | **Archive**           | Build      | Move change from `changes/` to `specs/`                                                               | `.openspec/specs/` update                                        |

## Mode Usage

- **Plan Mode** (Tab key): DDD modeling, BDD scenario writing, SDD spec writing, ATDD test writing, TDD test writing. **Read-only - NO source code writing.**
- **Build Mode** (Tab key): Implementation, refactoring, running tests. **Write + bash permissions.**

## Technology Stack

- **Language**: TypeScript / Node.js
- **Framework**: NestJS v11 with Fastify adapter
- **DDD Layers**: Domain (entities, value objects, aggregates, repositories) → Application (services, DTOs) → Infrastructure (repository implementations) → Interfaces (controllers, API)
- **BDD/ATDD**: Gherkin + Jest (with natural language descriptions)
- **TDD**: Jest
- **SDD**: OpenSpec
- **ORM**: Prisma v6 with PostgreSQL

## Directory Structure

```
src/
├── domain/              # DDD: entities, value objects, aggregates, repository interfaces
│   ├── entities/
│   ├── value-objects/
│   ├── aggregates/
│   ├── repositories/    # interfaces only
│   └── events/
├── application/         # DDD: application services, DTOs
├── infrastructure/      # DDD: repository implementations, ORM
└── interfaces/          # DDD: controllers, API

features/                # BDD: .feature files (Gherkin)

tests/
├── acceptance/          # ATDD: automated acceptance tests
└── unit/                # TDD: unit tests (jest, rootDir: src)

.openspec/               # SDD: specifications
├── specs/               # approved specifications (live specs)
└── changes/             # work in progress
    └── <feature>/
        ├── proposal.md  # initial proposal
        ├── design.md    # detailed specification (RFC 2119)
        └── tasks.md     # atomic task breakdown
```

## DDD Rules

- Define **ubiquitous language** first (shared vocabulary between domain experts and developers)
- **Entities**: objects with identity that persists over time
- **Value Objects**: immutable objects defined by their attributes
- **Aggregates**: clusters of related entities and value objects with a root entity
- **Repositories**: interfaces for accessing aggregates (implementations in infrastructure layer)
- **Domain Services**: operations that don't belong to a single entity
- **Domain Events**: immutable events representing domain occurrences

## BDD Rules

- Write scenarios in **Gherkin** using ubiquitous language
- Format:

  ```gherkin
  Funcionalidade: [name]
    Como um [role]
    Eu quero [action]
    Para que [benefit]

    Cenário: [scenario name]
      Dado [context]
      E [more context]
      Quando [action]
      Então [expected outcome]
      E [more outcomes]
  ```

- Cover both happy path and exception scenarios
- Submit scenarios for user approval before proceeding

## SDD Rules

- Use **OpenSpec** for specification management
- Requirements must use **RFC 2119** keywords:
  - **MUST** / **SHALL** / **REQUIRED**
  - **MUST NOT** / **SHALL NOT**
  - **SHOULD** / **RECOMMENDED**
  - **MAY** / **OPTIONAL**
- Every change requires: `proposal.md` → `design.md` → `tasks.md`
- **NO code until design.md is approved**

## ATDD Rules

- Write acceptance tests **BEFORE** implementation (red phase)
- Tests must fail initially - this validates the test is actually checking something
- Tests pass after correct implementation (green phase)
- Use `*.spec.ts` files with Jest + supertest for APIs
- Never commit code without passing acceptance tests

## TDD Rules

- Follow: **Red** (fail) → **Green** (pass) → **Refactor**
- Write minimal code to make tests pass
- Unit test coverage for domain logic should exceed 80%
- Each unit test MUST be traceable to:
  - An acceptance test (ATDD)
  - A specification requirement (SDD)
  - A BDD scenario

## Traceability

Every source file should have comments linking to artifacts:

```typescript
// BDD: features/discount.feature:Scenario: Cliente premium
// SDD: .openspec/changes/discount/design.md:REQ-DISC-01
// ATDD: tests/acceptance/discount.spec.ts
// TDD: tests/unit/domain/services/discount.service.spec.ts
function calculateDiscount(price: Money, userType: UserType): Discount { ... }
```

## Developer Commands

```bash
npm run start:dev       # Start dev server with hot reload (port 3001)
npm run test            # Unit tests (jest, rootDir: src, testRegex: .spec.ts)
npm run test:e2e        # E2E tests (requires npm run test:migrate first)
npm run test:migrate    # Run prisma migrate deploy
npm run lint            # ESLint with --fix
npm run build           # Nest build
npm run format          # Prettier write
npm run validate        # lint + build + test + test:e2e
npm run validate:quick  # lint + build + test
npm run security:check  # Security audit (blocks on high+)
npm run deps:check      # List outdated dependencies
npm run deps:update     # Update dependencies
```

## Multi-tenant Context

Protected endpoints require:

- `Authorization: Bearer <jwt_token>` header
- `x-empresa-id: <uuid>` header to scope permissions/data to a company

## Global Guards & Interceptors

- **Guards**: ThrottlerGuard, AuthGuard, PermissaoGuard
- **Interceptors**: ClassSerializerInterceptor (auto-excludes @Exclude), LoggingInterceptor, EmpresaInterceptor, AuditInterceptor

## Required Services (Docker)

- **PostgreSQL** (port 5434 host, 5432 container)
- **Redis** (port 6379) for cache and BullMQ queues
- **Jaeger** (port 16686) and **OTEL Collector** (4318) for tracing

## Environment

- `.env` for development, `.env.test` for test environment
- `env.validation.ts` validates: NODE_ENV, PORT, DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, REDIS_HOST, REDIS_PORT, ALLOWED_ORIGINS
- OpenTelemetry tracing initialized in `src/tracing.ts` before app bootstrap

## Acceptance Criteria

When you receive a requirement like "add a discount function for premium customers", you MUST:

1. Propose DDD modeling (entities, value objects, aggregates)
2. Generate BDD scenarios (Gherkin)
3. Create SDD specification (design.md with requirements)
4. Generate ATDD tests (that fail initially)
5. Write TDD unit tests (that fail initially)
6. Implement code until all tests pass
7. **Never write code without completing all previous steps first**
