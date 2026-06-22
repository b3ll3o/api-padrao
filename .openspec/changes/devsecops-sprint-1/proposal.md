# DevSecOps Sprint 1 — HTTP Hardening — Proposal

> **Status**: [x] Draft / [ ] In Review / [ ] Approved / [ ] Implemented
> **Change ID**: `devsecops-sprint-1`
> **Data**: 2026-06-21
> **Relatório-fonte**: `.agent/agents/relatorio-devsecops-2026-06-16.md`
> **Relacionado**: `.openspec/changes/devsecops-sprint1-quick-wins/` (sprint
> anterior — Fase 1 já entregou trust-proxy + cache-control. Esta sprint
> foca nos 5 controles de HTTP hardening restantes.)

---

## Visão Geral

Este change implementa os **5 controles essenciais de segurança HTTP**
identificados na Ação 7 do plano DevSecOps, complementando o que já foi
entregue na sprint anterior (`devsecops-sprint1-quick-wins`):

| # | Controle | Status anterior | Este change |
|---|----------|-----------------|-------------|
| 1 | Helmet (security headers) | Já configurado | Mantém + novos e2e tests |
| 2 | CORS restritivo por env | Já configurado (ALLOWED_ORIGINS) | Mantém + novos e2e tests |
| 3 | Trust proxy | Já configurado (loopback) | Mantém + novos e2e tests |
| 4 | Body size limit ≤ 1MB | **Faltava** | **Adiciona bodyLimit=1MB** |
| 5 | CSRF guard | N/A (JWT-only) | **Documenta decisão** |

## Por que esta sprint existe

A auditoria DevSecOps identificou que a superfície HTTP da API carece de
controles de hardening defensivos. Embora boa parte do trabalho já tenha
sido entregue em `devsecops-sprint1-quick-wins`, dois itens ficaram
pendentes e precisam ser fechados:

1. **Body size limit**: sem hard cap em JSON bodies, atacante pode
   explorar DoS via memory exhaustion enviando payloads gigantes.
2. **CSRF**: precisa ser formalmente avaliado e a decisão (JWT-only,
   sem cookie de sessão) precisa estar documentada para que
   auditorias futuras não questionem.

## Escopo

### 1. Helmet — security headers
Mantém a configuração atual em `src/main.ts`:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (via CSP `frameAncestors: ['none']`)
- `Referrer-Policy: no-referrer` (helmet default)
- `X-DNS-Prefetch-Control: off` (helmet default)
- `Strict-Transport-Security: max-age=15552000; includeSubDomains` (HTTPS)
- `Content-Security-Policy: default-src 'self'` (strict em prod,
  permissiva em dev/test para Swagger UI).

### 2. CORS — restritivo por env
Mantém a configuração atual em `src/main.ts`:
- `NODE_ENV=production`: usa `ALLOWED_ORIGINS` (comma-separated).
  Se vazio → `false` (sem CORS).
- `NODE_ENV=development|test`: `origin: true` (reflete qualquer Origin,
  necessário para Swagger UI local).
- `credentials: true`
- `methods: GET, POST, PUT, PATCH, DELETE, OPTIONS`
- `allowedHeaders: Content-Type, Authorization, x-empresa-id, x-request-id`

### 3. Trust proxy — Fastify atrás de LB
Mantém a configuração atual em `src/main.ts`:
- Default `loopback` (apenas o primeiro hop).
- Override via env `TRUST_PROXY=true|loopback|<n>`.
- **Nunca** `trustProxy: true` em prod (IP spoofing).

### 4. Body size limit — 1 MB
**NOVO**: adicionado nesta sprint.
- Default: 1 MiB (1048576 bytes).
- Override via env `BODY_LIMIT_BYTES`.
- Fastify retorna 413 automaticamente quando excedido.

### 5. CSRF guard — JWT-only
**NÃO IMPLEMENTADO** — decisão documentada.
- A autenticação usa JWT via header `Authorization: Bearer <token>`.
- Não há cookies de sessão, logo CSRF não é vetor de ataque.
- Decisão em `design.md` (NFR-SEC-CSRF-001).

## Não-objetivos (out of scope)

- NÃO trocar autenticação de JWT.
- NÃO mexer em `src/auth/` (já implementado e coberto).
- NÃO introduzir cookies httpOnly.
- NÃO alterar `devsecops-sprint1-quick-wins/` (sprint anterior).

## Acceptance Criteria globais

- [ ] AC-S1-01: `npm run typecheck` passa
- [ ] AC-S1-02: `npm run lint` passa
- [ ] AC-S1-03: `npm run test` passa
- [ ] AC-S1-04: `npm run test:e2e` passa (incluindo novos security-headers tests)
- [ ] AC-S1-05: `curl -I http://localhost:3001/health/live` retorna
      `X-Content-Type-Options: nosniff` e `X-Frame-Options: DENY`
- [ ] AC-S1-06: decisão sobre CSRF documentada no design.md
- [ ] AC-S1-07: nenhum teste e2e existente quebrou

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Body limit quebrar endpoint legítimo | Override via `BODY_LIMIT_BYTES` env. Hoje nenhum endpoint legítimo > 1MB. |
| Testes e2e dependem de CORS permissivo | Em test (`NODE_ENV=test`) CORS é permissivo (origin: true). Sem impacto. |
| HSTS só ativa em HTTPS | Em dev/test não aplica; em prod atrás de LB, sim. Documentado. |

## Rastreabilidade

Cada arquivo de produção DEVE ter cabeçalho com:
```typescript
// BDD: features/devsecops-sprint-1.feature
// SDD: .openspec/changes/devsecops-sprint-1/design.md
// ATDD: test/security-headers.e2e-spec.ts
// TDD: src/main.spec.ts
```

## Status

- [x] Draft (este documento)
- [ ] In Review
- [ ] Approved
- [ ] Implemented
- [ ] Archived
