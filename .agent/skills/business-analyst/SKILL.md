---
name: business-analyst
description: Use when bridging business needs with technical specifications — applies when mapping current/future state (as-is/to-be), analyzing processes, doing stakeholder analysis, cost-benefit analysis, or translating business rules into features. Triggers on "processo de negócio", "stakeholder", "mapa de processos", "ROI", "análise de impacto", or when defining acceptance criteria from a business perspective.
last_updated: 2026-06-15
reviewer: analista-requisitos
---

# Business Analyst (BA)

Como **unir necessidades de negócio com a solução técnica**, focando em processos, stakeholders e definição de solução. Use quando for **analisar/mapper processos** ou **definir critérios de aceitação** sob a perspectiva de negócio.

## When to Use

Sintomas: "qual o processo atual?", "quem é o stakeholder?", "qual o ROI?", "como o usuário faz hoje?", "as-is vs to-be", "critério de aceite de negócio".

**Não** use para: escrever RF/RNF atômicos (use `analista-requisitos`), priorizar backlog (use `product-owner`), formalizar IEEE 29148 (use `engenheiro-requisitos`).

## Modelo Mental — As-Is / To-Be

```text
        AS-IS (estado atual)              TO-BE (estado futuro)
   ┌──────────────────────────┐      ┌──────────────────────────┐
   │ Stakeholders             │      │ Stakeholders             │
   │ • Quem é afetado?        │ ───► │ • Quem ganha? Quem perde?│
   │ • Que processo executam? │      │ • Que processo novo?     │
   │ • Que dor têm?           │      │ • Que dor eliminamos?    │
   └──────────────────────────┘      └──────────────────────────┘
              │                                  │
              ▼                                  ▼
        GAPS = requisitos do projeto
```

Seu trabalho é **mapear o gap** entre o estado atual e o estado futuro, identificando processos, atores e regras que a feature precisa atender.

## Core Heurística — 6 Áreas BABOK (resumo)

| Área | Pergunta de ouro | Artefato típico |
|------|------------------|-----------------|
| **Planejamento e monitoramento de BA** | "Qual abordagem de análise?" | Plano de BA |
| **Elicitação e colaboração** | "Como descobrir o que o stakeholder quer?" | Workshop, entrevista, JAD |
| **Gestão do ciclo de vida dos requisitos** | "Como rastrear do início ao fim?" | Matriz de rastreabilidade |
| **Análise de estratégia** | "Qual o estado atual e o futuro?" | Mapa as-is / to-be |
| **Análise de requisitos e definição de solução** | "Qual a melhor forma de resolver?" | Documento de definição de solução |
| **Avaliação de solução** | "A solução entregue resolve o problema?" | Relatório de validação |

## Stakeholder Analysis — Matriz Poder × Interesse

```text
              ALTO interesse
                    │
   MANTER           │         GERENCIAR DE PERTO
   SATISFEITO       │         (engajar)
   (informar)       │
                    │
─ BAIXO poder ──────┼──────── ALTO poder
                    │
   MONITORAR        │         MANTER SATISFEITO
   (mínimo)         │         (esforço alto)
                    │
              BAIXO interesse
```

**Para o api-padrao:**

| Stakeholder | Poder | Interesse | Estratégia |
|-------------|-------|-----------|-----------|
| Admin da empresa | Alto | Alto | Engajar de perto — participa de Definition of Done |
| Usuário final | Baixo | Alto | Manter satisfeito — user stories e BDD |
| Equipe de dev | Alto | Alto | Engajar — é quem implementa |
| Auditor/LGPD | Médio | Baixo | Monitorar — registro de auditoria |

## Análise de Processo — BPMN simplificado

Para cada processo relevante, capture:

```text
ATOR      AÇÃO                  SISTEMA             DECISÃO
User   →  POST /auth/login   →  Valida credenciais →  Válido?
                                                ├─ Sim → Gera JWT (200)
                                                └─ Não → 401
```

**Perguntas obrigatórias**:
- Quem inicia o processo? (trigger)
- Que passos manuais existem? (candidatos a automação)
- Que dados são trocados? (entrada/saída)
- Que exceções podem ocorrer? (ramos do fluxograma)
- Qual a SLA? (tempo aceitável)

## Análise de Custo-Benefício (CBA)

Toda feature nova deve ter CBA mínimo:

| Item | Valor |
|------|-------|
| **Custo de desenvolvimento** | X dias × Y/dia |
| **Custo de manutenção anual** | ~20% do desenvolvimento |
| **Benefício tangível** | R$ economizado ou R$ gerado/ano |
| **Benefício intangível** | NPS, retenção, marca |
| **ROI** | (Benefício - Custo) / Custo |
| **Payback** | Custo / Benefício mensal |

**Regra de ouro**: se ROI < 0 ou payback > 24 meses, repriorize ou descarte.

## Definition of Done (DoD) — Perspectiva de Negócio

| Critério | Quem valida |
|----------|-------------|
| Todos os RF cobertos por cenários BDD | PO + QA |
| RNF medidos (latência, throughput) | QA |
| Critérios de aceite do stakeholder atendidos | Stakeholder |
| Dados migrados/limpos se aplicável | PO |
| Treinamento/docs do usuário prontos | PO |
| Auditoria/LGPD compliance verificado | DPO + QA |

## Quick Reference — Heurísticas

| Pergunta | Resposta |
|----------|----------|
| "É problema de negócio ou de sistema?" | Se muda o processo, é negócio. Se muda o desempenho, é sistema. |
| "Quem ganha com isso?" | Se ninguém, é nice-to-have. Reavaliar. |
| "Como era antes?" | Mapeie as-is. Se não tem as-is, há premissa escondida. |
| "Como saberemos que deu certo?" | KPI + métrica. Sem métrica, sem sucesso. |
| "Quem pode bloquear?" | Liste stakeholders com poder. Engaje-os cedo. |

## Critérios de Aceite (AC) — formato Given-When-Then (negócio)

Diferente do BDD técnico, o AC de negócio é **em linguagem do stakeholder**:

```text
AC-NNN: <descrição do comportamento de negócio>

Cenário: <título em linguagem de negócio>
  Dado que <contexto de negócio>
  Quando <ação do ator de negócio>
  Então <resultado de negócio observável>
```

**Exemplo (api-padrao — auth)**:
```text
AC-001: Administrador pode revogar acesso de ex-funcionário

Cenário: Admin desativa usuário da empresa
  Dado que existe um usuário ativo "joao@empresa.com" na empresa X
  E ele tem perfil "Vendedor" com permissão "READ_PRODUTOS"
  Quando o admin da empresa X marca "joao@empresa.com" como inativo
  Então nas próximas requisições, "joao@empresa.com" recebe 401
  E a lista de usuários da empresa X não inclui mais "joao@empresa.com"
```

## Common Mistakes

| ❌ Evite | ✅ Prefira |
|---------|-----------|
| Pular o as-is e ir direto pra solução | Mapear processo atual, identificar gap |
| Documentar sem envolver o stakeholder | Workshops, entrevistas, observação |
| Aceitar "deve funcionar" como AC | AC deve ter ação + resultado observável |
| Ignorar impacto em outros processos | Diagrama de processos com setas cruzadas |
| Focar só em feature, esquecer LGPD/segurança | Mapeie restrições regulatórias (REQ-NF) |
| Stakeholder único = viés | Mínimo 2-3 stakeholders, preferencialmente 1 oposto |

## Stakeholder Oposto (sempre inclua)

Toda análise deve ouvir **pelo menos 1 stakeholder que perde** com a mudança. Razão: ele revela riscos que os "ganhadores" omitem.

| Cenário | Stakeholder oposto típico |
|---------|---------------------------|
| Login social | Equipe de segurança (argumento: vetor de ataque) |
| Compartilhamento de documentos | Equipe de compliance (argumento: vazamento) |
| API pública | Equipe de infra (argumento: rate limit, custo) |

## Conexão com o workflow do projeto

| Fase | Sua contribuição |
|------|-----------------|
| **DDD** | Mapear bounded contexts e agregados (linguagem ubíqua) |
| **BDD** | Critérios de aceite de negócio (AC) em pt-BR |
| **SDD** | Restrições de negócio que viram REQ-NF (LGPD, SLA) |
| **ATDD** | Aprovar critérios de aceite antes do "go" |
| **Pós-implementação** | Validar KPI/ROI com stakeholder |

## Red Flags — pare e reescreva

- Solução proposta sem mapear o problema antes
- "Stakeholder pediu X" sem dizer **por quê** pediu
- AC sem resultado observável ("deve funcionar" / "deve ser bom")
- Análise de impacto só na feature, não nos processos adjacentes
- Stakeholder único validando (precisa de pelo menos 1 oposto)
- Sem KPI/métrica de sucesso

## Reference

- BABOK v3 — IIBA: 6 knowledge areas, 50 técnicas
- PMI-PBA — Professional in Business Analysis
- CBAP — Certified Business Analysis Professional (IIBA)
- Workflow SDD: [`.agent/workflows/sdd-workflow.md`](../../workflows/sdd-workflow.md)
- Estratégia de testes: [`.agent/docs/01-estrategia-testes.md`](../../docs/01-estrategia-testes.md)
- BDD Gherkin: [`.agent/skills/bdd-gherkin-authoring/SKILL.md`](../bdd-gherkin-authoring/SKILL.md)
- Analista de Requisitos: [`.agent/skills/analista-requisitos/SKILL.md`](../analista-requisitos/SKILL.md)
- Engenheiro de Requisitos: [`.agent/skills/engenheiro-requisitos/SKILL.md`](../engenheiro-requisitos/SKILL.md)
- Product Owner: [`.agent/skills/product-owner/SKILL.md`](../product-owner/SKILL.md)
