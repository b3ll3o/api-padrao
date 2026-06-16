# DevSecOps Sprint 1 — Quick Wins — Proposal

> **Status**: [x] Draft / [ ] Proposed / [ ] Approved / [ ] Implemented / [ ] Archived
> **Change ID**: `devsecops-sprint1-quick-wins`
> **Data**: 2026-06-16
> **Autor**: `analista-dev-sec-ops` (v1)
> **Relatório-fonte**: [.agent/agents/relatorio-devsecops-2026-06-16.md](../../../.agent/agents/relatorio-devsecops-2026-06-16.md)

## Overview

Este change implementa os **7 quick wins de segurança** identificados na varredura
DevSecOps de 2026-06-16. Cada item é um hardening incremental que fecha
achados ALTO/MÉDIO com baixo risco de regressão.

A entrega é organizada em **3 sub-themes** (HTTP, SDLC, App) consolidados
neste único change para reduzir cerimônia, mantendo **independência de merge**
entre as fases.

## Problem Statement

A API `api-padrao` tem fundamentos de segurança fortes (Helmet, Throttler,
JWT+RBAC, Bcrypt, Audit Log), mas a varredura DevSecOps de 2026-06-16
identificou 29 gaps, sendo **3 ALTO** e **17 MÉDIO**. Desses, **7 itens
podem ser fechados em ~12h de trabalho** com risco mínimo de regressão,
eliminando 4 ALTO e 5 MÉDIO em uma única sprint.

## Motivation

- **Risco atual**: trust proxy não configurado corrompe throttler, login
  history e audit log; sem SAST/secret-scan em CI estamos cegos a
  vulnerabilidades em código próprio.
- **Compliance**: SAST e secret scan são pré-requisitos para SAMM L3,
  SOC 2 e SLSA L2.
- **DX**: `.env` com `POSTGRES_PASSWORD=postgres` em `.env.example` é um
  anti-pattern de segurança ensinada pelo exemplo errado.
- **Custo/benefício**: 12h de trabalho fecha 9 achados (3 ALTO + 5 MÉDIO
  + 1 BAIXO).

## Stakeholders

- [x] Equipe de backend (NestJS/Prisma) — implementação
- [x] Equipe de DevOps/SRE — revisão de CI e config
- [x] Usuários finais — benefício indireto (menos superfície de ataque)
- [x] Auditoria/compliance (futuro) — evidência de SAMM L2/L3

## Initial Estimate

- **Effort**: 12 horas (~1.5 dias úteis)
- **Sprint**: 1 (Quick wins)
- **Fases**: 3 (HTTP, SDLC, App)

## Scope (in)

7 itens do relatório, distribuídos em 3 fases:

| Fase | Achado | Sev | Título | Esforço |
|------|--------|-----|--------|---------|
| HTTP | IAM-02/CODE-01 | 🔴 ALTO | Trust proxy no Fastify | 1h |
| HTTP | CODE-07 | 🟢 BAIXO | Cache-Control: no-store em responses sensíveis | 2h |
| SDLC | SDLC-01 | 🟡 MÉDIO | Semgrep em CI (SAST) | 4h |
| SDLC | SDLC-03 | 🟡 MÉDIO | Gitleaks em CI (secret scan) | 1h |
| App | CODE-04 | 🟡 MÉDIO | Audit interceptor captura `query`/`params` | 2h |
| App | INFRA-01 | 🟡 MÉDIO | `.env` com secret random + warning de default | 30min |
| App | CODE-03 | 🟡 MÉDIO | Gate `/health/network` (apenas dev) | 1h |

**Total**: 11.5h (~1.5 dia útil, com margem para revisão/testes).

## Scope (out)

Explicitamente **fora** deste change:

- **MFA** (IAM-01) — Sprint 2
- **Plano-based throttling completo** (DETECT-01) — Sprint 2
- **JWT revocation list** (IAM-07) — Sprint 2
- **Threat model documentado** (GOV-02) — Sprint 3
- **`SECURITY.md`** (GOV-01) — Sprint 3
- **Encryption at-rest** (DATA-01) — Sprint 3 (requer decisão de cloud)
- **Image scan / SBOM / cosign** (SDLC-04/05/06) — Sprint 3
- **MFA** e todos os demais ALTO/MÉDIO remanescentes — sprints futuras

## Risks

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|-------|---------------|---------|-----------|
| R1 | Trust proxy mal configurado vaza IP real em logs | Baixa | Médio | Documentar `TRUST_PROXY` env var; default seguro `loopback`; testar com X-Forwarded-For forjado |
| R2 | `Cache-Control: no-store` quebra cache corporativo/CDN | Baixa | Baixo | Aplicar SÓ em rotas sensíveis (`/auth/*`, `/usuarios/*`, etc); documentar em AGENTS.md |
| R3 | Semgrep gera ruído em PRs existentes (F+) | Média | Médio | Baseline em `.semgrep.yml`; rules conservador (`p/typescript` + `p/security-audit`); rodar primeiro em modo `audit` e promover para gate depois |
| R4 | Gitleaks tem F+ em fixtures/tests | Baixa | Baixo | `.gitleaks.toml` com allowlist em `test/`, `.env.example`, `*.spec.ts` |
| R5 | Audit interceptor agora captura `query`/`params` — pode logar PII (email em query) | Média | Médio | Reaproveitar `sanitizeBody` para `query`/`params`; lista de chaves sensíveis: `email`, `senha`, `password`, `token`, `secret`, `cpf`, `cnpj` |
| R6 | `.env` com secret random quebra setup de devs novos | Média | Baixo | Manter `.env.example` com placeholders; adicionar `.env.dev` template documentado; `README.md` atualizado |
| R7 | `/health/network` removido quebra healthcheck de LB | Baixa | Baixo | Gatear por `NODE_ENV !== 'production'` em vez de remover; documentar em AGENTS.md |
| R8 | CI mais lento com Semgrep + Gitleaks | Baixa | Baixo | Rodar em paralelo (matrix); usar Docker images pré-built; budget 2 min para security |
| R9 | Mudanças no `.env` exemplo confundem devs | Baixa | Baixo | Adicionar `.env.dev` template + seção em CONTRIBUTING.md |

## Dependencies

- **Internas**: nenhuma — todas as 7 mudanças são isoladas
- **Externas**: GitHub Actions (já usado), Docker (já usado)
- **Novas ferramentas**: Semgrep (`returntocorp/semgrep`), Gitleaks (`gitleaks/gitleaks-action`)

## Alternatives Considered

### Alternativa A — 3 changes separados em OpenSpec

**Pro**: rollback granular, merge independente por tema
**Contra**: 3x cerimônia (proposal/design/tasks), 3 PRs
**Decisão**: rejeitada para reduzir overhead; fases dentro do change
podem ser mergeadas em PRs separados se desejado

### Alternativa B — 7 changes separados (1 por achado)

**Pro**: máxima granularidade
**Contra**: 7x cerimônia, overkill para quick wins
**Decisão**: rejeitada

### Alternativa C — 1 PR monolítico

**Pro**: simples
**Contra**: PR grande (>500 linhas), difícil de revisar
**Decisão**: rejeitada — 3 PRs por fase é o sweet spot

## Approval

- [ ] Tech lead backend
- [ ] SRE/DevOps
- [ ] Security champion (analista-dev-sec-ops)

## Status

- [x] Draft (este documento)
- [ ] Proposed (após revisão do design.md)
- [ ] Approved
- [ ] Implemented
- [ ] Archived (mover para `.openspec/specs/devsecops-sprint1-quick-wins/`)
