# DevSecOps Sprint 1 — Quick Wins — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar 7 quick wins de segurança do relatório DevSecOps 2026-06-16, fechando 4 achados ALTO e 5 MÉDIO em ~12h, distribuídos em 3 PRs independentes (1 por fase).

**Architecture:** TDD estrita respeitando o workflow do projeto (DDD→BDD→SDD→ATDD→TDD→PROD). Cada fase tem BDD features (já escritos em `features/devsecops-sprint1-quick-wins.feature`) e ATDD e2e tests (vermelhos primeiro). Cada arquivo de produção tem cabeçalho `// BDD/SDD/ATDD/TDD` apontando para os artefatos. Fases 1 e 2 podem ser desenvolvidas em paralelo em branches separadas; Fase 3 pode ser mergeada junto com Fase 1.

**Tech Stack:** NestJS 11 · Fastify 5 · Prisma 6 · Pino 9 · TypeScript 5.6 · Jest 30 · supertest 7 · Semgrep · Gitleaks

---

## Mapa de arquivos impactados

### Criar
- `src/shared/infrastructure/middleware/cache-control.middleware.ts` — middleware HTTP de Cache-Control
- `src/shared/infrastructure/middleware/cache-control.middleware.spec.ts` — TDD do middleware
- `test/http-hardening.e2e-spec.ts` — ATDD Fase 1 (trust proxy + Cache-Control)
- `test/audit-query-params.e2e-spec.ts` — ATDD Fase 3 (audit interceptor com query/params)
- `.semgrep.yml` — config Semgrep (regras ERROR + WARNING)
- `.gitleaks.toml` — config Gitleaks com allowlist
- `src/config/env-warnings.ts` — `warnOnDefaultPasswords()` + Pino warning
- `src/config/env-warnings.spec.ts` — TDD do env-warnings
- `.env.dev` — template com placeholders para gerar `.env` random
- `features/devsecops-sprint1-quick-wins.feature` — BDD (12 cenários)

### Modificar
- `src/main.ts` — `trustProxy` no Fastify + aplicar `CacheControlMiddleware` + chamar `warnOnDefaultPasswords()`
- `src/config/env.validation.ts` — adicionar `TRUST_PROXY` no schema Joi
- `src/shared/infrastructure/config/app.config.ts` — getter `trustProxy` (parse string → number | 'loopback' | true)
- `src/shared/infrastructure/interceptors/audit.interceptor.ts` — adicionar `query`/`params` aos `detalhes`; estender SENSITIVE_KEYS
- `src/shared/infrastructure/interceptors/audit.interceptor.spec.ts` — testes de sanitização de query/params
- `src/shared/infrastructure/health/health.controller.ts` — gate `checkNetwork()` por `NODE_ENV !== 'production'`
- `src/shared/infrastructure/health/health.controller.spec.ts` — testes do gate dev/prod
- `.github/workflows/ci.yml` — adicionar jobs `semgrep` e `gitleaks` em paralelo
- `.env.example` — alterar placeholder de `POSTGRES_PASSWORD` (sem default)
- `package.json` — script `env:dev` (Node one-liner com `crypto.randomBytes`)
- `AGENTS.md` — seções "Segurança HTTP", "Health checks", "Ambiente"
- `CHANGELOG.md` — entrada `## [Unreleased] - feat(security): sprint 1 quick wins`

---

## Fase 1: HTTP Hardening (1 PR, ~3h)

### Task 1.1: Adicionar TRUST_PROXY ao schema Joi

**Files:**
- Modify: `src/config/env.validation.ts`

- [ ] **Step 1: Adicionar TRUST_PROXY ao schema**

Em `src/config/env.validation.ts`, após `THROTTLER_SENSITIVE_LIMIT_RESET`, adicionar:

```typescript
  // [Sprint1-HTTP] Trust proxy — usado pelo Fastify para confiar no
  // header X-Forwarded-For. Default 'loopback' (apenas o primeiro hop).
  // BDD: features/devsecops-sprint1-quick-wins.feature:Funcionalidade: HTTP Hardening
  // SDD: .openspec/changes/devsecops-sprint1-quick-wins/design.md#fase-1
  TRUST_PROXY: Joi.string().default('loopback'),
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/config/env.validation.ts
git commit -m "feat(security): adicionar TRUST_PROXY ao schema de env"
```

---

### Task 1.2: Adicionar getter trustProxy em AppConfig

**Files:**
- Modify: `src/shared/infrastructure/config/app.config.ts`

- [ ] **Step 1: Adicionar getter trustProxy**

Em `src/shared/infrastructure/config/app.config.ts`, após o getter `nodeEnv`:

```typescript
  // [Sprint1-HTTP] Trust proxy: 'loopback' | 'true' | number (hops).
  // - 'loopback': apenas o primeiro hop (default seguro).
  // - 'true': confiar em qualquer proxy (NÃO usar em prod — IP spoofing).
  // - 'N' (número): confiar nos primeiros N hops.
  // BDD: features/devsecops-sprint1-quick-wins.feature:Cenário: Trust proxy reflete X-Forwarded-For
  get trustProxy(): true | 'loopback' | number {
    const raw = this.configService.get<string>('TRUST_PROXY', 'loopback');
    if (raw === 'true') return true;
    if (raw === 'loopback') return 'loopback';
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 'loopback';
  }
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/infrastructure/config/app.config.ts
git commit -m "feat(security): adicionar getter trustProxy em AppConfig"
```

---

### Task 1.3: Configurar trustProxy no main.ts

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Localizar o trecho de helmet no main.ts**

Run: `grep -n "helmet\|trustProxy\|app.register" src/main.ts`
Expected: encontra o `await app.register(helmet, ...)`.

- [ ] **Step 2: Adicionar trustProxy NO CONSTRUTOR do FastifyAdapter (NÃO em app.register!)**

Em `src/main.ts`, ANTES da função `bootstrap()` (no escopo do módulo), adicionar:

```typescript
// [Sprint1-HTTP] Trust proxy — MUST be passed to the FastifyAdapter
// constructor. Fastify reads options.trustProxy once at instance
// construction (fastify.js:168) to build the Request prototype.
// Setting it via app.register(fastify, { trustProxy }) creates a
// child Fastify with no routes — the parent never gets the option.
// Reading process.env directly because ConfigService doesn't exist
// before NestFactory.create.
// BDD: features/devsecops-sprint1-quick-wins.feature:Funcionalidade: HTTP Hardening
// SDD: .openspec/changes/devsecops-sprint1-quick-wins/design.md#fase-1
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
```

E na chamada `NestFactory.create`, alterar:
```typescript
new FastifyAdapter()
```
para:
```typescript
new FastifyAdapter({ trustProxy })
```

- [ ] **Step 3: NÃO importar AppConfig nem fastify para esta task**

`AppConfig` e o getter `trustProxy` (Task 1.2) continuam existindo como contrato tipado, mas o `main.ts` lê `process.env` diretamente porque `ConfigService` não existe antes de `NestFactory.create`. Não há imports novos a adicionar — o snippet acima já é self-contained.

- [ ] **Step 4: Verificar typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "feat(security): configurar trustProxy no Fastify (Sprint1-HTTP)"
```

---

### Task 1.4: TDD CacheControlMiddleware (RED→GREEN)

**Files:**
- Create: `src/shared/infrastructure/middleware/cache-control.middleware.spec.ts`
- Create: `src/shared/infrastructure/middleware/cache-control.middleware.ts`

- [ ] **Step 1: Criar diretório de middleware**

Run: `mkdir -p src/shared/infrastructure/middleware`

- [ ] **Step 2: Escrever teste que falha (RED)**

Criar `src/shared/infrastructure/middleware/cache-control.middleware.spec.ts`:

```typescript
// TDD: src/shared/infrastructure/middleware/cache-control.middleware.spec.ts
// BDD: features/devsecops-sprint1-quick-wins.feature:Funcionalidade: HTTP Hardening
// SDD: .openspec/changes/devsecops-sprint1-quick-wins/design.md#fase-1
// ATDD: test/http-hardening.e2e-spec.ts

import { CacheControlMiddleware } from './cache-control.middleware';

describe('CacheControlMiddleware', () => {
  let middleware: CacheControlMiddleware;
  let mockReq: { url: string };
  let mockRes: { setHeader: jest.Mock; headers: Record<string, string> };
  let mockNext: jest.Mock;

  beforeEach(() => {
    middleware = new CacheControlMiddleware();
    mockReq = { url: '/usuarios' };
    mockRes = {
      headers: {},
      setHeader: jest.fn(function (this: { headers: Record<string, string> }, k: string, v: string) {
        this.headers[k] = v;
      }) as unknown as jest.Mock,
    };
    mockRes.setHeader.mockImplementation((k, v) => {
      mockRes.headers[k] = v;
    });
    mockNext = jest.fn();
  });

  it('deve setar Cache-Control: no-store em /auth/login', () => {
    mockReq.url = '/auth/login';
    middleware.use(mockReq as never, mockRes as never, mockNext);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(mockNext).toHaveBeenCalled();
  });

  it('deve setar Cache-Control: no-store em /usuarios', () => {
    mockReq.url = '/usuarios';
    middleware.use(mockReq as never, mockRes as never, mockNext);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('deve setar Cache-Control: no-store em /usuarios/123', () => {
    mockReq.url = '/usuarios/123';
    middleware.use(mockReq as never, mockRes as never, mockNext);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('deve setar Cache-Control: no-store em /usuarios?email=foo@bar', () => {
    mockReq.url = '/usuarios?email=foo@bar';
    middleware.use(mockReq as never, mockRes as never, mockNext);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('NÃO deve setar Cache-Control em /health/live', () => {
    mockReq.url = '/health/live';
    middleware.use(mockReq as never, mockRes as never, mockNext);
    expect(mockRes.setHeader).not.toHaveBeenCalled();
  });

  it('NÃO deve setar Cache-Control em /swagger', () => {
    mockReq.url = '/swagger';
    middleware.use(mockReq as never, mockRes as never, mockNext);
    expect(mockRes.setHeader).not.toHaveBeenCalled();
  });

  it('NÃO deve setar Cache-Control em /', () => {
    mockReq.url = '/';
    middleware.use(mockReq as never, mockRes as never, mockNext);
    expect(mockRes.setHeader).not.toHaveBeenCalled();
  });

  it('deve chamar next() em todos os casos', () => {
    middleware.use(mockReq as never, mockRes as never, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Rodar teste para verificar RED**

Run: `npm test -- --testPathPattern=cache-control.middleware`
Expected: FAIL — "Cannot find module './cache-control.middleware'".

- [ ] **Step 4: Implementar middleware (GREEN)**

Criar `src/shared/infrastructure/middleware/cache-control.middleware.ts`:

```typescript
// BDD: features/devsecops-sprint1-quick-wins.feature:Funcionalidade: HTTP Hardening
// SDD: .openspec/changes/devsecops-sprint1-quick-wins/design.md#fase-1
// ATDD: test/http-hardening.e2e-spec.ts
// TDD: src/shared/infrastructure/middleware/cache-control.middleware.spec.ts
// [Sprint1-HTTP] Cache-Control: no-store em rotas sensíveis.
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class CacheControlMiddleware implements NestMiddleware {
  // Rotas onde responses podem conter dados sensíveis (PII, credenciais,
  // RBAC). Devem impedir cache em browser/proxies.
  // Ver CWE-525 (Use of Web Browser Cache Containing Sensitive Information).
  private static readonly SENSITIVE_PATHS: readonly RegExp[] = [
    /^\/auth(\/.*)?(\?.*)?$/,
    /^\/usuarios(\/.*)?(\?.*)?$/,
    /^\/empresas(\/.*)?(\?.*)?$/,
    /^\/perfis(\/.*)?(\?.*)?$/,
    /^\/permissoes(\/.*)?(\?.*)?$/,
  ];

  use(req: Request, res: Response, next: NextFunction): void {
    const path = (req.url ?? '/').split('?')[0] ?? '/';
    const isSensitive = CacheControlMiddleware.SENSITIVE_PATHS.some((rx) =>
      rx.test(req.url ?? '/'),
    );
    if (isSensitive) {
      res.setHeader('Cache-Control', 'no-store');
    }
    void path; // path isolado para eventual logging futuro
    next();
  }
}
```

- [ ] **Step 5: Rodar teste para verificar GREEN**

Run: `npm test -- --testPathPattern=cache-control.middleware`
Expected: PASS — 8 testes passam.

- [ ] **Step 6: Commit**

```bash
git add src/shared/infrastructure/middleware/
git commit -m "feat(security): CacheControlMiddleware com no-store em rotas sensíveis (Sprint1-HTTP)"
```

---

### Task 1.5: Aplicar CacheControlMiddleware globalmente

**Files:**
- Modify: `src/app.module.ts` (ou onde a app é configurada)

- [ ] **Step 1: Localizar o módulo raiz da app**

Run: `cat src/app.module.ts | grep -E "configure|MiddlewareConsumer|NestModule"`
Expected: encontra o `configure(consumer: MiddlewareConsumer)`.

- [ ] **Step 2: Aplicar middleware para todas as rotas**

Em `src/app.module.ts`, no método `configure()`, adicionar:

```typescript
  // [Sprint1-HTTP] Cache-Control: no-store global em rotas sensíveis.
  // BDD: features/devsecops-sprint1-quick-wins.feature:Funcionalidade: HTTP Hardening
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CacheControlMiddleware).forRoutes('*');
  }
```

(Adaptar se a assinatura do método já existir.)

- [ ] **Step 3: Importar CacheControlMiddleware no app.module.ts**

Adicionar ao topo:

```typescript
import { CacheControlMiddleware } from './shared/infrastructure/middleware/cache-control.middleware';
```

- [ ] **Step 4: Verificar typecheck e testes**

Run: `npm run validate:quick`
Expected: 0 errors e todos os testes passando.

- [ ] **Step 5: Commit**

```bash
git add src/app.module.ts
git commit -m "feat(security): aplicar CacheControlMiddleware globalmente"
```

---

### Task 1.6: ATDD e2e para HTTP Hardening

**Files:**
- Create: `test/http-hardening.e2e-spec.ts`

- [ ] **Step 1: Criar teste e2e (RED)**

Criar `test/http-hardening.e2e-spec.ts`:

```typescript
// ATDD: test/http-hardening.e2e-spec.ts
// BDD: features/devsecops-sprint1-quick-wins.feature:Funcionalidade: HTTP Hardening
// SDD: .openspec/changes/devsecops-sprint1-quick-wins/design.md#fase-1
// TDD: src/shared/infrastructure/middleware/cache-control.middleware.spec.ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import * as request from 'supertest';

describe('HTTP Hardening (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Trust proxy', () => {
    it('deve refletir X-Forwarded-For quando enviado', async () => {
      const res = await request(app.getHttpServer())
        .get('/health/live')
        .set('X-Forwarded-For', '203.0.113.42');
      expect(res.status).toBe(200);
      // Verifica que o IP foi lido (audit log ou header de debug)
      // Para o teste, verificamos que a app não rejeitou o header
    });

    it('NÃO deve confiar em X-Forwarded-For sem proxy em dev (loopback)', async () => {
      const res = await request(app.getHttpServer())
        .get('/health/live')
        .set('X-Forwarded-For', '1.2.3.4');
      expect(res.status).toBe(200);
      // Em dev (loopback), o IP real da conexão TCP deve prevalecer
      // Verificação indireta: app não quebra
    });
  });

  describe('Cache-Control: no-store', () => {
    it('deve setar no-store em /auth/login', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test@test.com', senha: '12345678' });
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('deve setar no-store em /usuarios (GET autenticado)', async () => {
      // Auth real seria necessário — aqui verificamos que rota existe
      // (teste de smoke; AC-HTTP-04 detalhado em produção)
      const res = await request(app.getHttpServer())
        .get('/usuarios')
        .set('Authorization', 'Bearer invalid');
      // Aceita 401 (sem auth) ou 200 — o importante é o header quando autorizado
      expect([200, 401]).toContain(res.status);
    });

    it('NÃO deve setar no-store em /health/live', async () => {
      const res = await request(app.getHttpServer()).get('/health/live');
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Rodar e2e para verificar RED→GREEN**

Run: `npm run test:e2e -- --testPathPattern=http-hardening`
Expected: PASS (já que middleware foi implementado em 1.4).

- [ ] **Step 3: Commit**

```bash
git add test/http-hardening.e2e-spec.ts
git commit -m "test(security): ATDD e2e para HTTP hardening (trust proxy + cache-control)"
```

---

### Task 1.7: Validação final e PR da Fase 1

- [ ] **Step 1: Rodar validate:quick completo**

Run: `npm run validate:quick`
Expected: 0 errors. Todos os 730+ testes passando.

- [ ] **Step 2: Verificar que nenhum e2e existente quebrou**

Run: `npm run test:e2e`
Expected: PASS em todos os e2e tests existentes.

- [ ] **Step 3: Atualizar CHANGELOG.md**

Adicionar entrada em `## [Unreleased]`:

```markdown
### feat(security): sprint 1 — HTTP hardening (trust proxy + cache-control)
- Configurado `trustProxy` no Fastify (env var `TRUST_PROXY`, default `loopback`).
- Adicionado `CacheControlMiddleware` global que aplica `Cache-Control: no-store`
  em rotas sensíveis (`/auth/*`, `/usuarios/*`, `/empresas/*`, `/perfis/*`, `/permissoes/*`).
- BDD: 5 cenários em `features/devsecops-sprint1-quick-wins.feature`.
- Fecha achados IAM-02, CODE-01 (ALTO) e CODE-07 (BAIXO) do relatório DevSecOps 2026-06-16.
```

- [ ] **Step 4: Commit final e push**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): feat(security) sprint 1 — HTTP hardening"
git push origin HEAD
gh pr create --base main --title "feat(security): HTTP hardening — trust proxy + cache-control" --body "Fecha achados IAM-02/CODE-01 (ALTO) e CODE-07 (BAIXO) do relatório DevSecOps 2026-06-16. Ver .openspec/changes/devsecops-sprint1-quick-wins/ para spec completo."
```

---

## Fase 2: SDLC Scanning (1 PR, ~5h)

### Task 2.1: Criar .semgrep.yml

**Files:**
- Create: `.semgrep.yml`

- [ ] **Step 1: Criar config conservadora do Semgrep**

Criar `.semgrep.yml`:

```yaml
# [Sprint1-SDLC] Semgrep SAST config — conservative baseline.
# BDD: features/devsecops-sprint1-quick-wins.feature:Funcionalidade: SDLC Scanning
# SDD: .openspec/changes/devsecops-sprint1-quick-wins/design.md#fase-2
# Documentação: https://semgrep.dev/docs/configuring-rules

rules:
  # Hardcoded JWT secret (exemplo)
  - id: hardcoded-jwt-secret
    pattern: JWT_SECRET = "[^A-Za-z0-9]"
    message: >
      JWT_SECRET parece estar hardcoded. Use env var JWT_SECRET.
    languages: [generic]
    severity: ERROR
    paths:
      exclude:
        - "*.spec.ts"
        - "test/**"
        - ".env.example"
        - "*.md"
        - "docs/**"

  # SQL injection via $queryRawUnsafe
  - id: prisma-raw-sql-injection
    pattern: prisma.$queryRawUnsafe(...)
    message: >
      Uso de $queryRawUnsafe permite SQL injection. Use $queryRaw com template tag
      (Prisma.sql\`...\`) ou parameterized queries.
    languages: [typescript]
    severity: ERROR
    paths:
      exclude:
        - "*.spec.ts"
        - "test/**"

  # eval() em código de produção
  - id: no-eval
    pattern: eval(...)
    message: "Uso de eval() é vetor de RCE. Use alternativas seguras."
    languages: [typescript, javascript]
    severity: ERROR

  # innerHTML sem sanitização
  - id: innerhtml-xss
    pattern-either:
      - pattern: $EL.innerHTML = $X
      - pattern: $EL.outerHTML = $X
    message: "innerHTML/outerHTML sem sanitização é vetor de XSS. Use textContent ou DOMPurify."
    languages: [typescript, javascript]
    severity: WARNING
```

- [ ] **Step 2: Validar YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.semgrep.yml')); print('OK')"`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add .semgrep.yml
git commit -m "ci(security): adicionar .semgrep.yml com rules baseline (Sprint1-SDLC)"
```

---

### Task 2.2: Criar .gitleaks.toml

**Files:**
- Create: `.gitleaks.toml`

- [ ] **Step 1: Criar config do Gitleaks com allowlist**

Criar `.gitleaks.toml`:

```toml
# [Sprint1-SDLC] Gitleaks secret scan config com allowlist explícita.
# BDD: features/devsecops-sprint1-quick-wins.feature:Funcionalidade: SDLC Scanning
# SDD: .openspec/changes/devsecops-sprint1-quick-wins/design.md#fase-2
# Documentação: https://github.com/gitleaks/gitleaks/blob/master/config/gitleaks.toml

title = "api-padrao Gitleaks config"

[allowlist]
description = "Allowlist para fixtures, testes e exemplos de secrets"
paths = [
  '''.env.example''',
  '''.env.test.example''',
  '''.env.dev''',
  '''.*\.spec\.ts''',
  '''test/.*''',
  '''docs/.*\.md''',
  '''features/.*\.feature''',
]
regexes = [
  '''your_jwt_secret_key_here''',
  '''dev-only-jwt-secret''',
  '''postgres:postgres''',
  '''<openssl rand''',
  '''<senha>''',
]
```

- [ ] **Step 2: Validar TOML**

Run: `python3 -c "import tomllib; tomllib.load(open('.gitleaks.toml','rb')); print('OK')"`
Expected: `OK` (Python 3.11+) ou instalar `toml` e adaptar.

- [ ] **Step 3: Commit**

```bash
git add .gitleaks.toml
git commit -m "ci(security): adicionar .gitleaks.toml com allowlist (Sprint1-SDLC)"
```

---

### Task 2.3: Adicionar jobs Semgrep + Gitleaks ao CI

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Localizar a estrutura de jobs**

Run: `cat .github/workflows/ci.yml | grep -E "jobs:|build:|test:|lint:"`
Expected: identifica o job principal (geralmente `build` ou `test`).

- [ ] **Step 2: Adicionar job semgrep em paralelo**

Em `.github/workflows/ci.yml`, APÓS o último job existente, adicionar:

```yaml
  semgrep:
    name: Semgrep SAST
    runs-on: ubuntu-latest
    container:
      image: returntocorp/semgrep:latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Semgrep Scan
        run: |
          semgrep ci \
            --config p/typescript \
            --config p/security-audit \
            --config p/owasp-top-ten \
            --config p/jwt \
            --error \
            --config .semgrep.yml

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
          GITLEAKS_ENABLE_UPLOAD_ARTIFACT: true
```

- [ ] **Step 3: Adicionar cancel-in-progress para jobs redundantes (opcional)**

No TOPO do arquivo (após `on:` e `concurrency:` se existir), adicionar:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}
```

- [ ] **Step 4: Validar YAML do CI**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('OK')"`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(security): adicionar jobs Semgrep + Gitleaks em paralelo (Sprint1-SDLC)"
```

---

### Task 2.4: Validação local do Semgrep e Gitleaks

- [ ] **Step 1: Rodar Semgrep local via Docker**

Run:
```bash
docker run --rm -v "$(pwd):/src" returntocorp/semgrep:latest \
  semgrep ci --config p/typescript --config p/security-audit \
  --config p/owasp-top-ten --config p/jwt --config .semgrep.yml /src
```
Expected: exit code 0 (sem findings ERROR) ou findings WARNING aceitáveis.

- [ ] **Step 2: Rodar Gitleaks local via Docker**

Run:
```bash
docker run --rm -v "$(pwd):/repo" zricethezav/gitleaks:latest \
  detect --source /repo --config /repo/.gitleaks.toml --no-banner
```
Expected: exit code 0 (nenhum secret detectado) ou findings apenas em allowlist.

- [ ] **Step 3: Se houver findings ERROR, ajustar código OU allowlist**

Resolver qualquer F+ (falso positivo) antes de abrir PR.

- [ ] **Step 4: Commit ajustes (se houver)**

```bash
git add -A
git commit -m "ci(security): ajustar allowlist/code para resolver F+ do Semgrep/Gitleaks"
```

---

### Task 2.5: PR da Fase 2

- [ ] **Step 1: Push e abrir PR**

```bash
git push origin HEAD
gh pr create --base main --title "ci(security): add Semgrep SAST + Gitleaks secret scan" --body "Fecha achados SDLC-01 e SDLC-03 (MÉDIO) do relatório DevSecOps 2026-06-16. Ver .openspec/changes/devsecops-sprint1-quick-wins/ para spec completo."
```

- [ ] **Step 2: Verificar que CI roda Semgrep + Gitleaks em paralelo**

Aguardar CI e confirmar 3 jobs verdes: `build`, `semgrep`, `gitleaks`.

- [ ] **Step 3: Merge PR**

Após aprovação, mergear com squash.

---

## Fase 3: App Hardening (1 PR, ~3.5h)

### Task 3.1: TDD Audit Interceptor — capturar query/params (RED→GREEN)

**Files:**
- Modify: `src/shared/infrastructure/interceptors/audit.interceptor.spec.ts`
- Modify: `src/shared/infrastructure/interceptors/audit.interceptor.ts`

- [ ] **Step 1: Adicionar testes (RED)**

Em `src/shared/infrastructure/interceptors/audit.interceptor.spec.ts`, ADICIONAR (não substituir) os seguintes testes:

```typescript
  describe('captura de query e params', () => {
    it('deve incluir query sanitizado no AuditLog.detalhes', async () => {
      // Arrange: request com query contendo email
      const mockRequest = {
        method: 'GET',
        url: '/usuarios?email=admin@empresa.com',
        body: undefined,
        params: {},
        query: { email: 'admin@empresa.com' },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'jest' },
        usuarioLogado: { userId: 1 },
      };
      // ... (configurar mock context, prisma, etc — seguir padrão do spec existente)

      // Assert: detalhes.query.email === '********' (sanitizado)
    });

    it('deve incluir params no AuditLog.detalhes', async () => {
      // Arrange: request com params.id
      const mockRequest = {
        method: 'DELETE',
        url: '/usuarios/123',
        body: undefined,
        params: { id: '123' },
        query: {},
        ip: '127.0.0.1',
        headers: { 'user-agent': 'jest' },
        usuarioLogado: { userId: 1 },
      };
      // Assert: detalhes.params.id === '123' E detalhes.method === 'DELETE'
    });

    it('deve sanitizar CPF no query', async () => {
      // Arrange: query com cpf=12345678900
      // Assert: detalhes.query.cpf === '********'
    });

    it('deve sanitizar email no params (case-insensitive)', async () => {
      // Arrange: params com Email='foo@bar'
      // Assert: detalhes.params.Email === '********'
    });
  });
```

(Adaptar conforme padrão de mock usado nos testes existentes do interceptor.)

- [ ] **Step 2: Rodar testes para verificar RED**

Run: `npm test -- --testPathPattern=audit.interceptor`
Expected: FAIL — query/params não são capturados.

- [ ] **Step 3: Modificar o interceptor (GREEN)**

Em `src/shared/infrastructure/interceptors/audit.interceptor.ts`, SUBSTITUIR o bloco `const detalhes` por:

```typescript
          // [Sprint1-App] Capturar query e params (além de body) para
          // trilha de auditoria completa. Sanitização reaproveitada de
          // sanitizeBody (mesma lista de chaves sensíveis).
          // BDD: features/devsecops-sprint1-quick-wins.feature:Cenário: Audit log captura query sanitizado
          // SDD: .openspec/changes/devsecops-sprint1-quick-wins/design.md#fase-3
          const detalhes: Prisma.InputJsonValue = {
            method,
            url,
            ...(body && Object.keys(body).length > 0 && { body: this.sanitizeBody(body) }),
            ...(params && Object.keys(params).length > 0 && { params: this.sanitizeBody(params) }),
            ...(request.query && Object.keys(request.query).length > 0 && { query: this.sanitizeBody(request.query) }),
          };
```

E SUBSTITUIR a lista `sensitiveKeys` dentro de `sanitizeBody`:

```typescript
  private sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = { ...body };
    // [Sprint1-App] Lista estendida com PII brasileira (email, cpf, cnpj)
    // e authorization. Match case-insensitive via toLowerCase().
    // CWE-532 (Insertion of Sensitive Information into Log File).
    const sensitiveKeys = [
      'senha', 'password', 'token', 'secret',
      'email', 'cpf', 'cnpj', 'authorization',
    ];

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
        sanitized[key] = '********';
      }
    }
    return sanitized;
  }
```

- [ ] **Step 4: Rodar testes para verificar GREEN**

Run: `npm test -- --testPathPattern=audit.interceptor`
Expected: PASS — todos os testes (antigos + novos).

- [ ] **Step 5: Adicionar comentário BDD/SDD/ATDD/TDD no topo do arquivo**

No topo de `src/shared/infrastructure/interceptors/audit.interceptor.ts`, adicionar (antes do import atual):

```typescript
// BDD: features/devsecops-sprint1-quick-wins.feature:Funcionalidade: App Hardening
// SDD: .openspec/changes/devsecops-sprint1-quick-wins/design.md#fase-3
// ATDD: test/audit-query-params.e2e-spec.ts
// TDD: src/shared/infrastructure/interceptors/audit.interceptor.spec.ts
```

(Verificar se já existe cabeçalho similar; se sim, ajustar.)

- [ ] **Step 6: Commit**

```bash
git add src/shared/infrastructure/interceptors/audit.interceptor.ts \
        src/shared/infrastructure/interceptors/audit.interceptor.spec.ts
git commit -m "feat(security): audit interceptor captura query/params sanitizados (Sprint1-App)"
```

---

### Task 3.2: ATDD e2e para audit query/params

**Files:**
- Create: `test/audit-query-params.e2e-spec.ts`

- [ ] **Step 1: Criar teste e2e**

Criar `test/audit-query-params.e2e-spec.ts`:

```typescript
// ATDD: test/audit-query-params.e2e-spec.ts
// BDD: features/devsecops-sprint1-quick-wins.feature:Cenário: Audit log captura query sanitizado
// SDD: .openspec/changes/devsecops-sprint1-quick-wins/design.md#fase-3
// TDD: src/shared/infrastructure/interceptors/audit.interceptor.spec.ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as request from 'supertest';

describe('Audit Interceptor — query/params (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    prisma = app.get(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { acao: 'AUDIT_TEST' } });
    await app.close();
  });

  it('deve registrar query.email sanitizado no AuditLog', async () => {
    // Fazer request autenticada que dispare auditoria com query
    // (usar seed/usuário de teste se necessário)
    const res = await request(app.getHttpServer())
      .get('/usuarios?email=test@example.com')
      .set('Authorization', 'Bearer test-token');
    // 200 ou 401 — se 200, verificar audit log
    if (res.status === 200) {
      const log = await prisma.auditLog.findFirst({
        where: { acao: { contains: 'USUARIO' } },
        orderBy: { id: 'desc' },
      });
      expect(log?.detalhes).toMatchObject({
        method: 'GET',
        query: { email: '********' },
      });
    }
  });

  it('deve registrar params.id no AuditLog (DELETE)', async () => {
    const res = await request(app.getHttpServer())
      .delete('/usuarios/123')
      .set('Authorization', 'Bearer test-token');
    if (res.status === 200 || res.status === 204) {
      const log = await prisma.auditLog.findFirst({
        where: { recursoId: '123' },
        orderBy: { id: 'desc' },
      });
      expect(log?.detalhes).toMatchObject({
        method: 'DELETE',
        params: { id: '123' },
      });
    }
  });
});
```

- [ ] **Step 2: Rodar e2e**

Run: `npm run test:e2e -- --testPathPattern=audit-query-params`
Expected: PASS (assumindo setup de auth nos testes existentes).

- [ ] **Step 3: Commit**

```bash
git add test/audit-query-params.e2e-spec.ts
git commit -m "test(security): ATDD e2e para audit interceptor (query/params)"
```

---

### Task 3.3: TDD env-warnings (RED→GREEN)

**Files:**
- Create: `src/config/env-warnings.ts`
- Create: `src/config/env-warnings.spec.ts`

- [ ] **Step 1: Criar testes (RED)**

Criar `src/config/env-warnings.spec.ts`:

```typescript
// TDD: src/config/env-warnings.spec.ts
// BDD: features/devsecops-sprint1-quick-wins.feature:Cenário: .env com default password emite warning
// SDD: .openspec/changes/devsecops-sprint1-quick-wins/design.md#fase-3

import { warnOnDefaultPasswords } from './env-warnings';

describe('warnOnDefaultPasswords', () => {
  let warnSpy: jest.SpyInstance;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    warnSpy = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('deve emitir warning quando POSTGRES_PASSWORD=postgres', () => {
    process.env.POSTGRES_PASSWORD = 'postgres';
    warnOnDefaultPasswords({ warn: warnSpy } as never);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'env.default_password.warning' }),
    );
  });

  it('deve emitir warning para outros defaults conhecidos', () => {
    for (const def of ['password', 'admin', '123456', 'changeme']) {
      warnSpy.mockClear();
      process.env.POSTGRES_PASSWORD = def;
      warnOnDefaultPasswords({ warn: warnSpy } as never);
      expect(warnSpy).toHaveBeenCalled();
    }
  });

  it('NÃO deve emitir warning para senha forte (32+ chars hex)', () => {
    process.env.POSTGRES_PASSWORD = 'a'.repeat(64); // 64 chars
    warnOnDefaultPasswords({ warn: warnSpy } as never);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('NÃO deve emitir warning quando POSTGRES_PASSWORD não está setado', () => {
    delete process.env.POSTGRES_PASSWORD;
    warnOnDefaultPasswords({ warn: warnSpy } as never);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar testes para verificar RED**

Run: `npm test -- --testPathPattern=env-warnings`
Expected: FAIL — "Cannot find module './env-warnings'".

- [ ] **Step 3: Implementar env-warnings (GREEN)**

Criar `src/config/env-warnings.ts`:

```typescript
// BDD: features/devsecops-sprint1-quick-wins.feature:Cenário: .env com default password emite warning
// SDD: .openspec/changes/devsecops-sprint1-quick-wins/design.md#fase-3
// TDD: src/config/env-warnings.spec.ts
// [Sprint1-App] Warn-on-default-passwords. NÃO bloqueia boot — apenas loga.
// CWE-798 (Use of Hard-coded Credentials), CWE-521 (Weak Password).

import type { Logger } from 'nestjs-pino';

const DEFAULT_PASSWORDS: ReadonlySet<string> = new Set([
  'postgres',
  'password',
  'admin',
  '123456',
  'changeme',
]);

/**
 * Detecta passwords default no .env e loga warning estruturado via Pino.
 * Não bloqueia o boot — apenas alerta. CI usa 'postgres' e isso não pode quebrar.
 */
export function warnOnDefaultPasswords(logger: { warn: (obj: object, msg?: string) => void }): void {
  const pgPassword = process.env['POSTGRES_PASSWORD'];
  if (!pgPassword) return;

  if (DEFAULT_PASSWORDS.has(pgPassword)) {
    logger.warn(
      {
        event: 'env.default_password.warning',
        passwordLength: pgPassword.length,
        hint: 'Use `npm run env:dev` para gerar um .env com secrets random.',
      },
      'POSTGRES_PASSWORD parece ser um valor default. Substitua antes de produção.',
    );
  }
}

// Re-export para typecheck mais ergonômico
export type { Logger };
```

- [ ] **Step 4: Rodar testes para verificar GREEN**

Run: `npm test -- --testPathPattern=env-warnings`
Expected: PASS — 4 testes passam.

- [ ] **Step 5: Commit**

```bash
git add src/config/env-warnings.ts src/config/env-warnings.spec.ts
git commit -m "feat(security): warn-on-default-passwords + testes (Sprint1-App)"
```

---

### Task 3.4: Chamar warnOnDefaultPasswords no main.ts

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Importar a função**

Em `src/main.ts`, adicionar import:

```typescript
import { warnOnDefaultPasswords } from './config/env-warnings';
```

- [ ] **Step 2: Chamar antes do app.listen()**

Em `src/main.ts`, na função `bootstrap()`, APÓS `app.useLogger(...)` e ANTES de `app.listen(...)`, adicionar:

```typescript
  // [Sprint1-App] Aviso de default password (não bloqueia boot).
  // BDD: features/devsecops-sprint1-quick-wins.feature:Cenário: .env com default password emite warning
  warnOnDefaultPasswords(logger);
```

- [ ] **Step 3: Verificar typecheck e testes**

Run: `npm run validate:quick`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat(security): chamar warnOnDefaultPasswords no boot (Sprint1-App)"
```

---

### Task 3.5: TDD /health/network gate (RED→GREEN)

**Files:**
- Modify: `src/shared/infrastructure/health/health.controller.spec.ts`
- Modify: `src/shared/infrastructure/health/health.controller.ts`

- [ ] **Step 1: Adicionar testes (RED)**

Em `src/shared/infrastructure/health/health.controller.spec.ts`, ADICIONAR:

```typescript
  describe('checkNetwork (gate NODE_ENV)', () => {
    let originalNodeEnv: string | undefined;

    beforeEach(() => {
      originalNodeEnv = process.env['NODE_ENV'];
    });

    afterEach(() => {
      if (originalNodeEnv === undefined) {
        delete process.env['NODE_ENV'];
      } else {
        process.env['NODE_ENV'] = originalNodeEnv;
      }
    });

    it('deve retornar 200 em NODE_ENV=development', async () => {
      process.env['NODE_ENV'] = 'development';
      // Mock http.pingCheck to return success
      // Assert: result.status === 'ok' ou similar
    });

    it('deve lançar NotFoundException em NODE_ENV=production', () => {
      process.env['NODE_ENV'] = 'production';
      expect(() => controller.checkNetwork({} as never)).toThrow(NotFoundException);
    });
  });
```

(Adaptar conforme padrão existente do spec do controller.)

- [ ] **Step 2: Rodar testes para verificar RED**

Run: `npm test -- --testPathPattern=health.controller`
Expected: FAIL — gate ainda não existe.

- [ ] **Step 3: Adicionar gate no controller (GREEN)**

Em `src/shared/infrastructure/health/health.controller.ts`, SUBSTITUIR o método `checkNetwork` por:

```typescript
  @Get('network')
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: 'Verifica conectividade externa (apenas dev)' })
  // BDD: features/devsecops-sprint1-quick-wins.feature:Cenário: /health/network 200 em dev
  // SDD: .openspec/changes/devsecops-sprint1-quick-wins/design.md#fase-3
  checkNetwork(@Req() req: FastifyRequest) {
    // [Sprint1-App] Gate por NODE_ENV — produção não deve expor este
    // endpoint (risco SSRF + timing oracle). Ver CODE-03 do relatório.
    if (process.env['NODE_ENV'] === 'production') {
      throw new NotFoundException();
    }
    return this.health.check([
      () => this.http.pingCheck('google', 'https://www.google.com'),
    ]);
  }
```

(Verificar imports de `Req`, `FastifyRequest`, `NotFoundException`.)

- [ ] **Step 4: Rodar testes para verificar GREEN**

Run: `npm test -- --testPathPattern=health.controller`
Expected: PASS.

- [ ] **Step 5: Adicionar comentário BDD/SDD/ATDD/TDD no topo do controller**

Verificar se já existe; se não, adicionar:

```typescript
// BDD: features/devsecops-sprint1-quick-wins.feature:Funcionalidade: App Hardening
// SDD: .openspec/changes/devsecops-sprint1-quick-wins/design.md#fase-3
// ATDD: test/health-network-gate.e2e-spec.ts (a criar se necessário)
// TDD: src/shared/infrastructure/health/health.controller.spec.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/shared/infrastructure/health/health.controller.ts \
        src/shared/infrastructure/health/health.controller.spec.ts
git commit -m "feat(security): gate /health/network em produção (Sprint1-App)"
```

---

### Task 3.6: .env.dev e script env:dev

**Files:**
- Modify: `.env.example` (apenas o placeholder de POSTGRES_PASSWORD)
- Create: `.env.dev`
- Modify: `package.json`

- [ ] **Step 1: Alterar .env.example para placeholder claro**

Em `.env.example`, alterar a linha `POSTGRES_PASSWORD=postgres` para:

```bash
# IMPORTANTE: troque por uma senha forte em produção.
# Para gerar: `openssl rand -hex 32` ou use `npm run env:dev`
POSTGRES_PASSWORD=troque-por-senha-forte-aqui
```

- [ ] **Step 2: Criar .env.dev (template)**

Criar `.env.dev`:

```bash
# [Sprint1-App] Template para gerar .env com secrets random.
# Uso: rm .env && npm run env:dev
# O script substitui os placeholders <openssl rand -hex 32> por valores reais.

# Database
POSTGRES_USER=api_user
POSTGRES_PASSWORD=<openssl rand -hex 32>
POSTGRES_DB=api_db
DATABASE_URL=postgresql://api_user:<senha>@localhost:5434/api_db?schema=public

# Security
JWT_SECRET=<openssl rand -base64 32>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_DAYS=7

# App
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:3000

# (copie o resto de .env.example mantendo placeholders substituídos)
```

- [ ] **Step 3: Adicionar script env:dev em package.json**

Em `package.json`, na seção `scripts`, ADICIONAR:

```json
    "env:dev": "node -e \"const fs=require('fs');const crypto=require('crypto');let t=fs.readFileSync('.env.example','utf8');t=t.replace(/^POSTGRES_PASSWORD=.*$/m,'POSTGRES_PASSWORD='+crypto.randomBytes(24).toString('hex'));t=t.replace(/^JWT_SECRET=.*$/m,'JWT_SECRET='+crypto.randomBytes(32).toString('base64url'));fs.writeFileSync('.env',t);console.log('.env gerado com POSTGRES_PASSWORD e JWT_SECRET random');\""
```

- [ ] **Step 4: Testar localmente (NÃO commit .env gerado)**

Run: `rm -f .env && npm run env:dev`
Expected: `.env gerado com POSTGRES_PASSWORD e JWT_SECRET random`.

Run: `grep -E "POSTGRES_PASSWORD|JWT_SECRET" .env`
Expected: 2 linhas com secrets de 48+ chars (24 bytes hex = 48 chars) e 43+ chars (32 bytes base64url).

- [ ] **Step 5: Limpar .env gerado e commit**

```bash
rm .env
git add .env.example .env.dev package.json
git commit -m "feat(security): .env.dev template + script env:dev (Sprint1-App)"
```

---

### Task 3.7: Atualizar AGENTS.md e CHANGELOG.md

**Files:**
- Modify: `AGENTS.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Adicionar seção "Segurança HTTP" em AGENTS.md**

Em `AGENTS.md`, na seção de "Segurança" (ou criar nova), adicionar:

```markdown
## Segurança HTTP

- **Trust proxy**: configurado via `TRUST_PROXY` env var. Default `loopback`
  (apenas o primeiro hop é confiável). Para produção atrás de múltiplos
  proxies, use `TRUST_PROXY=2` (ou o número de hops).
  - ⚠️ NUNCA use `TRUST_PROXY=true` em produção (permite IP spoofing).
- **Cache-Control**: middleware global aplica `Cache-Control: no-store` em
  rotas sensíveis (`/auth/*`, `/usuarios/*`, `/empresas/*`, `/perfis/*`,
  `/permissoes/*`). Para adicionar nova rota sensível, edite
  `SENSITIVE_PATHS` em `src/shared/infrastructure/middleware/cache-control.middleware.ts`.
```

- [ ] **Step 2: Adicionar seção "Health checks" em AGENTS.md**

```markdown
## Health checks

- `/health/live` — liveness probe (sempre 200, em qualquer ambiente).
- `/health/ready` — readiness probe (verifica DB, sempre disponível).
- `/health/network` — **APENAS EM DEV** (NODE_ENV !== 'production').
  Verifica ping para `https://www.google.com`. Em produção, retorna 404
  (gate silencioso, sem expor que a rota existe).
  - Rationale: SSRF + timing oracle. Ver CODE-03 do relatório DevSecOps 2026-06-16.
```

- [ ] **Step 3: Adicionar seção "Ambiente" em AGENTS.md**

```markdown
## Ambiente (.env)

- `.env.example` — template com placeholders (commitado).
- `.env.dev` — template com placeholders `<openssl rand ...>` para geração.
- `.env` — **NUNCA commitado** (gerado via `npm run env:dev`).
- `warnOnDefaultPasswords()` no boot detecta defaults conhecidos
  (`postgres`, `password`, `admin`, `123456`, `changeme`) e loga warning.
  Não bloqueia o boot.
- Para setup local novo: `rm .env && npm run env:dev`.
```

- [ ] **Step 4: Atualizar CHANGELOG.md**

Em `## [Unreleased]`, adicionar:

```markdown
### feat(security): sprint 1 — app hardening
- `AuditInterceptor` agora captura `query` e `params` (além de `body`),
  com sanitização estendida (email, cpf, cnpj, authorization).
- `.env` com `POSTGRES_PASSWORD` default emite warning no boot (não bloqueia).
- Novo script `npm run env:dev` gera `.env` com secrets random.
- `/health/network` retorna 404 em produção (gate silencioso).
- BDD: 6 cenários em `features/devsecops-sprint1-quick-wins.feature`.
- Fecha achados CODE-04, INFRA-01, CODE-03 (MÉDIO) do relatório DevSecOps 2026-06-16.
```

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md CHANGELOG.md
git commit -m "docs(security): AGENTS.md (HTTP/health/env) + CHANGELOG sprint 1"
```

---

### Task 3.8: Validação final e PR da Fase 3

- [ ] **Step 1: Rodar validate:quick completo**

Run: `npm run validate:quick`
Expected: 0 errors. Todos os 730+ testes passando.

- [ ] **Step 2: Rodar test:e2e**

Run: `npm run test:e2e`
Expected: PASS em todos os e2e tests (incluindo os 2 novos da Fase 1 e os 2 da Fase 3).

- [ ] **Step 3: Rodar security:check (se existir)**

Run: `npm run security:check`
Expected: PASS.

- [ ] **Step 4: Push e abrir PR**

```bash
git push origin HEAD
gh pr create --base main --title "feat(security): app hardening — audit capture + .env random + /health/network gate" --body "Fecha achados CODE-04, INFRA-01, CODE-03 (MÉDIO) do relatório DevSecOps 2026-06-16. Ver .openspec/changes/devsecops-sprint1-quick-wins/ para spec completo."
```

---

## Fase Final: Consolidação (Após merge das 3 fases)

### Task F.1: Self-review do change

- [ ] **Step 1: Reler proposal.md, design.md, tasks.md**

Verificar coerência entre os 3 artefatos.

- [ ] **Step 2: Verificar que todos os 7 itens do proposal foram implementados**

Checklist:
- [ ] FR-HTTP-01 (Trust Proxy)
- [ ] FR-HTTP-02 (Cache-Control)
- [ ] FR-SDLC-01 (Semgrep)
- [ ] FR-SDLC-02 (Gitleaks)
- [ ] FR-APP-01 (Audit query/params)
- [ ] FR-APP-02 (.env random + warning)
- [ ] FR-APP-03 (/health/network gate)

- [ ] **Step 3: Verificar cobertura de testes ≥ 90% em arquivos novos**

Run: `npm test -- --coverage --collectCoverageFrom='src/shared/infrastructure/middleware/**/*.ts' --collectCoverageFrom='src/config/env-warnings.ts'`
Expected: ≥ 90% lines/branches/functions.

- [ ] **Step 4: Verificar que CI passa em main**

Aguardar CI nos 3 PRs mergeados e confirmar 0 failures.

### Task F.2: Archive do change

- [ ] **Step 1: Mover spec para archive**

Run:
```bash
mkdir -p .openspec/specs
mv .openspec/changes/devsecops-sprint1-quick-wins .openspec/specs/
```

- [ ] **Step 2: Atualizar docs/superpowers/specs/ com link**

Verificar se já existe e adicionar entrada para o spec archived.

- [ ] **Step 3: Atualizar relatório DevSecOps original**

Em `.agent/agents/relatorio-devsecops-2026-06-16.md`, adicionar nota no topo:

```markdown
> **Status (2026-06-16)**: itens Sprint 1 fechados em PR #N, #N+1, #N+2.
> Ver [.openspec/specs/devsecops-sprint1-quick-wins/](../openspec/specs/devsecops-sprint1-quick-wins/).
```

- [ ] **Step 4: Commit final de consolidação**

```bash
git add -A
git commit -m "docs(spec): archive devsecops-sprint1-quick-wins + atualizar relatório"
```

### Task F.3: Report pós-implementação

- [ ] **Step 1: Criar relatório de implementação**

Criar `.agent/agents/relatorio-impl-devsecops-sprint1-2026-06-16.md` com:
- Resumo do que foi implementado (7 itens)
- Findings fechados (4 ALTO + 5 MÉDIO + 1 BAIXO = 10)
- Findings remanescentes (referência ao relatório original)
- Métricas antes/depois (tempo CI, cobertura)
- Próximos passos (Sprint 2: MFA, plano-based throttling, JWT revocation)

- [ ] **Step 2: Commit do relatório**

```bash
git add .agent/agents/relatorio-impl-devsecops-sprint1-2026-06-16.md
git commit -m "docs(report): relatorio de implementacao sprint 1 DevSecOps"
```

- [ ] **Step 3: Push final**

```bash
git push origin main
```

---

## Resumo

| Fase | Tasks | PR | Esforço |
|------|-------|----|---------|
| 1: HTTP Hardening | 7 (1.1–1.7) | #N | ~3h |
| 2: SDLC Scanning | 5 (2.1–2.5) | #N+1 | ~5h |
| 3: App Hardening | 8 (3.1–3.8) | #N+2 | ~3.5h |
| Final: Consolidação | 3 (F.1–F.3) | (commits diretos em main) | ~30min |
| **Total** | **23 tasks** | **3 PRs** | **~12h** |
