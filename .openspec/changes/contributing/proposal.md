# Contributing Guide (CONTRIBUTING.md)

## Why

Item **SUG-004** do relatório de varredura do repositório. O projeto já tem um
workflow DDD→BDD→SDD→ATDD→TDD documentado em [`/AGENTS.md`](../../../AGENTS.md) §6,
mas não há um **guia prático de contributor** na raiz (`CONTRIBUTING.md`) que
guie um dev novo (humano ou IA) pelo passo-a-passo de "como adicionar um
endpoint". O resultado atual é:

- Workflow descrito, mas espalhado entre `AGENTS.md`, `.openspec/AGENTS.md` e
  `.agent/workflows/*`.
- Novos colaboradores (especialmente agentes de IA) tendem a pular fases
  (ir direto para o código) — principal causa de retrabalho.
- Falta um checklist operacional único que consolide o pipeline SDD+ATDD com
  convenções de código, segurança, auditoria e PR.

Este change entrega um `CONTRIBUTING.md` enxuto e prescritivo que serve como
**porta de entrada** para contribuição, referenciando o `AGENTS.md` para
detalhes profundos.

## What Changes

- **NOVO** arquivo `/CONTRIBUTING.md` na raiz do repositório com:
  - TL;DR do workflow DDD→BDD→SDD→ATDD→TDD (10 passos numerados).
  - Pré-requisitos.
  - Workflow detalhado em **9 fases** (Fase 0 a Fase 8).
  - Convenções de código (naming, estrutura de módulo, imports).
  - Comandos úteis.
  - Lista do que **NÃO** fazer.
  - Onde pedir ajuda.
- **NOVO** arquivo `.openspec/changes/contributing/proposal.md` (este).
- **NÃO altera** `AGENTS.md`, `.openspec/AGENTS.md`, READMEs de módulo ou
  código de produção.

## Impact

- **Risco**: zero — é um change puramente documental, sem código de produção.
- **Compatibilidade**: 100% — apenas adiciona dois arquivos novos.
- **Público-alvo**: novos contribuidores (humanos e IA), revisores, e
  ferramentas de onboarding.
- **Manutenção**: enquanto `AGENTS.md` §6 (workflow) e `.openspec/AGENTS.md`
  (formato de spec) não mudarem, o `CONTRIBUTING.md` permanece válido.
  Mudanças nessas fontes devem ser propagadas para o `CONTRIBUTING.md`.

## Risks

- **Nenhum risco técnico**: nenhum código, nenhuma migração, nenhum contrato
  de API alterado.
- **Risco de drift documental (baixo)**: se o workflow em `AGENTS.md` §6
  evoluir, o `CONTRIBUTING.md` pode ficar desatualizado. Mitigação: o
  `CONTRIBUTING.md` referencia o `AGENTS.md` em vez de duplicar detalhes
  profundos, reduzindo o acoplamento.
- **Risco de excesso de prescrição (baixo)**: um guia muito opinativo pode
  assustar contribuidores. Mitigação: o TL;DR é curto, o "O que NÃO fazer"
  lista casos óbvios, e cada fase termina com critérios de aceitação
  verificáveis (checklist).

## Out of Scope

- Adicionar workflows automatizados (lint, CI) — já cobertos por
  `.agent/workflows/*` e `package.json`.
- Reescrever `AGENTS.md` §6 — fora do escopo deste change.
- Tradução do guia para outros idiomas — versionamento único em pt-BR.
