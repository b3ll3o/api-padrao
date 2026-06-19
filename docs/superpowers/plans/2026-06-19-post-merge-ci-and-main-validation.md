# Post-Merge CI + Main Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar workflow GitHub Actions `post-merge.yml` que valida a `main` após cada push, executar validação local completa (validate + start:dev + análise multi-agente) e corrigir bloqueantes.

**Architecture:** Workflow CI declarativo em YAML + processo de validação local iterativo (TDD-style: rodar → capturar erros → corrigir → re-rodar) com classificação bloqueante/backlog. Sub-agentes de qualidade/segurança/arquitetura disparam em paralelo.

**Tech Stack:** GitHub Actions (ubuntu-latest, Node 20), NestJS 11, Prisma 6, Fastify, Jest, Docker Compose, PostgreSQL 16, Redis 7, sub-agentes `analista-qualidade` / `analista-backend` / `analista-dev-sec-ops`.

**Spec:** [docs/superpowers/specs/2026-06-19-post-merge-ci-and-main-validation-design.md](../specs/2026-06-19-post-merge-ci-and-main-validation-design.md)

**Estado pré-existente (já commitado em 2026-06-19):**
- `bac4d44` docs(spec): design — CI pós-merge + validação completa da main
- `bc84a1a` fix(middleware): usar originalUrl para Fastify no CacheControlMiddleware
- 733 testes passando (verificado pelo husky pre-commit)

---

## File Structure

**Criar:**
- `.github/workflows/post-merge.yml` — workflow de validação pós-merge com 3 jobs paralelos
- `docs/superpowers/plans/2026-06-19-post-merge-validation-report.md` — relatório final (gerado em Task 12)

**Modificar (potencial, se bloqueantes forem encontrados):**
- `src/**/*.ts` — fixes de bloqueantes, um commit atômico por fix

**Não tocar (decisão do usuário):**
- `.env.tmp` — temporário, não commitado
- `scripts/smoke-*.ts` — novos, não commitados
- `ci.yml` (existente) — sem mudança
- Branches remotas `feature/devsecops-sprint1-*` — manter como histórico

---

## Task 1: Criar `.github/workflows/post-merge.yml`

**Files:**
- Create: `.github/workflows/post-merge.yml`

- [ ] **Step 1: Criar arquivo com conteúdo completo**

Conteúdo exato (criar via Write tool em `.github/workflows/post-merge.yml`):

```yaml
# Post-merge validation — runs only on direct push to main (not on PRs).
# Complementary to ci.yml (which runs on pull_request + push:main with lighter
# jobs for fast PR feedback).
# Spec: docs/superpowers/specs/2026-06-19-post-merge-ci-and-main-validation-design.md
name: post-merge

on:
  push:
    branches: [main]

# Cancel in-progress runs: rare event, but if multiple pushes happen quickly
# (e.g., post-merge backport + follow-up fix), only the latest matters.
concurrency:
  group: post-merge-${{ github.ref }}
  cancel-in-progress: true

jobs:
  # [Sprint2-PostMerge] Full integration gate — equivalent to local
  # `npm run validate` (lint + build + test + test:e2e). Runs with Postgres
  # + Redis services to mirror production dependencies.
  integration:
    name: Integration (validate)
    runs-on: ubuntu-latest
    permissions:
      contents: read
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: api-padrao-test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: package-lock.json

      - name: Install dependencies
        run: npm ci --no-audit --no-fund

      - name: Run E2E Test Migrations
        run: npm run test:migrate
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/api-padrao-test

      - name: Run validate (lint + build + test + e2e)
        run: npm run validate
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/api-padrao-test

  # [Sprint2-PostMerge] Coverage gate — runs jest --coverage and enforces
  # the 80% threshold defined in package.json#jest.coverageThreshold.
  # Threshold is enforced by jest itself (test:cov fails if below).
  coverage:
    name: Coverage gate
    runs-on: ubuntu-latest
    permissions:
      contents: read
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: api-padrao-test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: package-lock.json

      - name: Install dependencies
        run: npm ci --no-audit --no-fund

      - name: Run coverage
        run: npm run test:cov
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/api-padrao-test

      - name: Upload coverage artifact
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/
          retention-days: 30

  # [Sprint2-PostMerge] Dependency audit — blocks on HIGH+ CVEs in npm audit,
  # warns on outdated packages (does not fail).
  dependency-audit:
    name: Dependency audit
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: package-lock.json

      - name: Install dependencies
        run: npm ci --no-audit --no-fund

      - name: Audit dependencies (block on high+)
        run: npm audit --audit-level=high

      - name: Check outdated packages (warning only)
        run: npm outdated --long
        continue-on-error: true
```

- [ ] **Step 2: Validar sintaxe YAML localmente**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/post-merge.yml')); print('OK')"`
Expected: `OK`

Se falhar: revisar indentação e estrutura.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/post-merge.yml
git commit -m "ci(workflow): add post-merge.yml with integration + coverage + dependency-audit

- runs only on push:main (complementary to ci.yml)
- 3 jobs paralelos: integration (validate), coverage (threshold 80%),
  dependency-audit (block on high+ CVE, warn on outdated)
- spec: docs/superpowers/specs/2026-06-19-post-merge-ci-and-main-validation-design.md"
```

Expected: commit hash returned, sem erros.

---

## Task 2: Subir ambiente dev (Postgres + Redis)

**Files:** Nenhum (apenas shell)

- [ ] **Step 1: Verificar se `docker compose.dev.yml` tem serviço Redis**

Run: `grep -q "^  redis:" docker-compose.dev.yml && echo "HAS_REDIS" || echo "NO_REDIS"`

Expected output: ou `HAS_REDIS` ou `NO_REDIS` (vamos lidar com cada caso abaixo).

- [ ] **Step 2: Subir Postgres (sempre disponível no dev compose)**

Run: `docker compose -f docker-compose.dev.yml up -d postgres`

Expected: container `postgres_container_dev` rodando. Se já estiver rodando, no-op.

Verify: `docker ps --filter "name=postgres_container_dev" --format "{{.Names}} {{.Status}}"`
Expected: `postgres_container_dev Up X minutes (healthy)`

- [ ] **Step 3: Garantir Redis disponível**

**Se HAS_REDIS no Step 1**: Run: `docker compose -f docker-compose.dev.yml up -d redis`
Expected: container redis rodando.

**Se NO_REDIS no Step 1**: Tentar Redis local (já pode estar rodando):
Run: `redis-cli -h localhost -p 6379 ping`
Expected: `PONG`

Se não responder, opções (escolher a mais simples disponível):
- (a) `docker run -d --name redis_temp -p 6379:6379 redis:7-alpine`
- (b) Instalar redis-server localmente (apt/brew)
- (c) Pular e registrar como backlog (afeta apenas testes que dependem de Redis)

- [ ] **Step 4: Verificar health de ambos**

Run:
```bash
docker exec postgres_container_dev pg_isready -U postgres -d api_db && \
  redis-cli -h localhost -p 6379 ping
```
Expected: `accepting connections` + `PONG` (em sequência).

---

## Task 3: Rodar migrations do dev database

**Files:** Nenhum

- [ ] **Step 1: Aplicar migrations no banco de dev**

Run:
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/api_db?schema=public" \
  npx prisma migrate deploy
```

Expected: `X migrations are already up to date.` ou lista de migrations aplicadas. Sem erros.

Se falhar com "schema drift" ou similar: **PARAR e reportar ao usuário** antes de `prisma migrate reset` (destrutivo).

- [ ] **Step 2: Verificar Prisma Client gerado**

Run: `ls -la node_modules/.prisma/client/index.d.ts 2>&1 | head -2`
Expected: arquivo existe, gerado por `prisma generate` (executado automaticamente por `migrate deploy`).

Se não existir: Run: `npx prisma generate`

---

## Task 4: Rodar `npm run validate` (lint + build + test + e2e)

**Files:** Nenhum (captura output)

- [ ] **Step 1: Rodar validate e capturar output**

Run:
```bash
npm run validate 2>&1 | tee /tmp/validate-output-$(date +%Y%m%d-%H%M%S).log
```

Expected (em main limpa): exit 0, todos os jobs verdes.

- [ ] **Step 2: Analisar resultado**

Se exit 0: ✅ Task 4 verde, pular para Task 5.
Se exit != 0: capturar resumo dos erros. Esses são **bloqueantes** para correção (Task 9).

Comando de resumo: `tail -100 /tmp/validate-output-*.log | grep -E "FAIL|Error|✖" | head -30`

- [ ] **Step 3: Anotar no relatório temporário**

Criar arquivo `/tmp/findings-raw.md` com:

```markdown
## Validate output (Task 4)
- Status: [PASS/FAIL]
- Timestamp: [data]
- Errors: [resumo ou "none"]
- Log file: [path completo do log]
```

---

## Task 5: Disparar sub-agentes em paralelo (qualidade + backend + devsecops)

**Files:** Nenhum (cada sub-agente produz output próprio)

Esta task produz três análises em paralelo. O engenheiro dispara os três agentes simultaneamente (em uma única mensagem com múltiplas invocações de `Agent` tool) e aguarda todos retornarem.

- [ ] **Step 1: Disparar `analista-qualidade`**

Tool: `Agent` com `subagent_type: "analista-qualidade"`, `prompt`:

> Faça uma auditoria de qualidade completa no branch `main` (HEAD atual) do projeto `api-padrao` (NestJS 11 + Prisma 6 + Fastify). Foque em: cobertura de testes (gap analysis), test smells, vacuous tests, design de testes, práticas Jest. Retorne findings estruturados com severidade (CRITICAL/HIGH/MEDIUM/LOW), arquivo:linha, descrição, e recomendação. Não modifique código — apenas reporte. Use `git log main -10 --oneline` para contexto dos commits recentes.

Capturar output em `/tmp/agent-qualidade.md`.

- [ ] **Step 2: Disparar `analista-backend`**

Tool: `Agent` com `subagent_type: "analista-backend"`, `prompt`:

> Faça uma auditoria de arquitetura completa no branch `main` (HEAD atual) do projeto `api-padrao` (NestJS 11 + Prisma 6 + Fastify + PostgreSQL 16 + Redis + BullMQ + OpenTelemetry). Foque em: aderência a Hexagonal/DDD/SOLID, gaps de bounded contexts, acoplamento, performance, observability, API design, distributed systems. Retorne findings estruturados com severidade (CRITICAL/HIGH/MEDIUM/LOW), arquivo:linha, descrição, e recomendação. Não modifique código — apenas reporte.

Capturar output em `/tmp/agent-backend.md`.

- [ ] **Step 3: Disparar `analista-dev-sec-ops`**

Tool: `Agent` com `subagent_type: "analista-dev-sec-ops"`, `prompt`:

> Faça uma auditoria DevSecOps completa no branch `main` (HEAD atual) do projeto `api-padrao` (NestJS 11 + Prisma 6 + Fastify + TypeScript). Foque em: SAST, secrets scanning, dependências vulneráveis, configurações de segurança, container security, supply chain, threat model OWASP Top 10. Retorne findings estruturados com severidade (CRITICAL/HIGH/MEDIUM/LOW), arquivo:linha, descrição, e recomendação. Não modifique código — apenas reporte. Verifique também `.gitleaks.toml` e `.semgrep.yml` em busca de gaps de cobertura.

Capturar output em `/tmp/agent-devsecops.md`.

- [ ] **Step 4: Consolidar findings**

Criar `/tmp/findings-consolidated.md`:

```markdown
## Findings consolidados — multi-agente

### Fonte 1: analista-qualidade
[resumo executivo + top 5 findings]

### Fonte 2: analista-backend
[resumo executivo + top 5 findings]

### Fonte 3: analista-dev-sec-ops
[resumo executivo + top 5 findings]

### Estatísticas
- Total findings: [N]
- CRITICAL: [N]
- HIGH: [N]
- MEDIUM: [N]
- LOW: [N]
```

---

## Task 6: Subir `start:dev` em background e validar boot

**Files:** Nenhum

- [ ] **Step 1: Limpar processos anteriores (se houver)**

```bash
pkill -f "nest start --watch" 2>/dev/null || true
pkill -f "node.*dist/main" 2>/dev/null || true
sleep 2
```

- [ ] **Step 2: Subir `start:dev` em background**

Tool: `Bash` com `run_in_background: true`, `command: "npm run start:dev > /tmp/start-dev.log 2>&1"`

- [ ] **Step 3: Aguardar Nest ficar pronto (poll log)**

Loop de até 60s:

```bash
for i in {1..30}; do
  if grep -q "Nest application successfully started" /tmp/start-dev.log 2>/dev/null; then
    echo "READY after ${i} polls"
    break
  fi
  sleep 2
done
tail -50 /tmp/start-dev.log
```

Expected: "READY after N polls" e log do Nest mostrando porta 3000 + módulos inicializados.

Se timeout: capturar log, classificar como bloqueante (boot fail), ir para Task 9.

- [ ] **Step 4: Verificar health check**

Run: `curl -sS -o /tmp/health.json -w "HTTP %{http_code}\n" http://localhost:3000/health`
Expected: `HTTP 200` e JSON com `status: "ok"` ou similar.

Se != 200: bloqueante (health check fail), ir para Task 9.

- [ ] **Step 5: Capturar log final e parar o processo**

```bash
cp /tmp/start-dev.log /tmp/start-dev-final-$(date +%Y%m%d-%H%M%S).log
pkill -f "nest start --watch"
sleep 2
```

- [ ] **Step 6: Anotar no relatório temporário**

Adicionar a `/tmp/findings-raw.md`:

```markdown
## Start:dev validation (Task 6)
- Boot status: [READY/TIMEOUT/ERROR]
- Health check: [HTTP code]
- Log file: [path]
- Erros: [resumo ou "none"]
```

---

## Task 7: Validar `post-merge.yml` (sanity check)

**Files:** Nenhum

- [ ] **Step 1: Verificar que o workflow é detectável pelo git**

Run: `git ls-files .github/workflows/`
Expected: tanto `ci.yml` quanto `post-merge.yml` listados.

- [ ] **Step 2: Verificar tamanho razoável**

Run: `wc -l .github/workflows/post-merge.yml`
Expected: ~140-180 linhas (sanity, não hard limit).

- [ ] **Step 3: Diff contra HEAD~1**

Run: `git show --stat HEAD`
Expected: arquivo `.github/workflows/post-merge.yml` aparece como created, ~150 linhas.

---

## Task 8: Classificar findings e decidir ações

**Files:** `/tmp/findings-raw.md`, `/tmp/findings-consolidated.md`

- [ ] **Step 1: Listar todos os findings**

Criar `/tmp/findings-classified.md`:

```markdown
## Findings classificados

| # | Fonte | Severidade | Descrição resumida | Ação |
|---|-------|------------|--------------------|------|
| 1 | validate | HIGH | [descrição] | FIX |
| 2 | start:dev | CRITICAL | [descrição] | FIX |
| 3 | qualidade | MEDIUM | [descrição] | ISSUE |
| ... |
```

- [ ] **Step 2: Aplicar critério de classificação**

**Bloqueante (FIX imediato)** = qualquer um:
- Validate exit != 0 (test/lint/build falha)
- Start:dev não boota OU /health != 200
- CVE HIGH+ no npm audit
- Secret leak detectado
- Falha de typecheck em código de produção

**Médio (ISSUE priority:medium)** = qualquer um:
- Coverage < 80% em módulo core
- Code smell arquitetural (acoplamento, god class)
- Anti-pattern Hexagonal
- Falta de teste em fluxo crítico

**Baixo (ISSUE priority:low)** = qualquer um:
- Lint warning
- Dependência outdated
- Code style
- Comment outdated

- [ ] **Step 3: Listar bloqueantes para Task 9**

Adicionar ao `/tmp/findings-classified.md`:

```markdown
## Bloqueantes para correção (Task 9)
1. [descrição + arquivo:linha]
2. [descrição + arquivo:linha]
N. ...

Se zero bloqueantes: Task 9 vira "no-op", pular para Task 10.
```

---

## Task 9: Corrigir bloqueantes (commits atômicos)

**Files:** `src/**/*.ts` (e potencialmente `test/`, `prisma/`, `package.json`)

**Esta task é flexível**: o número de sub-tarefas depende de quantos bloqueantes foram encontrados. Se zero bloqueantes, pular para Task 10.

Para cada bloqueante N:

- [ ] **Sub-task 9.N: Fix bloqueante #N**

- [ ] **Step 1: Reproduzir o erro (red)**

Se for test failure: rodar o teste específico e ver falhar.
Se for build error: rodar `npm run build`.
Se for start:dev: rodar `npm run start:dev` em background e ver log.

- [ ] **Step 2: Implementar fix mínimo**

Modificar `src/...` (ou outro arquivo relevante) com a correção mínima necessária. Não refatorar além do necessário.

- [ ] **Step 3: Verificar fix (green)**

Re-rodar o comando do Step 1. Deve passar.

- [ ] **Step 4: Rodar suite completa**

Run: `npm run validate:quick` (lint + typecheck + build + test, sem e2e — mais rápido)
Expected: verde. Se não, voltar para Step 2.

- [ ] **Step 5: Commit atômico**

```bash
git add <arquivos modificados>
git commit -m "fix(post-merge): <descrição concisa do fix>

- problema: <o que estava quebrado>
- solução: <o que foi mudado>
- teste: <qual teste valida>
- spec: docs/superpowers/specs/2026-06-19-post-merge-ci-and-main-validation-design.md"
```

Repetir para cada bloqueante.

---

## Task 10: Re-rodar validate para confirmar verde

**Files:** Nenhum

- [ ] **Step 1: Re-rodar `npm run validate` completo**

Run:
```bash
npm run validate 2>&1 | tee /tmp/validate-final-$(date +%Y%m%d-%H%M%S).log
```

Expected: exit 0.

- [ ] **Step 2: Re-rodar `start:dev` smoke (opcional, se houve fix de boot)**

Se Task 9 tocou em código de boot (main.ts, AppModule, config):
- Repetir Task 6 (Step 1-5) para confirmar `/health` 200.
- Se != 200, voltar para Task 9.

- [ ] **Step 3: Verificar cobertura**

Run: `cat coverage/coverage-summary.json | python3 -c "import json,sys; d=json.load(sys.stdin)['total']; print(f\"stmts={d['statements']['pct']}% branches={d['branches']['pct']}% funcs={d['functions']['pct']}% lines={d['lines']['pct']}%\")"`

Expected: todos >= 80%. Se algum < 80%: bloqueante (volta Task 9).

---

## Task 11: Criar issues de backlog (findings não-bloqueantes)

**Files:** Nenhum (issues via `gh` CLI)

Para cada finding classificado como MEDIUM ou LOW em Task 8:

- [ ] **Step 1: Criar issue**

Run:
```bash
gh issue create \
  --title "<severidade>: <descrição curta>" \
  --body "## Contexto
[do finding classificado]

## Detalhes
- Arquivo: <path>
- Linha: <linha>
- Severidade: <MEDIUM/LOW>
- Origem: <qualidade|backend|devsecops>

## Recomendação
[do agente]

## Referências
- spec: docs/superpowers/specs/2026-06-19-post-merge-ci-and-main-validation-design.md" \
  --label "post-merge-backlog,priority:<medium|low>"
```

Repetir para cada finding não-bloqueante.

- [ ] **Step 2: Listar issues criadas**

Run: `gh issue list --label post-merge-backlog --state open --json number,title,labels`

Capturar output para Task 12.

---

## Task 12: Relatório final

**Files:**
- Create: `docs/superpowers/plans/2026-06-19-post-merge-validation-report.md`

- [ ] **Step 1: Compilar relatório**

Criar arquivo com:

```markdown
# Relatório — Validação Pós-Merge da main (2026-06-19)

**Data de execução:** [timestamp]
**Branch:** main @ [commit hash]
**Spec:** docs/superpowers/specs/2026-06-19-post-merge-ci-and-main-validation-design.md

## Resumo executivo

| Gate | Status | Notas |
|------|--------|-------|
| `npm run validate` | ✅ PASS / ❌ FAIL | [resumo] |
| `start:dev` boot | ✅ PASS / ❌ FAIL | [resumo] |
| `/health` 200 | ✅ PASS / ❌ FAIL | [resumo] |
| Coverage >= 80% | ✅ PASS / ❌ FAIL | [stmts/branches/funcs/lines] |
| Post-merge workflow | ✅ Criado | [.github/workflows/post-merge.yml] |

## Workflow post-merge.yml

- **Trigger**: push em main
- **Jobs**: integration (validate), coverage (threshold 80%), dependency-audit (high+)
- **Paralelismo**: 3 jobs simultâneos
- **Cancel in-progress**: sim (concurrency group)

## Bloqueantes corrigidos

| # | Descrição | Commit | Teste de regressão |
|---|-----------|--------|-------------------|
| 1 | [descrição] | [hash] | [test] |
| N | ... | ... | ... |

Total: N commits com prefixo `fix(post-merge):`

## Findings viraram backlog (issues abertas)

| # | Severidade | Título | Origem |
|---|-----------|--------|--------|
| 1 | MEDIUM | [título] | qualidade |
| 2 | LOW | [título] | devsecops |
| N | ... | ... | ... |

Total: N issues com label `post-merge-backlog`.

## Estatísticas de findings

- Total analisados: N
- CRITICAL: N
- HIGH: N
- MEDIUM: N
- LOW: N
- Corrigidos: N
- Backlog: N

## Próximos passos

1. [ação recomendada 1]
2. [ação recomendada 2]
3. ...
```

- [ ] **Step 2: Commit do relatório (se no repo) ou apenas deixar em /tmp**

**Decisão**: se o relatório for útil como documentação histórica (recomendado), commitar:

```bash
git add docs/superpowers/plans/2026-06-19-post-merge-validation-report.md
git commit -m "docs(report): validação pós-merge da main (2026-06-19)

- status dos gates
- bloqueantes corrigidos
- findings backlog (issues)
- referência ao spec"
```

Caso contrário, deixar em `/tmp/post-merge-validation-report.md` e referenciar no summary final para o usuário.

---

## Definition of Done

- [ ] Task 1: `post-merge.yml` criado, sintaxe válida, commitado
- [ ] Task 2: Postgres + Redis rodando, healthy
- [ ] Task 3: Migrations aplicadas sem erro
- [ ] Task 4: `npm run validate` exit 0 (ou bloqueantes listados em Task 8)
- [ ] Task 5: 3 sub-agentes retornaram findings
- [ ] Task 6: `start:dev` boota + `/health` 200
- [ ] Task 7: `post-merge.yml` sanity check passou
- [ ] Task 8: Findings classificados
- [ ] Task 9: Todos bloqueantes corrigidos (ou zero bloqueantes)
- [ ] Task 10: `validate` final verde
- [ ] Task 11: Issues de backlog criadas
- [ ] Task 12: Relatório final escrito

**Pronto quando:** todos os checkboxes acima marcados + `main` is compilable, testable, e o workflow `post-merge.yml` está pronto para validar o próximo push em main.
