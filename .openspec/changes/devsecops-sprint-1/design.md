# DevSecOps Sprint 1 — HTTP Hardening — Design Specification

> **Status**: [x] Draft / [ ] In Review / [ ] Approved / [ ] Implemented
> **Change ID**: `devsecops-sprint-1`
> **Data**: 2026-06-21
> **Especificação-fonte**: [proposal.md](./proposal.md)
> **Complementa**: [../devsecops-sprint1-quick-wins/](../devsecops-sprint1-quick-wins/)
> (sprint anterior já entregou trust-proxy + cache-control)

---

## Visão Geral

Este design detalha os **5 controles de segurança HTTP** que faltavam
após `devsecops-sprint1-quick-wins`. A maioria é uma documentação
formal do que já está em produção; o único delta real é o **body limit
de 1MB** + **e2e tests** + **decisão formal sobre CSRF**.

---

## FR-HTTP-01: Helmet — Security Headers

### Overview

`@fastify/helmet` é registrado em `src/main.ts:65` com configuração
diferenciada por `NODE_ENV`:

- **Produção**: CSP strict (`scriptSrc: 'self'`, sem `'unsafe-inline'`).
- **Dev/Test**: CSP permissiva (`scriptSrc: 'self' 'unsafe-inline'`)
  para que o Swagger UI funcione sem nonce.

### Requirements (RFC 2119)

- **MUST** incluir os seguintes headers em TODA response:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: no-referrer`
  - `X-DNS-Prefetch-Control: off`
- **MUST** incluir `Strict-Transport-Security` quando `req.secure === true`
  (HTTPS — apenas relevante atrás de LB com TLS termination).
- **MUST** incluir `Content-Security-Policy` em toda response.
- **MUST NOT** aplicar `'unsafe-inline'` em `scriptSrc` em produção.
- **SHOULD** desabilitar `crossOriginEmbedderPolicy` apenas se Swagger UI
  for necessário (não é o caso aqui — Swagger está desabilitado em prod).

**CWE**: CWE-693 (Protection Mechanism Failure)
**OWASP**: A05 (Security Misconfiguration)
**Mitigação**: [#HTTP-01] do relatório DevSecOps.

### Acceptance Criteria

- [ ] AC-HTTP-01: `GET /health/live` retorna `X-Content-Type-Options: nosniff`
- [ ] AC-HTTP-02: `GET /health/live` retorna `X-Frame-Options: DENY`
- [ ] AC-HTTP-03: `GET /health/live` retorna `Referrer-Policy: no-referrer`
- [ ] AC-HTTP-04: `GET /health/live` retorna `X-DNS-Prefetch-Control: off`
- [ ] AC-HTTP-05: `GET /health/live` retorna `Content-Security-Policy` com `default-src 'self'`

### Configuração atual

Ver `src/main.ts:65-92` (registro do helmet com CSP condicional).

---

## FR-HTTP-02: CORS — Restritivo por Ambiente

### Overview

NestJS `app.enableCors()` é chamado em `src/main.ts:95-107` com origem
dinâmica baseada em `NODE_ENV`.

### Requirements (RFC 2119)

- **MUST** usar `ALLOWED_ORIGINS` (comma-separated) em produção. Se a env
  var estiver ausente OU vazia, `origin: false` (CORS desabilitado).
- **MUST** usar `origin: true` em dev/test (reflete o Origin da request).
- **MUST** incluir `credentials: true` (necessário para cookies httpOnly
  futuros; não tem efeito adverso com JWT).
- **MUST** permitir métodos `GET, POST, PUT, PATCH, DELETE, OPTIONS`.
- **MUST** permitir headers `Content-Type, Authorization, x-empresa-id,
  x-request-id`.

**CWE**: CWE-942 (Permissive Cross-domain Policy)
**OWASP**: A05
**Mitigação**: [#HTTP-02] do relatório DevSecOps.

### Acceptance Criteria

- [ ] AC-HTTP-06: em dev/test, `OPTIONS /auth/login` com `Origin:
      http://localhost:4200` retorna 204 com `Access-Control-Allow-Origin`
      refletido.
- [ ] AC-HTTP-07: em dev/test, `GET /health/live` com Origin arbitrário
      retorna `Access-Control-Allow-Origin` refletido.
- [ ] AC-HTTP-08: `ALLOWED_ORIGINS` é validado por `env.validation.ts`
      como `Joi.string().optional()` (default ausente).

### Configuração atual

Ver `src/main.ts:95-107` + `src/config/env.validation.ts:41`.

---

## FR-HTTP-03: Trust Proxy

### Overview

`trustProxy` é setado no **construtor do FastifyAdapter** em
`src/main.ts:37` (NÃO via `app.register(fastify, { trustProxy })` —
Fastify lê essa opção uma única vez em `kRequest`, registrar
depois cria uma instância filha que nunca recebe requests).

### Requirements (RFC 2119)

- **MUST** usar `trustProxy: 'loopback'` (ou número `1`) como default
  conservador — confiar APENAS no primeiro hop.
- **MUST** expor env var `TRUST_PROXY` (string) para override:
  - `TRUST_PROXY=true` → `trustProxy: true` (NÃO usar em prod)
  - `TRUST_PROXY=loopback` → `trustProxy: 'loopback'`
  - `TRUST_PROXY=N` (número) → `trustProxy: N` (N hops confiáveis)
- **MUST NOT** usar `trustProxy: true` em produção (IP spoofing via
  `X-Forwarded-For` forjado).

**CWE**: CWE-348 (Use of Less Trusted Source)
**OWASP**: A05
**Mitigação**: [#HTTP-03] do relatório DevSecOps.

### Acceptance Criteria

- [ ] AC-HTTP-09: request com `X-Forwarded-For: 127.0.0.1` em dev/test
      não quebra a app (200 ou 503 esperado).
- [ ] AC-HTTP-10: env `TRUST_PROXY=2` configura `trustProxy: 2` (validado
      em `env.validation.ts` + `app.config.ts`).

### Configuração atual

Ver `src/main.ts:23-37` + `src/shared/infrastructure/config/app.config.ts:21-27`.

---

## FR-HTTP-04: Body Size Limit ≤ 1MB

### Overview

**NOVO nesta sprint.** Fastify aceita `bodyLimit` (bytes) na construção
da instância. Default do Fastify é 1 MiB, mas tornamos explícito em
`src/main.ts` para:
1. Tornar a decisão visível em code review.
2. Permitir override via env `BODY_LIMIT_BYTES`.

### Requirements (RFC 2119)

- **MUST** configurar `bodyLimit: 1048576` (1 MiB) na construção do
  FastifyAdapter.
- **MUST** expor env var `BODY_LIMIT_BYTES` (integer ≥ 1024) para
  override.
- **MUST** retornar HTTP 413 quando o body excede o limite (Fastify
  nativo).
- **MUST NOT** aplicar limite a uploads de arquivos (não há upload hoje;
  quando houver, criar endpoint dedicado com limite próprio).

**CWE**: CWE-400 (Uncontrolled Resource Consumption)
**OWASP**: A04 (Insecure Design) + A05
**Mitigação**: [#HTTP-04] do relatório DevSecOps.

### Acceptance Criteria

- [ ] AC-HTTP-11: `POST /auth/login` com body normal (< 1KB) retorna
      201/401/429 (NUNCA 413).
- [ ] AC-HTTP-12: env `BODY_LIMIT_BYTES=2097152` (2MB) aumenta o limite
      (validado em `env.validation.ts`).
- [ ] AC-HTTP-13: default `BODY_LIMIT_BYTES=1048576` é aplicado quando
      a env var está ausente.

### Configuração

```typescript
// src/main.ts (trecho)
const bodyLimit = (() => {
  const raw = process.env['BODY_LIMIT_BYTES'];
  if (!raw) return 1024 * 1024; // 1 MB default
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1024 * 1024;
})();

const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({ trustProxy, bodyLimit }),
  { bufferLogs: true },
);
```

```typescript
// src/config/env.validation.ts (trecho)
BODY_LIMIT_BYTES: Joi.number().integer().min(1024).default(1024 * 1024),
```

### Edge Cases

1. **Upload futuro**: criar endpoint `/upload` com `bodyLimit` próprio
   via `fastify.register(..., { bodyLimit: 10 * 1024 * 1024 })` no
   scope do endpoint. **NÃO** no escopo global.
2. **JSON com whitespace**: Fastify mede o body bruto (Content-Length),
   não o JSON parsed. Limite real é ≈ 1 MiB.
3. **Multi-part form**: Fastify usa `@fastify/multipart` separado,
   que tem seu próprio limite. Não conflita.

---

## FR-HTTP-05: CSRF Guard — Decisão Formal

### Overview

**NÃO IMPLEMENTADO.** A autenticação da API usa exclusivamente JWT via
header `Authorization: Bearer <token>`. Não há cookies de sessão,
logo o vetor de ataque CSRF (forjar request autenticada a partir de
site malicioso) não se aplica.

### Requirements (RFC 2119)

- **MUST** documentar a decisão no design.md (este arquivo) para
  auditorias futuras.
- **MUST NOT** emitir cookies de sessão `Set-Cookie` em nenhum endpoint
  atual. Qualquer novo endpoint que opte por emitir cookie **MUST**
  registrar o `@fastify/csrf-protection` plugin ANTES de entrar em
  produção (NFR-SEC-CSRF-002).
- **MUST** manter `Authorization: Bearer` como única forma de autenticação.
- **SHOULD** revisar esta decisão toda vez que um novo endpoint for
  adicionado ao auth flow.

**NFR-SEC-CSRF-001** (Justificativa): Autenticação é JWT-only via
header `Authorization`. Sem cookie de sessão, browser não envia
credenciais automaticamente em cross-site request, tornando CSRF
inaplicável. Mitigação N/A.

**NFR-SEC-CSRF-002** (Futuro): Se algum endpoint começar a usar cookie
httpOnly (ex: refresh token em cookie para SPA), `@fastify/csrf-protection`
**MUST** ser registrado E o double-submit cookie pattern **MUST** ser
usado.

**CWE**: CWE-352 (Cross-Site Request Forgery)
**OWASP**: A01 (Broken Access Control)
**Mitigação**: [#HTTP-05] do relatório DevSecOps — **N/A por design**.

### Acceptance Criteria

- [ ] AC-HTTP-14: nenhum endpoint atual emite `Set-Cookie` em response.
- [ ] AC-HTTP-15: design.md documenta a decisão (este arquivo).

### Verificação

```bash
# Confirma ausência de cookie setting em src/
grep -rn "setCookie\|reply.setCookie\|res.cookie" src/ --include="*.ts"
# → sem matches
```

---

## NFRs Transversais

### NFR-HTTP-PERF-01 (Performance)

Helmet, CORS, trustProxy, bodyLimit **MUST** adicionar latência
adicional ≤ 1ms p99 ao tempo de resposta. Validação:
- Helmet é early-stage middleware (executa ANTES dos controllers).
- CORS preflight (OPTIONS) cacheia por 24h (header `Access-Control-Max-Age`).
- Body limit é verificado em `kRequest` antes do parse — early return.

### NFR-HTTP-COMPAT-01 (Compatibilidade)

Mudanças **MUST NOT** quebrar nenhum dos 50+ e2e tests existentes.

### NFR-HTTP-OBSERV-01 (Observabilidade)

Mudanças **MUST** emitir log estruturado no boot:
- `event: 'http.helmet.configured'`
- `event: 'http.cors.configured'`
- `event: 'http.body_limit.configured'` (incluindo bytes efetivos)
- `event: 'http.trust_proxy.configured'`

---

## Cross-Cutting Concerns

### Logging (Pino)

- Body limit rejection (413) **MUST** logar
  `event: 'http.body_limit.exceeded'` com `path`, `method`,
  `contentLength`, `ip`.

### Feature flags

- Nenhuma. As 5 mudanças são default-on em todos os ambientes.

### Migração de dados

- Nenhuma (mudança de código/config, não de schema).

### Compatibilidade

- **API breaking changes**: ZERO
- **Env vars breaking changes**: ZERO (apenas adiciona `BODY_LIMIT_BYTES`).
- **Behavior changes**:
  - Requests com body > 1MB agora retornam 413 (antes: aceito, podia
    exaurir memória).
  - Helmet/CORS/trustProxy já estavam ativos; só adicionamos testes.

---

## Estratégia de Testes (DDD→BDD→SDD→ATDD→TDD)

```text
1. BDD  → features/devsecops-sprint-1.feature (a criar, se necessário)
2. SDD  → este design.md
3. ATDD → test/security-headers.e2e-spec.ts (NOVO — 9 testes)
4. TDD  → src/main.spec.ts (a criar — testes do bootstrap)
5. PROD → src/main.ts (modificado — bodyLimit)
```

### Rastreabilidade obrigatória

Cada arquivo de produção DEVE ter cabeçalho:
```typescript
// BDD: features/devsecops-sprint-1.feature:Funcionalidade: <nome>
// SDD: .openspec/changes/devsecops-sprint-1/design.md#<seção>
// ATDD: test/security-headers.e2e-spec.ts
// TDD: src/main.spec.ts
```

### Cobertura esperada

- Unit tests: ≥ 90% (linhas) por arquivo novo/modificado
- E2E tests: 1 por AC-HTTP-01..14
- Lint + typecheck + build: 0 errors

---

## Acceptance Criteria Globais (Done Definition)

- [ ] AC-S1-01: `npm run typecheck` passa
- [ ] AC-S1-02: `npm run lint` passa
- [ ] AC-S1-03: `npm run test` (unit) passa
- [ ] AC-S1-04: `npm run test:e2e` (incluindo security-headers) passa
- [ ] AC-S1-05: `curl -I http://localhost:3001/health/live` retorna
      `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
      `Referrer-Policy`, `X-DNS-Prefetch-Control: off`,
      `Content-Security-Policy`
- [ ] AC-S1-06: nenhum teste e2e existente quebrou
- [ ] AC-S1-07: design.md documenta decisão sobre CSRF
- [ ] AC-S1-08: nenhum cookie `Set-Cookie` é emitido por nenhum endpoint

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Body limit quebra endpoint legítimo | Override via `BODY_LIMIT_BYTES`. Nenhum endpoint atual > 1MB. |
| CORS em prod sem ALLOWED_ORIGINS definido | Default `false` (sem CORS). Operador precisa definir explicitamente. |
| trustProxy: true em prod (IP spoofing) | Default `loopback`. Operador precisa override consciente. |
| CSRF skipped e futuro endpoint com cookie | NFR-SEC-CSRF-002 força registro de `@fastify/csrf-protection`. |

---

## Status

- [x] Draft (este documento)
- [ ] In Review
- [ ] Approved
- [ ] Implemented
- [ ] Archived
