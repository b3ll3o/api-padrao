---
name: product-owner
description: Use when defining, prioritizing, or refining user stories, managing product backlog, doing sprint planning, or making value/ROI decisions — applies when creating INVEST user stories, writing acceptance criteria from a user perspective, ordering backlog by value vs effort, applying WSJF/MoSCoW/Kano prioritization, or splitting epics into stories. Triggers on "backlog", "MVP", "priorizar", "user story", "próxima sprint", "release planning".
last_updated: 2026-06-15
reviewer: analista-requisitos
---

# Product Owner (PO)

Como **definir, priorizar e refinar** o que entra em cada ciclo, focando em **valor de negócio e ROI**. Use quando for **criar/ordenar/refinar** o backlog ou **decidir o que entra/sai** de uma sprint/release.

## When to Use

Sintomas: "qual a próxima feature?", "está no backlog?", "MVP", "qual o valor disso?", "invest em user story", "pode entrar na sprint?", "saiu do escopo?".

**Não** use para: escrever os RF/RNF (use `analista-requisitos`), descobrir processo de negócio (use `business-analyst`), garantir rastreabilidade (use `engenheiro-requisitos`).

## Modelo Mental — O Quê e Por Quê (não o Como)

```text
       Product Owner                      Time (Dev)
   ┌──────────────────────┐          ┌──────────────────────┐
   │ • O QUÊ construir    │          │ • COMO construir     │
   │ • POR QUÊ            │ ───────► │ • QUANTO cabe na     │
   │ • EM QUE ORDEM       │          │   sprint (capacity)  │
   │ • VALOR esperado     │          │ • Definition of Done │
   └──────────────────────┘          └──────────────────────┘
              │                                 │
              └────── backlog ordenado ──────────┘
```

> **Regra de ouro**: o PO decide **o quê** e **por quê**. O time decide **como** e **quanto cabe**.

## Core Heurística — INVEST para User Stories

Toda user story **deve** ser INVEST:

| Letra | Critério | Anti → Bom |
|-------|---------|-----------|
| **I** | Independent (independente) | depende de "criar empresa" → quebrar em 2 stories |
| **N** | Negotiable (negociável) | "deve fazer X, Y, Z fixos" → deixar flexível |
| **V** | Valuable (valiosa) | "mudar cor do botão" → "destacar CTA aumenta conversão" |
| **E** | Estimable (estimável) | "integrar com X" sem docs → spike primeiro |
| **S** | Small (pequena) | 13 pontos → quebrar (Fibonacci: 1, 2, 3, 5, 8, 13+) |
| **T** | Testable (testável) | "rápido" → "responde em ≤ 200ms" |

## Anatomia da User Story

```text
US-XXX: <título em linguagem de usuário>

Como <ator/role>,
Quero <ação/desejo>,
Para que <benefício/valor>.

Critérios de Aceitação (AC):
  AC-1: <condição verificável em Given-When-Then>
  AC-2: <condição verificável>
  AC-3: <condição de borda ou exceção>

Prioridade: <Alta | Média | Baixa>
Story Points: <1 | 2 | 3 | 5 | 8 | 13 | ?>
Valor de negócio: <R$ | conversão | churn | NPS | risco>
Dependências: <US-YYY, épico ZZZ>
```

**Exemplo (api-padrao — auth)**:
```text
US-001: Login com e-mail e senha

Como usuário do sistema,
Quero me autenticar com e-mail e senha,
Para que eu acesse as funcionalidades protegidas da minha empresa.

Critérios de Aceitação:
  AC-1: POST /auth/login com credenciais válidas retorna 201 + access_token
  AC-2: POST /auth/login com senha errada retorna 401 (sem distinção "user não existe" vs "senha errada")
  AC-3: 5 tentativas em 1 minuto disparam rate limit (tier sensitive)
  AC-4: Resposta inclui refresh_token válido por 7 dias
  AC-5: Audit log registra "LOGIN_SUCCESS" com userId, empresaId, IP

Prioridade: Alta
Story Points: 5
Valor: Habilita todo o resto do produto
Dependências: —
```

## Refinamento de Backlog (Refinement/Grooming)

O PO continuamente:

```text
   ──────────────────────────────────────────────────
   Topo do backlog (próximas sprints)               ✅ Detalhado
                                                     ✅ Estimado
                                                     ✅ AC escritos
                                                     ✅ Sem impedimentos
   ──────────────────────────────────────────────────
   Meio (próximas 2-4 sprints)                       ⚠️ Esboço
                                                     ⚠️ Estimado
   ──────────────────────────────────────────────────
   Fundo (futuro)                                    ❌ Pode ser vago
   ──────────────────────────────────────────────────
```

**Regra 60/30/10** (orientativa):
- 60% do backlog: refinado e pronto
- 30%: rascunho com prioridade
- 10%: ideias a explorar

## Técnicas de Priorização

### WSJF (Weighted Shortest Job First) — SAFe

```text
WSJF = (Business Value + Time Criticality + Risk Reduction) / Job Size
```

| Item | BV | TC | RR | Size | WSJF |
|------|----|----|----|------|------|
| Login social | 8 | 10 | 5 | 5 | 4.6 |
| 2FA | 13 | 8 | 8 | 8 | 3.6 |
| Recuperação de senha | 8 | 5 | 3 | 3 | 5.3 |

**Maior WSJF → prioridade**. "Recuperação de senha" entra primeiro.

### MoSCoW

| Letra | Significado | Exemplo |
|-------|-------------|---------|
| **M**ust | Obrigatório (sem isso, não release) | Login funcional |
| **S**hould | Importante (entrega se possível) | "Lembrar de mim" |
| **C**ould | Desejável (se sobrar tempo) | Login social Google |
| **W**on't (this release) | Fora deste release (explícito) | SSO SAML |

### Kano (satisfação do usuário)

| Tipo | Quando entregue | Quando ausente |
|------|-----------------|----------------|
| **Básico** | Não impressiona | Frustra muito |
| **Performance** | Mais = melhor | Menos = pior |
| **Excitação** | Surpreende | Ninguém nota |

## Definition of Done (DoD) — Perspectiva PO

| Critério | Quem valida |
|----------|-------------|
| User story cumpre todos os AC | QA + PO |
| Testes automatizados cobrindo AC | QA |
| Documentação do usuário atualizada | PO |
| Métrica de valor instrumentada | Dev + PO |
| Stakeholder aprovou (se for o caso) | Stakeholder |
| Métrica de valor medida pós-release | PO (30 dias) |

## MVP (Minimum Viable Product)

Pergunte para **cada feature**:

```text
1. Qual o valor mínimo testável? (lean)
2. O que pode ser cortado sem perder o teste da hipótese?
3. Qual o ciclo de feedback mais curto?
```

**Anti-patterns**:

| ❌ Evite | ✅ Prefira |
|---------|-----------|
| "MVP é o sistema todo" | MVP é o menor experimento que valida a hipótese |
| Adiar tudo que é "nice-to-have" | Some, mas planeje explicitamente para próximo release |
| Cortar AC obrigatórios | Cortar AC desejáveis |
| "Mínimo" = qualidade baixa | "Mínimo" = escopo mínimo, qualidade alta |

## Quick Reference — Heurísticas

| Pergunta | Resposta |
|----------|----------|
| "Entra na sprint?" | Cabe no capacity + alta prioridade + sem impedimentos |
| "Quebra ou merge?" | Se independente e small, quebra. Se não dá, épico. |
| "Posso cortar AC?" | MoSCoW — corte "Could" antes de "Should" antes de "Must" |
| "Quem decide?" | PO decide valor/ordem. Time decide como/quanto. |
| "Saiu do escopo?" | Marque como `Won't (this release)`, registre motivo |
| "Qual o valor?" | Se não consegue medir, é nice-to-have. Questionar. |

## Métricas de Valor (para fechar o ciclo)

| Métrica | Quando | Quem mede |
|---------|--------|-----------|
| Adoção | Após 7 dias | Analytics |
| Retenção (D7, D30) | Após 30 dias | Analytics + PO |
| NPS | Após 30 dias | Pesquisa |
| Conversão | Imediato (se aplicável) | Analytics |
| Redução de chamados | Contínuo | Suporte |
| ROI/CBA | Anual | PO + Financeiro |

**Regra**: se a feature foi entregue, mas a métrica de valor **nunca** foi olhada, o PO falhou.

## Common Mistakes

| ❌ Evite | ✅ Prefira |
|---------|-----------|
| "Time, façam o que quiserem" | PO presente, backlog refinado, priorização clara |
| Aceitar user story > 8 pontos | Quebrar em stories menores (spike se preciso) |
| "Tudo é Must" | MoSCoW — força trade-off explícito |
| Cortar teste pra "ir mais rápido" | DoD inclui teste automatizado. Sempre. |
| Decidir **como** implementar | PO decide o quê, time decide o como |
| Validar "está pronto" sem ver o usuário | Métrica de valor precisa ser medida |
| Trocar prioridades a meio de sprint | Sprint em curso é imutável (anti-pattern) |
| Backlog sem refinar | Refinamento contínuo (60/30/10) |

## Stakeholders e Comunicação

| Com quem | Frequência | O que comunicar |
|----------|-----------|-----------------|
| Time (dev) | Diário/Refinamento | Backlog refinado, AC claros |
| PO ↔ Stakeholder | Semanal | Roadmap, priorização, valor entregue |
| PO ↔ PMO | Mensal | Status, blockers, mudanças de prioridade |
| PO ↔ Cliente | Contínuo (feedback) | Hipóteses, validação, próximos releases |

## Conexão com o workflow do projeto

| Fase | Sua contribuição |
|------|-----------------|
| **DDD** | Definir bounded contexts por valor de negócio |
| **BDD** | Validar cenários Gherkin do ponto de vista do usuário |
| **SDD** | Aprovar Change Requests (CR) e manter baseline |
| **ATDD** | Aprovar critérios de aceite antes do "go" |
| **Pós-release** | Medir métrica de valor, decidir continue/pivot/stop |

## Red Flags — pare e investigue

- User story sem "Como/Quero/Para que" (não é user story, é tarefa técnica)
- Story > 8 pontos (quebrar)
- "Should" virou "Must" sem justificativa
- PO ausente do refinement
- Backlog com 90% de itens "vagos" (refinamento não está acontecendo)
- Métrica de valor nunca foi olhada pós-release
- Time define prioridade (está virando "feature team" sem PO real)

## Reference

- Scrum Guide — Ken Schwaber & Jeff Sutherland
- SAFe — WSJF, Program Increment Planning
- Roman Pichler — Product Owner Best Practices
- Mike Cohn — User Stories Applied (livro)
- INVEST — Bill Wake
- MoSCoW — Dai Clegg
- Kano Model — Noriaki Kano
- BABOK (IIBA) — Strategy Analysis Knowledge Area
- Analista de Requisitos: [`.agent/skills/analista-requisitos/SKILL.md`](../analista-requisitos/SKILL.md)
- Business Analyst: [`.agent/skills/business-analyst/SKILL.md`](../business-analyst/SKILL.md)
- Engenheiro de Requisitos: [`.agent/skills/engenheiro-requisitos/SKILL.md`](../engenheiro-requisitos/SKILL.md)
- BDD Gherkin pt-BR: [`.agent/skills/bdd-gherkin-authoring/SKILL.md`](../bdd-gherkin-authoring/SKILL.md)
