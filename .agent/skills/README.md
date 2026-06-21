# `.agent/skills/`

Esta pasta guarda **skills locais** do projeto — conhecimento reutilizável, focado em domínio, que complementa os [workflows](../workflows/) (que são procedimentos) e o [`AGENTS.md`](../../AGENTS.md) (que é a fonte de verdade canônica).

## Diferença entre skill, workflow e AGENTS.md

| Artefato | Natureza | Pergunta que responde | Exemplo |
| -------- | -------- | --------------------- | ------- |
| `AGENTS.md` | Convenção canônica | "O que é verdade neste projeto?" | "Soft delete é regra; use `BaseEntity`" |
| `.agent/workflows/*.md` | Procedimento | "Como faço X passo a passo?" | "Como rodo o ciclo pré-commit?" |
| `.agent/skills/*.md` | Conhecimento reutilizável | "Quando preciso de Y, qual é o contexto/heurística?" | "Como escolher entre `PermissaoGuard` e `@TemPermissao`?" |

## Quando criar uma skill

Crie uma skill local quando:

- O conhecimento é **heurístico** ("como decidir", "quando usar A vs B") e não puramente procedural.
- O conteúdo é **reutilizado em mais de um workflow** ou módulo.
- O conteúdo **muda raramente** (caso contrário, mantenha no `AGENTS.md`).

**Não** crie uma skill local para:

- Procedimentos lineares (vai em `workflows/`).
- Convenções canônicas (vai no `AGENTS.md`).

## Formato

```markdown
---
description: [verbo + objeto — uma linha]
last_updated: YYYY-MM-DD
reviewer: <autor>
---

# Título da Skill

> Contexto mínimo e quando aplicar.

## Heurística / Decisão

(regras, exemplos, anti-padrões)
```

## Skills atuais

### Triagem de requisitos (pipeline DDD→BDD→SDD→ATDD→TDD)

| Skill | Quando usar | Papel |
|-------|-------------|-------|
| [`analista-requisitos/SKILL.md`](./analista-requisitos/SKILL.md) | Especificar RF/RNF atômicos, testáveis, com RFC 2119, separando "o quê" de "como" | Analista de Requisitos |
| [`business-analyst/SKILL.md`](./business-analyst/SKILL.md) | Mapear as-is/to-be, analisar stakeholders, definir AC de negócio, CBA | Business Analyst (BA) |
| [`engenheiro-requisitos/SKILL.md`](./engenheiro-requisitos/SKILL.md) | SRS/SyRS, RTM, IEEE 29148, versionamento, change requests | Engenheiro de Requisitos (RE) |
| [`product-owner/SKILL.md`](./product-owner/SKILL.md) | Backlog, user stories INVEST, priorização (WSJF/MoSCoW/Kano), MVP, DoD | Product Owner (PO) |

### Testes e qualidade

| Skill | Quando usar |
|-------|-------------|
| [`bdd-gherkin-authoring/SKILL.md`](./bdd-gherkin-authoring/SKILL.md) | Criar/revisar `features/*.feature` em pt-BR |
| [`tdd-red-green-refactor/SKILL.md`](./tdd-red-green-refactor/SKILL.md) | Implementar com TDD strict |
| [`nest-testing-patterns/SKILL.md`](./nest-testing-patterns/SKILL.md) | Padrões de teste NestJS (services, controllers, guards, DTOs) |
| [`e2e-test-isolation/SKILL.md`](./e2e-test-isolation/SKILL.md) | Setup e isolamento de testes E2E |

## Como as 4 skills de requisitos se conectam

```text
   Product Owner                Business Analyst            Analista de Requisitos        Engenheiro de Requisitos
   (o que + por que)            (processo + stakeholders)    (RF/RNF atômicos)            (formalismo + rastreab.)
        │                             │                          │                            │
        ▼                             ▼                          ▼                            ▼
   Backlog priorizado ───────► AC de negócio ──────────► design.md (SDD) ───────────► RTM versionada
   (US com INVEST)             (Given-When-Then         (RFC 2119, REQ-FN/-NF)     (IEEE 29148, baseline)
                               em linguagem                                  │
                               de negócio)                                    ▼
                                                                       BDD / ATDD / TDD
                                                                       (rastreáveis)
```

Use as 4 skills em conjunto na fase de Plan (DDD→BDD→SDD). O agent **`analista-requisitos`** orquestra quando cada uma se aplica.

## Skills globais usadas

Este projeto também consome skills globais do harness (ex.: `superpowers:*`, `frontend-design`, `code-review`, etc.). Essas não vivem aqui — são injetadas pelo harness.
