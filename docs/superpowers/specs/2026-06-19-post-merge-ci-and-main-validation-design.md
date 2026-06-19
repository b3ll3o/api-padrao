# Design — CI Pós-Merge + Validação Completa da `main`

**Data**: 2026-06-19
**Escopo**: workflow `post-merge.yml` + validação local de `main` (build/test/boot) + análise multi-agente
**Tipo**: DevSecOps / SDLC (Sprint 2 — pós-Sprint 1 HTTP/SDLC Scanning)
**Critério de pronto**:
- `post-merge.yml` criado, com `on: push: branches: [main]`, jobs `integration` + `coverage` + `dependency-audit` paralelos
- `npm run validate` verde localmente (lint + build + test + test:e2e)
- `npm run start:dev` sobe e responde 200 em `/health`
- Findings CRITICAL/HIGH de segurança e bloqueantes de teste/build/boot corrigidos e commitados
- Findings não-bloqueantes viram issues com label `post-merge-backlog`

## Contexto

A `main` do `api-padrao` já recebeu o merge das duas branches do Sprint 1 (HTTP hardening + SDLC scanning: `feature/devsecops-sprint1-http` e `feature/devsecops-sprint1-sdlc`). O `ci.yml` atual roda em `pull_request` **e** `push:main` (linhas 12-15), mas tem apenas:

- `semgrep` (SAST)
- `gitleaks` (secret scan)
- `build` (lint + typecheck + unit + e2e)

Faltam garantias **exclusivas pós-merge** (não rodam em PR para economizar minutos), em particular: cobertura de código com threshold, audit de dependências contínuo, e smoke test de runtime via `start:dev` (que pode pegar issues que `test:e2e` não cobre, ex.: problemas de boot, OTel collector, graceful shutdown).

A working tree está suja: o fix de `originalUrl` no `CacheControlMiddleware` (necessário por Fastify) está modificado mas não commitado, e há `scripts/smoke-*.ts` + `.env.tmp` novos.

## Princípios e padrões seguidos

- **CI separation**: `ci.yml` (PR feedback rápido) ≠ `post-merge.yml` (validação completa após merge). Princípio do SDLC Scanning Sprint 1.
- **Bloqueante vs backlog**: correção imediata só para o que impede merge/deploy/segurança crítica. Demais findings viram issues.
- **Commits atômicos**: um commit por fix, mensagem `fix(post-merge): <descrição>`. Não misturar refactor com correção.
- **`start:dev` em background**: `start:dev` é um watch process. Rodar em background (`run_in_background: true`), aguardar health check 200, capturar logs.
- **Sub-agentes em paralelo**: `analista-qualidade`, `analista-backend`, `analista-dev-sec-ops` disparam ao mesmo tempo sobre o mesmo `HEAD` da `main`. Cada um retorna findings estruturados.

## Arquivos afetados

### Criar
- `.github/workflows/post-merge.yml` — novo workflow de validação pós-merge
- `docs/superpowers/specs/2026-06-19-post-merge-ci-and-main-validation-design.md` — este spec

### Modificar (working tree)
- `src/shared/infrastructure/middleware/cache-control.middleware.ts` — fix de `originalUrl` para Fastify (commit)

### Criar issues (backlog)
- Findings não-bloqueantes de qualidade/segurança/arquitetura identificados pelos sub-agentes

## Design do `post-merge.yml`

```yaml
name: post-merge

on:
  push:
    branches: [main]

concurrency:
  group: post-merge-${{ github.ref }}
  cancel-in-progress: true

jobs:
  integration:
    runs-on: ubuntu-latest
    services:
      postgres: { image: postgres:16-alpine, ... }  # mesmo do ci.yml
      redis:    { image: redis:7-alpine, ... }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4 (node 20, cache npm)
      - run: npm ci --no-audit --no-fund
      - run: npm run validate   # lint + build + test + test:e2e
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/api-padrao-test

  coverage:
    runs-on: ubuntu-latest
    services: { postgres, redis (mesmo do integration) }
    steps:
      - checkout, setup-node, npm ci
      - run: npm run test:cov
      - run: npm run test:migrate (e2e setup)
      - name: Enforce coverage threshold
        # falha se qualquer métrica < 80% (statements/branches/functions/lines)
        # usa `cat coverage/coverage-summary.json | jq` para extrair e comparar
      - name: Upload coverage artifact
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/

  dependency-audit:
    runs-on: ubuntu-latest
    steps:
      - checkout, setup-node, npm ci
      - run: npm audit --audit-level=high
        continue-on-error: false  # bloqueia se high+
      - run: npm outdated --long
        continue-on-error: true   # warning, não falha
```

**Decisões**:
- `coverage` roda **separado** do `integration` para paralelizar (economiza ~5 min) e porque tem threshold diferente (integration só verifica passa/não-passa).
- `dependency-audit` é warning-only para `outdated` mas fail em `high+` para `audit` — equilibra ruído e segurança.
- Sem `concurrency.cancel-in-progress` no nível do job, apenas workflow-level: o push pós-merge é evento raro, não vale cancelamento agressivo.
- Threshold de cobertura 80% é o mínimo já implícito no projeto (ver `auth` que está em 100%, mas módulos menores podem estar abaixo). Pode ser ajustado após ver o número real.

## Validação local — sequência

1. **Commit do fix do middleware**:
   ```bash
   git add src/shared/infrastructure/middleware/cache-control.middleware.ts
   git commit -m "fix(middleware): usar originalUrl para Fastify no CacheControlMiddleware"
   ```

2. **Subir ambiente**:
   ```bash
   docker compose -f docker-compose.dev.yml up -d postgres redis
   ```

3. **Rodar migrations do banco de dev** (`api_db` na porta 5434 do `docker-compose.dev.yml`, não o banco de teste `api-padrao-test`):
   ```bash
   DATABASE_URL=postgresql://postgres:postgres@localhost:5434/api_db?schema=public \
     npx prisma migrate deploy
   ```

4. **Validar em paralelo**:
   - `npm run validate` (terminal foreground — captura erros de lint/build/test/e2e)
   - Sub-agentes `analista-qualidade` + `analista-backend` + `analista-dev-sec-ops` em paralelo via `Agent` tool

5. **Subir `start:dev` em background**:
   ```bash
   npm run start:dev > /tmp/start-dev.log 2>&1 &
   # poll http://localhost:3000/health até 200 (max 60s)
   ```

6. **Capturar erros**:
   - Logs do `start:dev` (`/tmp/start-dev.log`)
   - Saída do `validate`
   - Findings estruturados dos sub-agentes

7. **Fix de bloqueantes**: um commit por fix, todos com prefixo `fix(post-merge):`.

8. **Relatório final**: tabela com o que foi commitado, o que virou issue de backlog, e o status de cada gate.

## Critérios de classificação de findings

| Severidade | Tratamento |
|---|---|
| **Bloqueante** (test falha, build quebra, `/health` não 200, CVE HIGH+, secret leak) | Corrige + commit atômico |
| **Médio** (coverage < 80% em módulo core, code smell arquitetural, anti-pattern Hexagonal) | Issue com label `post-merge-backlog` + `priority:medium`, sprint backlog |
| **Baixo** (lint warning, `outdated`, code style) | Issue com label `post-merge-backlog` + `priority:low`, backlog |

## Riscos aceitos

- **`start:dev` em background** pode ter comportamento diferente de `start:prod` (watch, dev plugins). Aceitável: é validação de boot, não de performance.
- **Sub-agentes podem retornar findings contraditórios** (qualidade vs arquitetura). Critério: bloqueante = qualquer um classificar como CRITICAL/HIGH.
- **Migrations podem falhar se schema drift** → nesse caso, `prisma migrate reset` (descarta dados) só com aprovação explícita do usuário.
- **Threshold de coverage 80%** é chute inicial baseado em "auth está em 100%, módulos menores podem estar abaixo". Pode precisar ajuste após ver números reais.

## Saída esperada

1. Workflow `post-merge.yml` versionado em `.github/workflows/`
2. Fix do middleware commitado
3. `npm run validate` verde
4. `start:dev` boot OK com `/health` 200
5. Findings classificados: X corrigidos, Y viraram issues
6. Resumo executivo com próximos passos

## Não-objetivos

- Não vou criar/atualizar documentação de API (Swagger, README) — fora de escopo.
- Não vou rodar load tests / stress tests — não há ambiente configurado.
- Não vou deployar nada — isso é só validação local + CI gate.
- Não vou deletar branches remotas (`feature/devsecops-sprint1-*`) — decidi manter como histórico.
