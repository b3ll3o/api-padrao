---
name: engenheiro-requisitos
description: Use when ensuring requirements are technically viable, traceable, and well-documented under software engineering rigor — applies when creating SRS/SyRS documents, building requirements traceability matrices (RTM), managing requirements changes/versioning, applying IEEE 29148 or ISO 12207 patterns, or doing requirements impact analysis. Triggers on "matriz de rastreabilidade", "SRS", "baseline de requisitos", "impacto de mudança", "versionamento de requisitos".
last_updated: 2026-06-15
reviewer: analista-requisitos
---

# Engenheiro de Requisitos (RE)

Como aplicar **rigor de engenharia de software** aos requisitos: viabilidade técnica, rastreabilidade bidirecional, versionamento, gestão de mudanças e padrões IEEE/ISO. Use quando for **criar/especificar** o artefato formal ou **auditar** se os requisitos estão sustentáveis.

## When to Use

Sintomas: "requisito sumiu", "mudou e ninguém percebeu", "qual o impacto?", "como rastrear do código até a spec?", "SRS/SyRS", "baseline de requisitos", "como provar que testamos tudo?".

**Não** use para: escrever os RF/RNF em si (use `analista-requisitos`), descobrir o que construir (use `product-owner`), mapear processo (use `business-analyst`).

## Modelo Mental — RE como Garantia

```text
         ┌────────────────────────────────────────────────────┐
         │              CICLO DE VIDA DO REQUISITO            │
         └────────────────────────────────────────────────────┘
                                  │
   ┌──────────┬──────────┬─────────┼─────────┬──────────┬──────────┐
   ▼          ▼          ▼         ▼         ▼          ▼
Elicitar  Analisar   Especificar Validar  Gerenciar  Evoluir
(stakeholder)         (SRS/SyRS)  (testar)  (RTM,    (manutenção)
                                  (BABOK)  versão)
```

Sua função é **garantir que cada requisito atravessa esse ciclo sem se perder** — do stakeholder ao código, do código de volta ao stakeholder.

## Core Heurística — 6 Atividades RE (IEEE 29148)

| # | Atividade | Pergunta | Artefato |
|---|-----------|---------|----------|
| 1 | **Elicitação** | "O que o stakeholder realmente quer?" | Atas, JAD, surveys |
| 2 | **Análise e negociação** | "É viável, completo, consistente?" | Lista de conflitos resolvidos |
| 3 | **Modelagem** | "Como representar visualmente?" | UML, BPMN, diagramas de contexto |
| 4 | **Especificação** | "Qual é o contrato formal?" | SRS/SyRS (RFC 2119 + IEEE 29148) |
| 5 | **Validação** | "Os requisitos atendem as necessidades?" | Relatório de validação, protótipo |
| 6 | **Gestão** | "Como rastrear mudanças e versões?" | RTM, baseline, change log |

## Rastreabilidade — RTM (Requirements Traceability Matrix)

A **RTM** é o seu principal artefato. Ela tem **3 direções**:

```text
   Origem (why)         Requisito (what)        Implementação (how)
        │                       │                          │
   BR-001: "Aumentar NPS   REQ-AUTH-01: Login    BDD: features/auth.feature
    via login rápido"      SHALL ≤ 200ms"         ATDD: test/auth.e2e-spec.ts
                                                   TDD: src/auth/.../auth.service.spec.ts
                                                   Code: src/auth/.../auth.service.ts
```

**Tipos de rastreabilidade** (todos devem existir):

| Tipo | Setas | Para quê |
|------|-------|----------|
| **Forward (forward-from)** | Origem → Requisito | Garantir que toda necessidade do stakeholder virou requisito |
| **Backward (backward-from)** | Requisito → Origem | Garantir que não há requisito órfão |
| **Forward-to-design** | Requisito → Design | Garantir que cada requisito tem design |
| **Forward-to-implementation** | Requisito → Código | Garantir que cada requisito tem código |
| **Forward-to-test** | Requisito → Teste | Garantir que cada requisito tem teste |

## Matriz RTM (formato)

| REQ ID | Origem (BR) | Design (onde mora) | Implementação (arquivo) | Teste unit | Teste e2e | BDD | Status |
|--------|-------------|--------------------|--------------------------|-----------|----------|-----|--------|
| REQ-AUTH-01 | BR-001 | design.md §3.1 | src/auth/auth.service.ts:42 | auth.service.spec.ts:15 | auth.e2e-spec.ts:cenario_1 | autenticacao.feature:5 | ✅ Done |
| REQ-AUTH-02 | BR-002 | design.md §3.2 | src/auth/auth.service.ts:78 | auth.service.spec.ts:30 | auth.e2e-spec.ts:cenario_2 | autenticacao.feature:15 | ⚠️ WIP |

**Status possíveis**: `Draft`, `Approved`, `In Design`, `In Implementation`, `Done`, `Verified`, `Deprecated`, `Rejected`.

## Change Management — Baseline e Versionamento

```text
   v1.0 (baseline)  ──→  v1.1 (delta)   ──→  v2.0 (major change)
        │                    │                       │
   congelada            mudanças               reset do RTM
   assinada             rastreáveis             novo baseline
```

**Regra do baseline**:
1. Toda `design.md` aprovada vira **baseline** com tag no git (`v1.0-baseline-auth`).
2. Mudanças após baseline devem ser **change requests** (CRs) com:
   - ID: `CR-XXX`
   - REQs afetados
   - Justificativa
   - Impacto (RTM atualizado)
   - Aprovador (PO + RE)
3. Nenhuma mudança sem CR. **Nunca edite baseline em silêncio**.

## IEEE 29148 — Estrutura do SRS (referência)

```text
1. Introdução
   1.1 Propósito
   1.2 Escopo
   1.3 Definições, acrônimos, abreviações
   1.4 Referências
   1.5 Visão geral
2. Descrição geral
   2.1 Perspectiva do produto
   2.2 Funções do produto
   2.3 Características dos usuários
   2.4 Restrições
   2.5 Suposições e dependências
3. Requisitos específicos
   3.1 Requisitos funcionais
   3.2 Requisitos não-funcionais
   3.3 Requisitos de interface externa
4. Apêndices
```

> **No api-padrao**: o artefato é `.openspec/changes/<feature>/design.md` — pode ser mais enxuto que o SRS completo do IEEE 29148, mas **deve linkar a este padrão** se a feature for crítica.

## Quick Reference — Heurísticas

| Pergunta | Resposta |
|----------|----------|
| "REQ sumiu no código?" | RTM forward-to-implementation deve apontar o arquivo. Se vazio, REQ órfão. |
| "Implementação sem REQ?" | RTM backward-from. Se não tem origem, é código morto/overhead. |
| "Mudou a spec, e o código?" | Change Request + diff na RTM. Sem CR, sem merge. |
| "Como auditar cobertura?" | Soma das linhas `REQ-XXX` na RTM vs soma das linhas `REQ-XXX` em BDD. Se diferente, gap. |
| "Quando deprecated?" | Marcar `Deprecated` na RTM, mover para apêndice, nunca deletar. |

## Análise de Impacto (para mudanças)

Antes de aprovar uma mudança, preencha:

```markdown
## CR-007 — Mudança no algoritmo de hash de senha

### Requisito(s) afetado(s)
- REQ-AUTH-05 (hash de senha)

### Tipo de mudança
- [ ] Aditiva (backward-compatible)
- [x] Modificativa (quebra contrato)
- [ ] Substitutiva (REQ novo substitui antigo)

### Impacto técnico
- Schema Prisma: NÃO
- API: SIM (formato do hash muda)
- Storage: NÃO
- Performance: +5ms (bcrypt cost 10 → 12)

### Impacto em testes
- ATDD: 2 cenários precisam ser atualizados
- TDD: 4 specs
- Migração de dados: SIM (script separado)

### Plano de rollback
- Feature flag `HASH_V2_ENABLED` — pode reverter
- Re-hash será feito no próximo login (lazy)

### Aprovação
- [x] PO (autoriza valor)
- [x] RE (autoriza viabilidade)
- [ ] QA (autoriza cobertura)
```

## Verificação de Qualidade dos Requisitos (checklist)

| # | Check | Como verificar |
|---|-------|----------------|
| 1 | Cada REQ tem ID único? | `grep -E "REQ-[A-Z]+-[0-9]+" .openspec/changes/*/design.md` |
| 2 | Cada REQ tem origem? | RTM coluna "Origem" preenchida |
| 3 | Cada REQ tem pelo menos 1 teste? | RTM coluna "Teste" preenchida |
| 4 | REQ sem "como" (implementação)? | Ler e procurar "deve usar X tecnologia" |
| 5 | REQ com RFC 2119? | `grep -E "SHALL\|MUST\|SHOULD" design.md` |
| 6 | Conflitos detectados? | Cross-check entre REQs da mesma feature |
| 7 | Baseline versionado? | Tag git + CHANGELOG |
| 8 | Mudanças pós-baseline via CR? | Log de CRs vs diffs diretos |

## Common Mistakes

| ❌ Evite | ✅ Prefira |
|---------|-----------|
| Spec sem RTM | RTM obrigatória em toda `design.md` |
| RTM atualizada por último (ou nunca) | RTM atualizada junto com cada mudança |
| Editar baseline diretamente | Change Request + nova versão |
| "Não precisamos de RE porque é óbvio" | Tudo que é testável precisa de REQ. Sem exceção. |
| Mudança sem análise de impacto | CR obrigatório com pelo menos 4 dimensões |
| Spec em Word/Google Docs | Spec em `.md` no repo (versionado, code-reviewed) |
| Stakeholder valida implementação | Stakeholder valida **requisito**, dev valida implementação |

## Conexão com o workflow do projeto

| Fase | Sua contribuição |
|------|-----------------|
| **DDD** | Validar se o modelo de domínio cobre os REQs |
| **BDD** | Validar se os cenários cobrem todos os REQs (1:1) |
| **SDD** | **SUA FASE** — `design.md` formal + RTM + versionamento |
| **ATDD** | Garantir que cada REQ tem teste de aceitação |
| **TDD** | Garantir que cada REQ tem teste unitário |
| **Pós-merge** | Auditar RTM, fechar baseline, arquivar em `specs/` |

## Red Flags — pare e investigue

- REQ-XXX sem origem na RTM
- Implementação sem REQ (código órfão)
- Mudança de spec sem CR
- RTM desatualizada há > 1 sprint
- Stakeholder validando "está bonito" em vez de "está correto"
- Teste falhando que ninguém consegue ligar a um REQ

## Reference

- IEEE 29148:2018 — Systems and software engineering — Life cycle processes — Requirements engineering
- IEEE 12207 — Software life cycle processes
- IEEE 1362 — Concept of Operations (ConOps)
- ISO/IEC 12207, 15288
- IREB — CPRE Foundation, Advanced (Elicitation/Modeling/Management/RE@Agile), Expert
- BABOK (IIBA) — Business Analysis Body of Knowledge
- Workflow SDD do projeto: [`.agent/workflows/sdd-workflow.md`](../../workflows/sdd-workflow.md)
- Regras OpenSpec: [`.openspec/AGENTS.md`](../../../.openspec/AGENTS.md)
- Analista de Requisitos: [`.agent/skills/analista-requisitos/SKILL.md`](../analista-requisitos/SKILL.md)
- Business Analyst: [`.agent/skills/business-analyst/SKILL.md`](../business-analyst/SKILL.md)
- Product Owner: [`.agent/skills/product-owner/SKILL.md`](../product-owner/SKILL.md)
