---
description: [executar pipeline SDD+ATDD em 7 etapas com rastreabilidade DDD→BDD→TDD]
last_updated: 2026-06-15
reviewer: claude-code
---

> **Autoridade geral**: [`/AGENTS.md`](../../AGENTS.md). A visão completa do workflow DDD→BDD→SDD→ATDD→TDD está em [AGENTS.md §6](../../AGENTS.md#6-workflow-de-desenvolvimento-ddd--bdd--sdd--atdd--tdd). Este arquivo detalha a **pipeline SDD+ATDD** propriamente dita (etapas 3 e 4 do AGENTS.md).

# SDD + ATDD Workflow Guide

## Overview

Este documento define a pipeline **SDD (Specification-Driven Development) + ATDD (Acceptance Test-Driven Development)** de 7 etapas. Ele pressupõe que as etapas 1 (DDD) e 2 (BDD) já foram executadas — ver [AGENTS.md §6](../../AGENTS.md#6-workflow-de-desenvolvimento-ddd--bdd--sdd--atdd--tdd) para contexto.

| Etapa AGENTS.md | Etapa SDD+ATDD | Modo    | Artefato                                       |
| --------------- | -------------- | ------- | ---------------------------------------------- |
| 3 (SDD)         | 1-3            | Plan    | `.openspec/changes/<feature>/{proposal,design,tasks}.md` |
| 4 (ATDD)        | 4              | Plan    | `test/<feature>.e2e-spec.ts` ou `*.acceptance.spec.ts` |
| 5-7 (TDD)       | 5              | Build   | `src/**/*.spec.ts` + código de produção        |
| 8-9 (verify)    | 6              | Build   | relatório de conformidade                      |
| 10 (archive)    | 7              | Build   | `.openspec/specs/<feature>/`                   |

## 7-Step Pipeline

### Step 1: propose

Analise o requisito e crie uma proposta inicial.

**Local**: `.openspec/changes/<feature>/proposal.md`

**Perguntas a responder**:

- O que é a feature?
- Por que é necessária?
- Qual problema resolve?
- Quem são os stakeholders?

### Step 2: spec

Escreva a especificação detalhada (design.md).

**Local**: `.openspec/changes/<feature>/design.md`

**Deve incluir**:

- Requisitos funcionais (FR-XX)
- Requisitos não-funcionais (NFR-XX)
- Critérios de aceitação (AC-XX)
- Contratos de API (se aplicável)
- Modelos de dados
- Casos de borda

Regras de formato em [`.openspec/AGENTS.md`](../../.openspec/AGENTS.md) (RFC 2119).

### Step 3: tasks

Decomponha em tarefas atômicas.

**Local**: `.openspec/changes/<feature>/tasks.md`

**Formato**:

- [ ] Tarefa 1
- [ ] Tarefa 2
- Cada tarefa deve ser independentemente testável

### Step 4: tests (ATDD)

Escreva os testes de aceitação **ANTES** da implementação.

**Local**: `test/<feature>.e2e-spec.ts` (E2E) ou `test/<feature>.acceptance.spec.ts` (aceitação dedicada)

**Exemplo** (de `test/health.e2e-spec.ts`):

```typescript
describe('Health Check Feature', () => {
  it('GET /health/live should return 200 with status ok', async () => {
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health/live should respond within 2s', async () => {
    const start = Date.now();
    await request(app).get('/health/live');
    expect(Date.now() - start).toBeLessThan(2000);
  });
});
```

**Regras**:

- Testes **DEVEM** falhar inicialmente (Red Phase).
- Use nomes descritivos em **português ou inglês** (consistente com o módulo).
- Limiares de tempo devem ser realistas para E2E (≥ 1s); 10ms é meta irrealista para Postgres+Prisma+Redis.
- Reaproveite helpers de [`test/e2e-utils.ts`](../../test/e2e-utils.ts).

### Step 5: apply (Build Mode)

Implemente o código.

**Somente após**:

- Proposta aprovada
- Spec revisada
- Tarefas planejadas
- Testes de aceitação escritos (e falhando)

**Comandos de validação (após implementar)**:

```bash
npm run lint --fix
npm run build
npm run test
```

### Step 6: verify

Rode **todos** os testes e valide.

**Checklist**:

- [ ] Todos os testes de aceitação passam
- [ ] Todos os testes unitários passam
- [ ] Lint passa
- [ ] Build passa
- [ ] `npm run security:check` passa

### Step 7: archive

Mova as mudanças aprovadas para o diretório de specs.

**Ações**:

1. Mova `.openspec/changes/<feature>/*` para `.openspec/specs/<feature>/`
2. Limpe `.openspec/changes/<feature>/`
3. Atualize o índice de specs (se existir)
4. Confirme que `AGENTS.md` e o README do módulo refletem o novo comportamento

## Example: Adding a New Feature

### 1. Propose

```text
.openspec/changes/new-feature/proposal.md
```

### 2. Spec

```text
.openspec/changes/new-feature/design.md
```

### 3. Tasks

```text
.openspec/changes/new-feature/tasks.md
```

### 4. Tests

```text
test/new-feature.e2e-spec.ts
```

### 5. Apply (Build Mode)

Escreva a implementação.

### 6. Verify

Rode os testes — todos devem passar.

### 7. Archive

Mova para `.openspec/specs/new-feature/`.

## Key Principles

1. **Nunca pule etapas** — cada fase existe por um motivo.
2. **Testes primeiro** — testes de aceitação definem o "done".
3. **Disciplina de modo** — Plan Mode para specs/testes, Build Mode para código.
4. **Commits atômicos** — uma tarefa = um commit (quando possível).
5. **Verifique antes de arquivar** — garanta que tudo funciona.

## Quick Reference

| Comando                  | Propósito                                       |
| ------------------------ | ----------------------------------------------- |
| `npm run validate`       | Validação completa (lint + build + test + e2e)  |
| `npm run validate:quick` | Validação rápida (lint + build + test) — pre-commit |
| `npm run security:check` | Auditoria de segurança                          |
| `npm run deps:check`     | Verifica dependências desatualizadas            |
