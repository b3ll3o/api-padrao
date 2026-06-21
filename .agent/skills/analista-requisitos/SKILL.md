---
name: analista-requisitos
description: Use when extracting, analyzing, or documenting functional and non-functional requirements for a feature — applies when writing RFC 2119 specifications, deciding which requirements belong in SDD vs BDD vs DDD, ensuring requirements are testable/traceable/atomic, and separating "what" from "how" before any code is written.
last_updated: 2026-06-15
reviewer: analista-requisitos
---

# Analista de Requisitos

Como **decompor, especificar e validar requisitos funcionais e não-funcionais** para uma feature nova ou alteração neste projeto. Use quando for **criar/atualizar** o artefato `.openspec/changes/<feature>/design.md` ou revisar se os requisitos estão SMART.

## When to Use

Sintomas: "não sei se está completo", "RF e RNF misturados", "requisito ambíguo", "time interpreta diferente", "não dá pra testar", `design.md` sem RFC 2119 keywords, mistura de "o quê" e "como".

**Não** use para: decidir o que construir (use `product-owner`), descobrir o processo de negócio (use `business-analyst`), escrever Gherkin (use `bdd-gherkin-authoring`).

## Modelo Mental — Pirâmide de Especificação

```text
            Product Owner (valor / ROI)
                       │
            Business Analyst (processo as-is / to-be)
                       │
         Analista de Requisitos (RF/RNF atômicos e testáveis)  ← VOCÊ
                       │
       Engenheiro de Requisitos (formalismo, IEEE 29148, rastreab.)
                       │
              Dev (BDD/ATDD/TDD)
```

O seu trabalho **começa depois** do "o quê construir" (PO) e do "por que e para quem" (BA) e **termina antes** do "como garantir rastreabilidade" (RE). Você entrega **entradas prontas** para a fase de BDD/SDD.

## Core Heurística — SMART-FN

Todo requisito que você escrever **deve** ser SMART-FN:

| Letra | Critério | Anti → Bom |
|-------|---------|-----------|
| **S** | Specific (sem ambiguidade) | "rápido" → "p95 ≤ 200ms em listagem de usuários" |
| **M** | Measurable (verificável) | "fácil de usar" → "task em ≤ 3 cliques" |
| **A** | Atomic (1 fato por requisito) | "deve permitir criar, listar e deletar" → REQ-001, REQ-002, REQ-003 separados |
| **R** | Realistic (viável) | "100k req/s em hardware de 2026" → "1k req/s single-instance" |
| **T** | Traceable (rastreável) | sem tag → `REQ-AUTH-01` linkando `.feature` e `*.e2e-spec.ts` |
| **FN** | Funcional vs Não-funcional | misturado → "RF: aceita X. RNF: resposta ≤ 200ms" |

## Classificação — RF vs RNF

| Tipo | Pergunta | Exemplo | Onde mora no projeto |
|------|---------|---------|----------------------|
| **RF (Requisito Funcional)** | "O que o sistema faz?" | "Login com e-mail+senha" | `features/<modulo>.feature` (BDD) → `.openspec/.../design.md` REQ-FN |
| **RNF (Requisito Não-funcional)** | "Como o sistema se comporta?" | "p95 ≤ 200ms, 100% LGPD" | `.openspec/.../design.md` REQ-NF (teste separado) |
| **Restrição** | "Que regra não dá pra negociar?" | "PostgreSQL 16, NestJS 11" | `AGENTS.md` §2 |

**RNF cobrem 8 categorias (ISO 25010)** — cite qual está cobrindo:

1. **Performance** — latência, throughput, capacidade
2. **Segurança** — autenticação, autorização, criptografia
3. **Disponibilidade** — uptime, MTBF, RTO/RPO
4. **Confiabilidade** — MTBF, taxa de defeitos
5. **Manutenibilidade** — modularidade, testabilidade
6. **Usabilidade** — tempo de aprendizado, taxa de erro
7. **Portabilidade** — browser, OS, dependências
8. **Compatibilidade** — co-existência, interoperabilidade

## Anatomia do artefato `.openspec/changes/<feature>/design.md`

```markdown
# <Feature> — Design (SDD)

## REQUISITOS FUNCIONAIS

- **REQ-<MOD>-01** [SHALL] O sistema **deve** permitir login via e-mail+senha.
  - BDD: `features/autenticacao.feature:Cenário: Login com credenciais válidas`
  - ATDD: `test/auth.e2e-spec.ts:cenario_login_sucesso`
  - TDD: `src/auth/application/services/auth.service.spec.ts:deve autenticar`

- **REQ-<MOD>-02** [SHALL] O sistema **deve** rejeitar login com senha errada retornando 401.
  - BDD: `features/autenticacao.feature:Cenário: Login com senha inválida`

## REQUISITOS NÃO-FUNCIONAIS

- **REQ-<MOD>-N01** [SHALL] A operação de login **deve** responder em p95 ≤ 200ms sob carga de 100 RPS.
  - Categoria: Performance (ISO 25010)
  - Verificação: teste de carga (k6/autocannon)

- **REQ-<MOD>-N02** [MUST] Senhas **devem** ser armazenadas com bcrypt cost ≥ 10.
  - Categoria: Segurança (ISO 25010)
  - Verificação: inspeção do `prisma/schema.prisma` + teste de hash
```

**Keywords RFC 2119 (use exatamente)**:

| Keyword | Significado |
|---------|-------------|
| **MUST** / **REQUIRED** / **SHALL** | Obrigatório |
| **MUST NOT** / **SHALL NOT** | Proibido |
| **SHOULD** / **RECOMMENDED** | Recomendado (exceções justificáveis) |
| **SHOULD NOT** / **NOT RECOMMENDED** | Não recomendado |
| **MAY** / **OPTIONAL** | Opcional |

## Quick Reference — Heurísticas de análise

| Pergunta | Resposta ideal |
|----------|---------------|
| É ambíguo? | Reescreva com verbo concreto + métrica + condição |
| Mistura 2 fatos? | Divida em REQ-01 e REQ-02 |
| Fala de tecnologia? | Troque por comportamento ("usa Redis" → "responde em ≤ X ms") |
| Não é testável? | Se não dá pra escrever um `it()`, não é requisito |
| Não é rastreável? | Adicione `BDD:` / `ATDD:` / `TDD:` linkando artefatos |
| Conflita com outro REQ? | Negocie com o Engenheiro de Requisitos e registre decisão |

## Regra dos "5 Porquês" (causa-raiz de requisitos vagos)

```text
"Login deve ser rápido"
  → Por quê? "Para não perder usuário"
    → Por quê? "Porque UX ruim gera churn"
      → Por quê? "Porque medimos NPS"
        → Por quê? "Meta de NPS ≥ 60"
          → REQ: "Login SHALL responder em p95 ≤ 200ms"
```

## Separação "O Quê" vs "Como" (crítico)

| Camada | O Quê (especificação) | Como (implementação) |
|--------|----------------------|----------------------|
| Requisito | "Login SHALL validar credenciais" | ~~"bcrypt + JWT"~~ ← implementação |
| Restrição | ~~"rápido"~~ | AGENTS.md §2: "JWT obrigatório" |

**Regra**: o `design.md` é **O QUÊ**. O código é **COMO**. Se você está escrevendo tecnologia no requisito, está virando arquiteto — pare e delegue.

## Common Mistakes

| ❌ Evite | ✅ Prefira |
|---------|-----------|
| "Sistema deve ser seguro" | "Senhas SHALL usar bcrypt cost ≥ 10 (REQ-NF-01)" |
| "API deve listar, criar, atualizar e deletar" | 4 requisitos REQ-01..04, cada um atômico |
| "Interface amigável" | "Operação crítica SHALL exigir confirmação em 2 cliques" |
| Misturar RF com RNF | "O sistema SHALL ... (RF)" + "Performance: p95 ≤ X (RNF)" |
| Verbo vago ("processar", "gerenciar") | Verbo concreto: criar, listar, validar, revogar, calcular |
| Sem RFC 2119 keyword | "**SHALL**", "**MUST**", "**SHOULD**" explícitos |
| Sem rastreabilidade | BDD/ATDD/TDD no corpo do requisito |

## Red Flags — pare e reescreva

- Requisito sem verbo concreto ("gerenciar", "tratar", "lidar com")
- 2+ "e" no mesmo requisito (deveriam ser 2 REQs)
- Requisito que só é verificável por inspeção de código (mova para RNF de manutenibilidade ou restrição)
- Requisito que começa com "Como..." (isso é user story, não requisito)
- Requisito sem `REQ-<MOD>-XX` ou sem link BDD/ATDD/TDD
- Mistura de "o que" e "como" (ex.: "deve usar Redis com TTL 600s")

## Connection com o workflow do projeto

| Fase DDD→BDD→SDD→ATDD→TDD | Sua entrega |
|---------------------------|-------------|
| **DDD** | (pré-requisito) — você recebe agregados/entidades |
| **BDD** | (pré-requisito) — você recebe cenários Gherkin |
| **SDD** | **SUA FASE** — `design.md` com REQ-FN e REQ-NF |
| **ATDD** | (saída) — `test/*.e2e-spec.ts` linkado nos REQ |
| **TDD** | (saída) — `src/**/*.spec.ts` linkado nos REQ |

## Reference

- Workflow SDD do projeto: [`.agent/workflows/sdd-workflow.md`](../../workflows/sdd-workflow.md)
- Regras OpenSpec: [`.openspec/AGENTS.md`](../../../.openspec/AGENTS.md)
- Estratégia de testes: [`.agent/docs/01-estrategia-testes.md`](../../docs/01-estrategia-testes.md)
- BDD Gherkin pt-BR: [`.agent/skills/bdd-gherkin-authoring/SKILL.md`](../bdd-gherkin-authoring/SKILL.md)
- IEEE 29148 — Systems and software engineering — Life cycle processes — Requirements engineering
- BABOK (IIBA) — Business Analysis Body of Knowledge
- IREB — CPRE Foundation (Requisitos)
- ISO/IEC 25010 — Systems and software Quality Requirements and Evaluation
