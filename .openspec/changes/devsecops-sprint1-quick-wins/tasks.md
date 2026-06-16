# DevSecOps Sprint 1 — Quick Wins — Tasks

> **Change**: `devsecops-sprint1-quick-wins`
> **Data**: 2026-06-16
> **Proposal**: [proposal.md](./proposal.md)
> **Design**: [design.md](./design.md)

---

## Visão Geral

Tasks atômicas organizadas em **3 fases**. Cada fase pode ser mergeada
como PR independente. Cada task tem checkbox e é commitável isoladamente.

**Total de tasks**: ~35 (entre fases)
**Total de PRs sugeridos**: 3 (1 por fase)

---

## Fase 1: HTTP Hardening (~3h, 1 PR)

### 1.1 — BDD: Cenários HTTP

- [ ] Adicionar `Funcionalidade: HTTP Hardening` em
      `features/devsecops-sprint1-quick-wins.feature` com cenários:
  - [ ] Cenário: Trust proxy reflete X-Forwarded-For
  - [ ] Cenário: Trust proxy rejeita X-Forwarded-For forjado sem proxy
  - [ ] Cenário: Cache-Control: no-store em /auth/login
  - [ ] Cenário: Cache-Control: no-store em /usuarios/*
  - [ ] Cenário: Cache-Control AUSENTE em /health/live

### 1.2 — ATDD: E2E tests

- [ ] Criar `test/http-hardening.e2e-spec.ts` com 5 testes (1 por cenário)
- [ ] Rodar e2e — devem **FAIL** (Red phase)
- [ ] Validar que failure é por ausência do código (não setup)

### 1.3 — TDD: Unit tests

- [ ] Criar `src/shared/infrastructure/middleware/cache-control.middleware.spec.ts`
      (TDD: começar com testes que falham)
- [ ] Implementar `CacheControlMiddleware.use()` — fazer passar (Green)
- [ ] Refatorar se necessário (Refactor)

### 1.4 — Production code

- [ ] Criar `src/shared/infrastructure/middleware/cache-control.middleware.ts`
      com cabeçalho:
      ```ts
      // BDD: features/devsecops-sprint1-quick-wins.feature:Funcionalidade: HTTP Hardening
      // SDD: .openspec/changes/devsecops-sprint1-quick-wins/design.md#fase-1
      // ATDD: test/http-hardening.e2e-spec.ts
      // TDD: src/shared/infrastructure/middleware/cache-control.middleware.spec.ts
      ```
- [ ] Adicionar `TRUST_PROXY` ao `src/config/env.validation.ts` (Joi.string().default('loopback'))
- [ ] Adicionar getter `trustProxy` em `src/shared/infrastructure/config/app.config.ts`
- [ ] Modificar `src/main.ts` para:
  - [ ] Configurar `trustProxy` no Fastify
  - [ ] Aplicar `CacheControlMiddleware` globalmente (via `app.use(...)` ou `configure(consumer)`)

### 1.5 — Verificação

- [ ] Rodar `npm run test` — todos passam
- [ ] Rodar `npm run test:e2e` — todos passam
- [ ] Rodar `npm run validate:quick` — passa
- [ ] `npm run security:check` — passa
- [ ] Confirmar que nenhum e2e existente quebrou

### 1.6 — Commit

- [ ] `git add` + `git commit -m "feat(security): http hardening — trust proxy + cache-control"`
- [ ] `git push` + abrir PR `#N: feat(security): http hardening`

---

## Fase 2: SDLC Scanning (~5h, 1 PR)

### 2.1 — BDD: Cenários SDLC

- [ ] Adicionar `Funcionalidade: SDLC Scanning` em
      `features/devsecops-sprint1-quick-wins.feature` com cenários:
  - [ ] Cenário: Semgrep detecta SQL injection em src/
  - [ ] Cenário: Gitleaks detecta JWT_SECRET hardcoded
  - [ ] Cenário: Allowlist evita F+ em .env.example
  - [ ] Cenário: Allowlist evita F+ em *.spec.ts

### 2.2 — Configuração local

- [ ] Criar `.semgrep.yml` com config conservadora
- [ ] Criar `.gitleaks.toml` com allowlist explícita
- [ ] Rodar Semgrep local: `docker run --rm -v $(pwd):/src returntocorp/semgrep semgrep ci --config p/typescript --config p/security-audit --config p/owasp-top-ten --config p/jwt`
- [ ] Rodar Gitleaks local: `docker run --rm -v $(pwd):/repo zricethezav/gitleaks:latest detect --source /repo --config /repo/.gitleaks.toml --no-banner`
- [ ] Resolver quaisquer F+ que aparecerem (ajustar allowlist ou refatorar código)
- [ ] Validar que **NENHUM** secret real está no histórico (`git log -p | grep -iE "password|secret|token"`)

### 2.3 — CI: workflows

- [ ] Modificar `.github/workflows/ci.yml` para adicionar:
  - [ ] Job `semgrep` em paralelo com `build`
  - [ ] Job `gitleaks` em paralelo com `build`
  - [ ] `cancel-in-progress: true` para jobs redundantes

### 2.4 — Teste do CI

- [ ] Push para branch de teste
- [ ] Confirmar que Semgrep + Gitleaks rodam em paralelo
- [ ] Confirmar tempo total ≤ 3 min adicionais
- [ ] Em uma branch de teste, adicionar `const x = "SELECT * FROM users WHERE id = " + userId;` e
      confirmar que Semgrep bloqueia
- [ ] Em uma branch de teste, adicionar `const SECRET = "abc123def456";` e
      confirmar que Gitleaks bloqueia
- [ ] Reverter branches de teste (não merge)

### 2.5 — Verificação

- [ ] `npm run validate:quick` — passa (CI não roda local)
- [ ] Code review do PR

### 2.6 — Commit

- [ ] `git commit -m "ci(security): add semgrep + gitleaks to pipeline"`
- [ ] Abrir PR `#N: ci(security): add semgrep + gitleaks`

---

## Fase 3: App Hardening (~3.5h, 1 PR)

### 3.1 — BDD: Cenários App

- [ ] Adicionar `Funcionalidade: App Hardening` em
      `features/devsecops-sprint1-quick-wins.feature` com cenários:
  - [ ] Cenário: Audit log captura query sanitizado
  - [ ] Cenário: Audit log captura params
  - [ ] Cenário: .env com default password emite warning
  - [ ] Cenário: /health/network 200 em dev
  - [ ] Cenário: /health/network 404 em prod
  - [ ] Cenário: /health/live 200 sempre

### 3.2 — TDD: Audit Interceptor (RED→GREEN)

- [ ] Modificar `src/shared/infrastructure/interceptors/audit.interceptor.spec.ts`:
  - [ ] Adicionar teste: `captures query with PII redacted`
  - [ ] Adicionar teste: `captures params with sensitive keys redacted`
  - [ ] Adicionar teste: `redacts email, cpf, cnpj in query/params`
- [ ] Rodar testes — devem **FAIL**

- [ ] Modificar `src/shared/infrastructure/interceptors/audit.interceptor.ts`:
  - [ ] Adicionar `query` e `params` ao `detalhes` (com sanitização)
  - [ ] Estender lista de chaves sensíveis: `['senha','password','token','secret','email','cpf','cnpj','authorization']`
- [ ] Rodar testes — devem **PASS**

### 3.3 — ATDD: Audit E2E

- [ ] Criar `test/audit-query-params.e2e-spec.ts` com 2 testes (query + params)
- [ ] Rodar e2e — devem passar

### 3.4 — TDD: .env validation

- [ ] Modificar `src/config/env.validation.ts`:
  - [ ] Confirmar que `POSTGRES_PASSWORD: Joi.string().required()` (NÃO adicionar `min(16)` — CI usa `postgres`)
- [ ] Modificar `src/shared/infrastructure/config/app.config.ts` (ou criar `src/config/env-warnings.ts`):
  - [ ] Adicionar método `warnOnDefaultPasswords()` que detecta defaults conhecidos e loga warning via Pino
  - [ ] Defaults a detectar: `'postgres'`, `'password'`, `'admin'`, `'123456'`, `'changeme'`
- [ ] Chamar `warnOnDefaultPasswords()` no `main.ts` boot
- [ ] Criar/atualizar teste:
  - [ ] Teste: `warnOnDefaultPasswords()` emite warning estruturado quando password = 'postgres'
  - [ ] Teste: `warnOnDefaultPasswords()` NÃO emite warning quando password = random hex 32+

### 3.5 — TDD: .env.dev + script

- [ ] Criar `.env.dev` (template) com placeholders + comentários
- [ ] Adicionar script `env:dev` em `package.json` (Node one-liner)
- [ ] Testar localmente:
  - [ ] `rm .env && npm run env:dev` → gera `.env` com secrets random
  - [ ] Validar que secrets têm 32+ chars

### 3.6 — TDD: /health/network gate

- [ ] Modificar `src/shared/infrastructure/health/health.controller.spec.ts`:
  - [ ] Adicionar teste: `checkNetwork() returns 200 when NODE_ENV=development`
  - [ ] Adicionar teste: `checkNetwork() throws NotFoundException when NODE_ENV=production`
- [ ] Rodar testes — devem **FAIL**
- [ ] Modificar `src/shared/infrastructure/health/health.controller.ts`:
  - [ ] Adicionar guard `if (process.env.NODE_ENV === 'production') throw new NotFoundException()`
- [ ] Rodar testes — devem **PASS**

### 3.7 — Documentação

- [ ] Atualizar `AGENTS.md`:
  - [ ] Seção "Segurança HTTP" — documentar trust proxy + cache-control
  - [ ] Seção "Health checks" — documentar gate /health/network
  - [ ] Seção "Ambiente" — documentar .env.dev e script env:dev
- [ ] Atualizar `CHANGELOG.md` com a entrada `## [Unreleased] - feat(security): sprint 1 quick wins`
- [ ] Atualizar `README.md` se houver seção de setup

### 3.8 — Verificação

- [ ] `npm run validate:quick` — passa
- [ ] `npm run test:e2e` — passa
- [ ] `npm run security:check` — passa
- [ ] Confirmar que e2e tests de auth/password-recovery/tenant-rate-limit continuam passando

### 3.9 — Commit

- [ ] `git commit -m "feat(security): app hardening — audit capture + .env random + /health/network gate"`
- [ ] Abrir PR `#N: feat(security): app hardening`

---

## Fase Final: Consolidação (Após merge das 3 fases)

### F.1 — Self-review do change

- [ ] Reler `proposal.md`, `design.md`, `tasks.md` — verificar coerência
- [ ] Verificar que todos os 7 itens do proposal foram implementados
- [ ] Verificar cobertura de testes ≥ 90% em arquivos novos
- [ ] Verificar que CI (Semgrep + Gitleaks) passa em main

### F.2 — Archive

- [ ] Mover `.openspec/changes/devsecops-sprint1-quick-wins/` →
      `.openspec/specs/devsecops-sprint1-quick-wins/`
- [ ] Atualizar `docs/superpowers/specs/` com link para spec archived
- [ ] Atualizar `.agent/agents/relatorio-devsecops-2026-06-16.md` com
      "Status: items Sprint 1 fechados em PR #N, #N+1, #N+2"
- [ ] Commit `docs(spec): archive devsecops-sprint1-quick-wins`

### F.3 — Report pós-implementação

- [ ] Criar `.agent/agents/relatorio-impl-devsecops-sprint1-2026-06-XX.md`
      com:
  - [ ] Resumo do que foi implementado
  - [ ] Findings fechados (4 ALTO + 5 MÉDIO + 1 BAIXO)
  - [ ] Findings remanescentes (referência ao relatório original)
  - [ ] Métricas antes/depois (tempo CI, cobertura)
  - [ ] Próximos passos (Sprint 2)

---

## Dependências entre Tasks

```text
Fase 1 ──┐
         ├──→ independentes (paralelizáveis)
Fase 2 ──┤
         │
Fase 3 ──┘
            │
            ↓
       F.1 Self-review
            │
            ↓
       F.2 Archive
            │
            ↓
       F.3 Report
```

**Sugestão**: Fases 1 e 2 podem ser desenvolvidas em paralelo (em branches
separadas). Fase 3 depende de Fase 1 (audit interceptor) ser mergeada
primeiro, ou pode ser mergeada junto com Fase 1 num mesmo PR.

---

## Comandos Úteis (por fase)

```bash
# Fase 1
npm run test -- cache-control
npm run test:e2e -- http-hardening
npm run validate:quick

# Fase 2
docker run --rm -v $(pwd):/src returntocorp/semgrep:latest semgrep ci --config p/typescript --config p/security-audit --config p/owasp-top-ten --config p/jwt
docker run --rm -v $(pwd):/repo zricethezav/gitleaks:latest detect --source /repo --config /repo/.gitleaks.toml --no-banner

# Fase 3
npm run test -- audit-interceptor
npm run test -- health.controller
npm run env:dev
npm run validate:quick
```

---

## Notas

- Cada task DEVE ser commitável isoladamente (conventional commits)
- Cada fase DEVE ter 1 PR com no máximo ~5 arquivos alterados
- Rastreabilidade `// BDD/SDD/ATDD/TDD` é **OBRIGATÓRIA** em todo
  arquivo de produção
- Se algum AC falhar, NÃO fechar a fase — voltar e ajustar
- Consultar `.agent/agents/relatorio-devsecops-2026-06-16.md` para
  contexto completo
