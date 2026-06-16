# DevSecOps Sprint 1 — Quick Wins — Design Specification

> **Status**: [x] Draft / [ ] In Review / [ ] Approved / [ ] Implemented
> **Change ID**: `devsecops-sprint1-quick-wins`
> **Data**: 2026-06-16
> **Especificação-fonte**: [proposal.md](./proposal.md)
> **Relatório-fonte**: [.agent/agents/relatorio-devsecops-2026-06-16.md](../../../.agent/agents/relatorio-devsecops-2026-06-16.md)

---

## Visão Geral

Este change implementa 7 quick wins de segurança do relatório DevSecOps
2026-06-16, organizados em **3 fases independentes**:

1. **Fase 1: HTTP Hardening** — trust proxy + Cache-Control
2. **Fase 2: SDLC Scanning** — Semgrep (SAST) + Gitleaks (secret scan) em CI
3. **Fase 3: App Hardening** — audit query/params + .env random + /health/network gate

Cada fase pode ser merged independentemente.

---

## Fase 1: devsecops-http-hardening

### Fase 1 — Overview

Configurações HTTP/security headers que protegem contra vazamento de dados
e melhoram postura de segurança em produção.

### Fase 1 — Requirements (RFC 2119)

#### FR-HTTP-01: Trust Proxy

- **MUST** configurar o Fastify para confiar no header `X-Forwarded-For`
  do proxy reverso (LB/ingress), de modo que `req.ip` reflita o IP real
  do cliente.
- **MUST** usar `trustProxy: 'loopback'` (ou número `1`) como default
  conservador — confiar APENAS no primeiro hop (loopback).
- **MUST** expor variável de ambiente `TRUST_PROXY` (string) para override
  em ambientes com múltiplos proxies (ex: `TRUST_PROXY=2`).
- **MUST NOT** usar `trustProxy: true` (confia em qualquer proxy) em
  produção, pois permite IP spoofing.

**CWE**: CWE-348 (Use of Less Trusted Source)
**OWASP**: A05 (Security Misconfiguration)
**Mitigação**: [#IAM-02, CODE-01] do relatório.

#### FR-HTTP-02: Cache-Control em Rotas Sensíveis

- **MUST** retornar header `Cache-Control: no-store` em responses de:
  - `/auth/*` (login, refresh, forgot, reset)
  - `/usuarios/*` (dados PII)
  - `/empresas/*` (dados confidenciais)
  - `/perfis/*`, `/permissoes/*` (RBAC)
- **MUST NOT** aplicar `no-store` em `/health/*`, `/swagger`, `/swagger-json`
  (respostas públicas/sem dados sensíveis).
- **SHOULD** usar um middleware global com allowlist de paths, em vez de
  decorator por controller.

**CWE**: CWE-525 (Use of Web Browser Cache Containing Sensitive Information)
**OWASP**: A05
**Mitigação**: [#CODE-07] do relatório.

### Fase 1 — Non-Functional Requirements

- **NFR-HTTP-01** (Performance): middleware de Cache-Control **MUST** ter
  latência p99 < 1ms (early return em path não-sensível).
- **NFR-HTTP-02** (Testabilidade): middleware **MUST** ser testável
  isoladamente (recebe `req`/`res`/`next`, mock-friendly).
- **NFR-HTTP-03** (Compatibilidade): mudanças **MUST NOT** quebrar nenhum
  dos 50+ e2e tests existentes.

### Fase 1 — Arquivos a Modificar

| Arquivo | Operação | Linhas estimadas |
|---------|----------|------------------|
| `src/main.ts` | Modificar | +5 |
| `src/shared/infrastructure/middleware/cache-control.middleware.ts` | Criar | ~30 |
| `src/shared/infrastructure/middleware/cache-control.middleware.spec.ts` | Criar (TDD) | ~80 |
| `test/http-hardening.e2e-spec.ts` | Criar (ATDD) | ~60 |
| `src/config/env.validation.ts` | Modificar | +3 (TRUST_PROXY) |

### Fase 1 — Acceptance Criteria

- [ ] AC-HTTP-01: `req.ip` retorna IP do header `X-Forwarded-For` em test
      com Fastify atrás de proxy simulado
- [ ] AC-HTTP-02: `req.ip` retorna IP direto (sem spoofing) com
      `X-Forwarded-For` forjado em modo dev (`trustProxy=0`)
- [ ] AC-HTTP-03: response de `/auth/login` tem `Cache-Control: no-store`
- [ ] AC-HTTP-04: response de `/health/live` NÃO tem `Cache-Control: no-store`
- [ ] AC-HTTP-05: env var `TRUST_PROXY=2` permite 2 hops de proxy
- [ ] AC-HTTP-06: nenhum e2e test existente quebrou

### Fase 1 — API/Configuration

```typescript
// src/main.ts (trecho — ANTES de NestFactory.create)
const rawTrustProxy = process.env['TRUST_PROXY'] ?? 'loopback';
const trustProxy: true | 'loopback' | number =
  rawTrustProxy === 'true'
    ? true
    : rawTrustProxy === 'loopback'
      ? 'loopback'
      : (() => {
          const n = parseInt(rawTrustProxy, 10);
          return Number.isFinite(n) && n >= 0 ? n : 'loopback';
        })();

const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({ trustProxy }), // MUST be no construtor — Fastify lê options.trustProxy uma única vez em kRequest.
  { bufferLogs: true },
);
```

> **⚠️ IMPORTANTE**: `trustProxy` é lido pelo Fastify **uma única vez** em
> `fastify.js:168` (`[kRequest]: Request.buildRequest(Request, options.trustProxy)`)
> durante a construção da instância. Tentar setá-lo via `app.register(fastify, { trustProxy })`
> cria uma instância Fastify FILHA que nunca recebe requests — não muta o parent.
> O parent continua com `Request` sem suporte a `X-Forwarded-For`, e `req.ip`
> retorna o IP do socket. **SEMPRE passe `trustProxy` no construtor do FastifyAdapter.**
> Como `ConfigService` não existe antes de `NestFactory.create`, lemos `process.env`
> diretamente no escopo do módulo.

```typescript
// src/shared/infrastructure/middleware/cache-control.middleware.ts
@Injectable()
export class CacheControlMiddleware implements NestMiddleware {
  private static readonly SENSITIVE_PATHS = [
    /^\/auth(\/.*)?$/,
    /^\/usuarios(\/.*)?$/,
    /^\/empresas(\/.*)?$/,
    /^\/perfis(\/.*)?$/,
    /^\/permissoes(\/.*)?$/,
  ];

  use(req: Request, res: Response, next: NextFunction): void {
    if (CacheControlMiddleware.SENSITIVE_PATHS.some((rx) => rx.test(req.url))) {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  }
}
```

### Fase 1 — Edge Cases

1. **Path com query string**: `req.url` é `/usuarios?email=foo` — regex
   `^\/usuarios(\/.*)?$` casa (regex não ancora em `?` por padrão em JS,
   mas a presença de `(\/.*)?` cobre opcional trailing). Validar com teste.
2. **Path case-sensitive**: NestJS routes são case-sensitive por default;
   `Usuarios` não é `/usuarios`. Aceitável.
3. **CORS preflight (OPTIONS)**: `Cache-Control` em OPTIONS 200/204 é OK
   mas não tem efeito prático. Não há problema.

---

## Fase 2: devsecops-sdlc-scanning

### Fase 2 — Overview

Adiciona SAST (Semgrep) e secret scan (Gitleaks) ao pipeline CI para
detectar vulnerabilidades em código próprio e vazamento de credenciais.

### Fase 2 — Requirements (RFC 2119)

#### FR-SDLC-01: Semgrep SAST

- **MUST** rodar Semgrep em todo PR para `main` e em push para `main`.
- **MUST** usar rulesets públicos `p/typescript` + `p/security-audit` +
  `p/owasp-top-ten` + `p/jwt`.
- **MUST** falhar o job com `error` se Semgrep retornar findings de
  severidade `ERROR` (configurado em `.semgrep.yml`).
- **SHOULD** reportar findings de severidade `WARNING` mas NÃO falhar
  o build (criar issues automáticas via `github-script`).
- **MUST** rodar em paralelo com o job `build` (matrix strategy).
- **MUST** usar `container image: returntocorp/semgrep:latest` (cached).

**CWE**: várias (CWE-89, CWE-79, CWE-22, CWE-352, etc.)
**OWASP**: A01-A10 (mapeamento em `p/owasp-top-ten`)
**Mitigação**: [#SDLC-01] do relatório.

#### FR-SDLC-02: Gitleaks Secret Scan

- **MUST** rodar Gitleaks em todo PR para `main` e em push para `main`.
- **MUST** usar config `.gitleaks.toml` customizada (allowlist para
  `.env.example` com placeholders, `*.spec.ts`, `test/`).
- **MUST** falhar o build se Gitleaks detectar segredo.
- **MUST** rodar em paralelo com `build` e `semgrep` (matrix).
- **SHOULD** rodar também em `git push --force` e em tags (não implementado
  nesta fase; backlog).

**CWE**: CWE-798 (Use of Hard-coded Credentials)
**OWASP**: A07 (Identification and Authentication Failures)
**Mitigação**: [#SDLC-03] do relatório.

### Fase 2 — Non-Functional Requirements

- **NFR-SDLC-01** (Performance): Semgrep + Gitleaks **MUST** completar em
  ≤ 3 min (rodando em paralelo).
- **NFR-SDLC-02** (Falsos positivos): regras **MUST** ter allowlist explícita
  para minimizar F+. Em particular, `.env.example` (com placeholders) e
  `*.spec.ts` (com tokens de teste) **MUST** ser allowlist.
- **NFR-SDLC-03** (Reprodutibilidade): scan **MUST** usar imagem Docker
  fixa (tag) para reprodutibilidade.

### Fase 2 — Arquivos a Modificar

| Arquivo | Operação | Linhas estimadas |
|---------|----------|------------------|
| `.github/workflows/ci.yml` | Modificar | +30 (2 jobs novos) |
| `.semgrep.yml` | Criar | ~30 |
| `.gitleaks.toml` | Criar | ~20 |

### Fase 2 — Acceptance Criteria

- [ ] AC-SDLC-01: PR com SQL injection óbvio em `.ts` é bloqueado por
      Semgrep com mensagem referenciando CWE-89
- [ ] AC-SDLC-02: PR com `JWT_SECRET=abc123` hardcoded em `.ts` é
      bloqueado por Gitleaks
- [ ] AC-SDLC-03: PR com `POSTGRES_PASSWORD=postgres` em `.env.example`
      NÃO é bloqueado (allowlist)
- [ ] AC-SDLC-04: tempo de CI aumenta ≤ 3 min quando security jobs rodam
      em paralelo
- [ ] AC-SDLC-05: nenhuma regra padrão gera F+ em código existente
      (baseline run antes de ativar como gate)

### Fase 2 — Configuração

```yaml
# .github/workflows/ci.yml (trecho)
jobs:
  build:
    # ... (existente)

  semgrep:
    name: Semgrep SAST
    runs-on: ubuntu-latest
    container:
      image: returntocorp/semgrep:latest
    steps:
      - uses: actions/checkout@v4
      - run: semgrep ci --config p/typescript --config p/security-audit --config p/owasp-top-ten --config p/jwt --error

  gitleaks:
    name: Gitleaks Secret Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITLEAKS_CONFIG: .gitleaks.toml
```

```yaml
# .semgrep.yml
rules:
  - id: hardcoded-jwt-secret
    pattern: JWT_SECRET = "[^a-zA-Z0-9]"
    message: "JWT_SECRET parece estar hardcoded. Use env var."
    languages: [generic]
    severity: ERROR
```

```toml
# .gitleaks.toml
[allowlist]
description = "api-padrao allowlist"
paths = [
  '''.env.example''',
  '''.env.test.example''',
  '''.*\.spec\.ts''',
  '''test/.*''',
]
regexes = [
  '''your_jwt_secret_key_here''',
  '''dev-only-jwt-secret''',
  '''postgres:postgres''',
]
```

### Fase 2 — Edge Cases

1. **Commit histórico com segredos reais**: Gitleaks com `fetch-depth: 0`
   vai varrer TODO o histórico. Antes de ativar, rodar local com
   `--no-banner --log-level=warn` e validar que não há segredos reais
   no histórico. Se houver, rotacionar segredos E usar `git filter-repo`
   para limpar (não escopo deste change).
2. **Semgrep e monorepo**: este repo é single-package; Semgrep roda em
   `src/`, `test/`, `features/`. Sem problema.
3. **`.env.local` no git**: foi confirmado que `.env.local` está em
   `.gitignore` na linha 64 (`!.env.test.example`). Validar que
   `.env.local` NÃO está em `git ls-files`. **MITIGAÇÃO**: já
   confirmado via `git ls-files .env*` no relatório.

---

## Fase 3: devsecops-audit-env-health

### Fase 3 — Overview

Três melhorias de código de aplicação: ampliar captura do audit
interceptor, fortificar `.env`, e gatear `/health/network`.

### Fase 3 — Requirements (RFC 2119)

#### FR-APP-01: Audit Interceptor captura query e params

- **MUST** incluir `query` e `params` (URL) no campo `detalhes` do
  `AuditLog`, além de `body` (já existente).
- **MUST** aplicar a mesma sanitização (`sanitizeBody`) a `query` e
  `params` antes de persistir.
- **MUST** estender a lista de chaves sensíveis para incluir `email`,
  `cpf`, `cnpj` (PII brasileira).
- **MUST NOT** quebrar testes existentes do `AuditInterceptor`.

**CWE**: CWE-532 (Insertion of Sensitive Information into Log File)
**OWASP**: A09 (Security Logging and Monitoring Failures)
**Mitigação**: [#CODE-04] do relatório.

#### FR-APP-02: .env com secret forte e warning de default

- **MUST** alterar `.env.example` para que `POSTGRES_PASSWORD` tenha
  placeholder claro (não `postgres`).
- **MUST** adicionar `.env.dev` (template) com instrução de gerar
  secret via `openssl rand -hex 32`.
- **MUST** adicionar `POSTGRES_PASSWORD` à validação Joi em
  `env.validation.ts` como `Joi.string().required()` (apenas obrigatório,
  SEM `min(16)` — o CI usa `POSTGRES_PASSWORD=postgres` em testes E2E
  e isso não pode quebrar o build).
- **MUST** adicionar warning custom em `AppConfig` (ou `main.ts`) que
  detecta se a senha é um dos defaults conhecidos (`postgres`, `password`,
  `admin`, `123456`, `changeme`) e loga `event: 'env.default_password.warning'`
  via Pino. **NÃO bloqueia o boot** — apenas loga e segue.
- **SHOULD** adicionar script `npm run env:dev` que gera `.env` a partir
  de `.env.example` + secrets random (Node one-liner cross-platform).

**CWE**: CWE-798 (Use of Hard-coded Credentials), CWE-521 (Weak Password)
**OWASP**: A07
**Mitigação**: [#INFRA-01] do relatório.

#### FR-APP-03: Gate /health/network

- **MUST** expor `GET /health/network` APENAS se `NODE_ENV !== 'production'`.
- **MUST** retornar 404 em produção (silencioso, sem expor rota existe).
- **MUST** manter `/health/live` e `/health/ready` públicos em todos os
  ambientes (necessários para k8s/LB).
- **SHOULD** documentar em `AGENTS.md` a política de health checks.

**CWE**: CWE-918 (Server-Side Request Forgery - SSRF)
**OWASP**: A10
**Mitigação**: [#CODE-03] do relatório.

### Fase 3 — Non-Functional Requirements

- **NFR-APP-01** (Performance): AuditInterceptor com captura de
  query/params **MUST** adicionar ≤ 0.5ms p99 ao tempo de resposta.
- **NFR-APP-02** (Compatibilidade): mudanças no `.env.example` **MUST NOT**
  quebrar setup existente. Manter `.env.example` antigo como `.env.example.old`
  por 1 release, ou simplesmente mudar a senha de exemplo.
- **NFR-APP-03** (DX): `npm run env:dev` **MUST** ser idempotente.

### Fase 3 — Arquivos a Modificar

| Arquivo | Operação | Linhas estimadas |
|---------|----------|------------------|
| `src/shared/infrastructure/interceptors/audit.interceptor.ts` | Modificar | +15 |
| `src/shared/infrastructure/interceptors/audit.interceptor.spec.ts` | Modificar (TDD) | +30 (testes novos) |
| `test/audit-query-params.e2e-spec.ts` | Criar (ATDD) | ~80 |
| `src/config/env.validation.ts` | Modificar | +5 |
| `.env.example` | Modificar | -1 linha (placeholder) |
| `.env.dev` | Criar (novo) | ~30 |
| `package.json` | Modificar | +1 script (`env:dev`) |
| `src/shared/infrastructure/health/health.controller.ts` | Modificar | +5 |
| `src/shared/infrastructure/health/health.controller.spec.ts` | Modificar (TDD) | +20 (testes novos) |
| `AGENTS.md` | Modificar | +15 (seção health) |

### Fase 3 — Acceptance Criteria

- [ ] AC-APP-01: `GET /usuarios?email=foo@bar` cria `AuditLog` com
      `detalhes.query.email = "********"` (sanitizado)
- [ ] AC-APP-02: `DELETE /usuarios/123` cria `AuditLog` com
      `detalhes.params.id = "123"`
- [ ] AC-APP-03: `.env` com `POSTGRES_PASSWORD=postgres` (default) faz
      app logar warning no boot
- [ ] AC-APP-04: `npm run env:dev` gera `.env` com `POSTGRES_PASSWORD`
      random (32+ chars)
- [ ] AC-APP-05: `GET /health/network` retorna 200 em `NODE_ENV=development`
- [ ] AC-APP-06: `GET /health/network` retorna 404 em `NODE_ENV=production`
- [ ] AC-APP-07: `GET /health/live` retorna 200 em ambos ambientes

### Fase 3 — Configuração

```typescript
// src/shared/infrastructure/interceptors/audit.interceptor.ts (trecho)
const detalhes: Prisma.InputJsonValue = {
  method,
  url,
  // Captura query, params, body (todos sanitizados)
  ...(query && Object.keys(query).length > 0 && { query: this.sanitizeBody(query) }),
  ...(params && Object.keys(params).length > 0 && { params: this.sanitizeBody(params) }),
  ...(body && Object.keys(body).length > 0 && { body: this.sanitizeBody(body) }),
};

// Adicionar à lista de chaves sensíveis:
private static readonly SENSITIVE_KEYS = [
  'senha', 'password', 'token', 'secret',
  'email', 'cpf', 'cnpj', 'authorization',
];
```

```typescript
// src/shared/infrastructure/health/health.controller.ts (trecho)
@Get('network')
@Public()
@HealthCheck()
@ApiOperation({ summary: 'Verifica conectividade externa (apenas dev)' })
checkNetwork(@Req() req: FastifyRequest) {
  // [Sprint1-HTTP] Gate por NODE_ENV — produção não deve expor este endpoint
  // (risco SSRF + timing oracle). Ver CODE-03 do relatório DevSecOps 2026-06-16.
  if (process.env.NODE_ENV === 'production') {
    throw new NotFoundException();
  }
  return this.health.check([
    () => this.http.pingCheck('google', 'https://google.com'),
  ]);
}
```

```javascript
// package.json (trecho)
"scripts": {
  "env:dev": "node -e \"const fs=require('fs');const crypto=require('crypto');let t=fs.readFileSync('.env.example','utf8');t=t.replace(/POSTGRES_PASSWORD=.*/, 'POSTGRES_PASSWORD=' + crypto.randomBytes(24).toString('hex'));t=t.replace(/JWT_SECRET=.*/, 'JWT_SECRET=' + crypto.randomBytes(32).toString('base64url'));fs.writeFileSync('.env', t);console.log('.env gerado com segredos random');\""
}
```

```bash
# .env.dev (template — não commitado; criado por `npm run env:dev`)
# Database
POSTGRES_USER=api_user
POSTGRES_PASSWORD=<openssl rand -hex 32>
POSTGRES_DB=api_db
DATABASE_URL=postgresql://api_user:<senha>@localhost:5434/api_db?schema=public

# Security
JWT_SECRET=<openssl rand -base64 32>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_DAYS=7

# (resto copiado de .env.example)
```

### Fase 3 — Edge Cases

1. **AuditInterceptor com `req.query` undefined**: `Object.keys(undefined)`
   lança. Validar antes com `&& Object.keys(query).length > 0`.
2. **Sensitive keys case-mismatch**: `EMAIL` vs `email` — `sanitizeBody`
   já usa `key.toLowerCase().includes(k)`. Validar.
3. **`/health/network` em testes E2E**: testes E2E rodam com
   `NODE_ENV=test`, que não é `production`. Endpoint fica disponível.
   Os testes existentes que usam `/health/network` continuam passando.
4. **`.env` com `POSTGRES_PASSWORD=postgres` em CI**: testes E2E
   precisam disso (CI configura `POSTGRES_PASSWORD=postgres` para o
   service `postgres`). **MITIGAÇÃO**: warning NÃO é erro — apenas
   loga. CI não quebra.
5. **Joi warning vs error**: usar **warning explícito** (não Joi
   `min(16)`) para detectar default password. Razão: o CI do projeto
   usa `POSTGRES_PASSWORD=postgres` em `.github/workflows/ci.yml`
   (8 chars) e isso não pode quebrar testes E2E. O warning é logado
   via Pino no boot, mas o app inicia normalmente. A fix real é
   `npm run env:dev` (script que gera `.env` com secret random).
6. **Cross-platform do `env:dev`**: o script Node one-liner em
   `package.json` deve funcionar em Linux/Mac/Windows. Evitar
   `openssl` (não-portável). Usar `crypto.randomBytes(24).toString('hex')`.

---

## BDD Scenarios Associated

Ver arquivo: [features/devsecops-sprint1-quick-wins.feature](../../../../features/devsecops-sprint1-quick-wins.feature)

3 funcionalidades (1 por fase) com 12 cenários no total.

---

## Cross-Cutting Concerns

### Logging (Pino)

- Mudanças **MUST** emitir logs estruturados (Pino) com chaves canônicas:
  - `event: 'audit.capturing_query_params'`
  - `event: 'http.trust_proxy.configured'`
  - `event: 'health.network.gated'`
  - `event: 'env.default_password.warning'`
- **MUST NOT** logar segredos (mesma regra do projeto).

### Observabilidade (OpenTelemetry)

- Mudanças **MUST** manter compatibilidade com traces OTel (não
  introduzir novo span sem `withSpan`).

### Feature flags

- Nenhuma nova feature flag. As 3 mudanças são default-on em prod.

### Migração de dados

- Nenhuma (mudanças são de código/config, não de schema).

### Compatibilidade

- **API breaking changes**: ZERO
- **Env vars breaking changes**: ZERO (apenas adiciona `TRUST_PROXY`)
- **Behavior changes**:
  - `req.ip` muda em prod (com proxy) — documentar
  - `/health/network` retorna 404 em prod (era 200)
  - AuditLog `detalhes` agora inclui `query` e `params` (additive, não
    quebra consumers)
  - `.env.example` com placeholder (DX muda, mas app não)

---

## Estratégia de Testes (DDD→BDD→SDD→ATDD→TDD)

Para cada fase:

```text
1. BDD  → features/devsecops-sprint1-quick-wins.feature (1 arquivo, 3 Funcionalidades)
2. SDD  → este design.md (já escrito)
3. ATDD → test/<fase>.e2e-spec.ts (e2e test cobrindo BDD)
4. TDD  → src/**/*.spec.ts (unit test, Red→Green→Refactor)
5. PROD → src/** (código com comentários // BDD/SDD/ATDD/TDD)
```

### Rastreabilidade obrigatória

Cada arquivo de produção DEVE ter cabeçalho:

```typescript
// BDD: features/devsecops-sprint1-quick-wins.feature:Funcionalidade: <nome>
// SDD: .openspec/changes/devsecops-sprint1-quick-wins/design.md#<fase>
// ATDD: test/<fase>.e2e-spec.ts
// TDD: src/<path>/<arquivo>.spec.ts
```

### Cobertura esperada

- Unit tests: ≥ 90% (linhas) por arquivo novo
- E2E tests: 1 por AC
- Lint + typecheck + build: 0 errors

---

## Acceptance Criteria Globais (Done Definition)

Para o change ser considerado **DONE**:

- [ ] Todos os 7 itens do proposal.md implementados
- [ ] Todos os ACs das 3 fases passando
- [ ] Cobertura de testes ≥ 90% em arquivos novos/modificados
- [ ] `npm run validate:quick` passa (lint + typecheck + build + test)
- [ ] `npm run security:check` passa (npm audit high+)
- [ ] CI com Semgrep + Gitleaks ativo e passando em main
- [ ] CHANGELOG.md atualizado
- [ ] AGENTS.md atualizado com seções novas (health, audit, env)
- [ ] Commit com mensagem conventional (`feat(security): sprint 1 quick wins`)
- [ ] PR aberto e aprovado

---

## Riscos Consolidados

Ver tabela de riscos no [proposal.md §Risks](./proposal.md#risks).
Resumo: 9 riscos identificados, 9 com mitigação, nenhum bloqueante.

## Status

- [x] Draft (este documento)
- [ ] In Review (aguardando aprovação do usuário)
- [ ] Approved
- [ ] Implemented
- [ ] Archived
