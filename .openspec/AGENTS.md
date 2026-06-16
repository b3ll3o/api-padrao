# OpenSpec Agent Rules

> **Autoridade geral**: [`/AGENTS.md`](../AGENTS.md). Este arquivo cobre **apenas** as regras de OpenSpec (formato de spec, RFC 2119, fluxo de change). Para arquitetura, comandos, workflow DDD→BDD→SDD→ATDD→TDD, catálogo de módulos e convenções, consulte o `AGENTS.md` na raiz. Artefatos em `.openspec/specs/` são **archived** (imutáveis); artefatos em `.openspec/changes/` são work-in-progress.

## Spec Writing Guidelines

### Spec File Naming

- Use kebab-case: `feature-name.md`
- Example: `user-authentication.md`, `payment-integration.md`

### OpenSpec Structure

```
.openspec/
├── specs/                    # Approved specifications (live specs)
│   └── <feature>.md
└── changes/                  # Work in progress
    └── <feature>/
        ├── proposal.md       # Initial proposal
        ├── design.md         # Detailed specification (RFC 2119)
        └── tasks.md          # Atomic task breakdown
```

## SDD Requirements (RFC 2119)

All requirements MUST use RFC 2119 keywords:

- **MUST** / **SHALL** / **REQUIRED** - absolute requirement
- **MUST NOT** - absolute prohibition
- **SHOULD** / **RECOMMENDED** - may be ignored with justification
- **MAY** / **OPTIONAL** - truly optional

## Spec Structure

```markdown
# Feature Name

## Overview

Brief description of the feature.

## Requirements (RFC 2119)

- REQ-001: The system MUST...

## BDD Scenarios Associated

- `features/<feature>.feature:Cenario: ...`

## Acceptance Tests Associated

- `test/<feature>.e2e-spec.ts`

## Technical Notes

Implementation details and considerations.
```

## Change Workflow

### Creating a New Feature

1. Create change directory `.openspec/changes/<feature>/`
2. Create `proposal.md` with initial analysis
3. Create `design.md` with RFC 2119 requirements (MUST be approved before proceeding)
4. Create `tasks.md` with atomic task breakdown
5. Write acceptance tests in `test/<feature>.e2e-spec.ts` (ATDD - must fail initially)
6. Write unit tests co-located in `src/**/*.spec.ts` (TDD - must fail initially)
7. Implement in Build Mode only after all previous steps complete

### Completing a Feature

1. All tasks completed in `tasks.md`
2. All tests passing
3. Move spec from `changes/<feature>/` to `specs/<feature>.md`
4. Add traceability comments to source code

## Traceability Requirements

Every source file MUST have comments linking to:

- BDD scenario: `// BDD: features/<feature>.feature:Scenario: ...`
- SDD requirement: `// SDD: .openspec/changes/<feature>/design.md:REQ-XXX`
- ATDD test: `// ATDD: test/<feature>.e2e-spec.ts`
- TDD test: `// TDD: src/<...>/<feature>.spec.ts`
