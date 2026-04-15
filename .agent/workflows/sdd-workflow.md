---
description: [SDD + ATDD workflow implementation guide]
---

# SDD + ATDD Workflow Guide

## Overview

This document defines the complete SDD (Specification-Driven Development) + ATDD (Acceptance Test-Driven Development) workflow for this project.

## 7-Step Pipeline

### Step 1: propose

Analyze the requirement and create an initial proposal.

**Location**: `.openspec/changes/<feature>/proposal.md`

**Questions to answer**:

- What is the feature?
- Why is it needed?
- What problem does it solve?
- Who are the stakeholders?

### Step 2: spec

Write detailed specification (design.md).

**Location**: `.openspec/changes/<feature>/design.md`

**Include**:

- Functional requirements (FR-XX)
- Non-functional requirements (NFR-XX)
- Acceptance criteria (AC-XX)
- API contracts if applicable
- Data models
- Edge cases

### Step 3: tasks

Break down into atomic tasks.

**Location**: `.openspec/changes/<feature>/tasks.md`

**Format**:

- [ ] Task 1
- [ ] Task 2
- Each task should be independently testable

### Step 4: tests (ATDD)

Write acceptance tests BEFORE implementation.

**Location**: `src/**/*.<feature>.acceptance.spec.ts`

**Example**:

```typescript
describe('Health Check Feature', () => {
  it('GET /health should return 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', timestamp: expect.any(String) });
  });

  it('GET /health should respond within 10ms', async () => {
    const start = Date.now();
    await request(app).get('/health');
    expect(Date.now() - start).toBeLessThan(10);
  });
});
```

**Rules**:

- Tests MUST fail initially (Red Phase)
- Write tests that describe expected behavior
- Use descriptive test names in Portuguese or English

### Step 5: apply (Build Mode)

Implement the code.

**Only after**:

- Proposal approved
- Spec reviewed
- Tasks planned
- Acceptance tests written

**Commands**:

- `npm run lint --fix`
- `npm run build`
- `npm run test`

### Step 6: verify

Run all tests and validate.

**Validation checklist**:

- [ ] All acceptance tests pass
- [ ] All unit tests pass
- [ ] Lint passes
- [ ] Build succeeds
- [ ] Security check passes

### Step 7: archive

Move approved changes to specs directory.

**Actions**:

1. Move `.openspec/changes/<feature>/*` to `.openspec/specs/<feature>/`
2. Clean up `.openspec/changes/<feature>/`
3. Update index of specs if exists

## Example: Adding a New Feature

### 1. Propose

```
.openspec/changes/new-feature/proposal.md
```

### 2. Spec

```
.openspec/changes/new-feature/design.md
```

### 3. Tasks

```
.openspec/changes/new-feature/tasks.md
```

### 4. Tests

```
src/feature/new-feature.acceptance.spec.ts
```

### 5. Apply (Build Mode)

Write the implementation

### 6. Verify

Run tests - all should pass

### 7. Archive

Move to `.openspec/specs/new-feature/`

## Key Principles

1. **Never skip steps** - Each phase exists for a reason
2. **Tests first** - Acceptance tests define "done"
3. **Mode discipline** - Use Plan Mode for specs/tests, Build Mode for code
4. **Atomic commits** - Each task = one commit when possible
5. **Verify before archive** - Ensure everything works

## Quick Reference

| Command                  | Purpose                                     |
| ------------------------ | ------------------------------------------- |
| `npm run validate`       | Full validation (lint + build + test + e2e) |
| `npm run validate:quick` | Quick validation (lint + build + test)      |
| `npm run security:check` | Security audit                              |
| `npm run deps:check`     | Check outdated deps                         |
