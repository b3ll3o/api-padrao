# Backlog — Auditoria Pós-Merge `main` @ c38ba3e (2026-06-19)

> **Issues propostas** (não criadas no GitHub — PAT tem só read access; criar manualmente via `gh issue create` ou pela web UI).

**Origem**: 3 sub-agentes — `analista-qualidade`, `analista-backend`, `analista-dev-sec-ops`
**Spec**: [docs/superpowers/specs/2026-06-19-post-merge-ci-and-main-validation-design.md](../superpowers/specs/2026-06-19-post-merge-ci-and-main-validation-design.md)
**Reports completos**: `/tmp/agent-qualidade.md`, `/tmp/agent-backend.md`, `/tmp/agent-devsecops.md`

**Total**: 5 CRITICAL + 12 HIGH + 33+ MEDIUM + 35+ LOW + 22 INFO

**Labels sugeridos** (criar no repo se não existirem):
- `post-merge-backlog` (comum a todas)
- `priority:critical` / `priority:medium` / `priority:low`
- Tags de categoria: `api-design`, `observability`, `security`, `performance`, `architecture`, `quality`, `devops`, `coverage`

---

## CRITICAL (5) — abrir como issues priority:critical

### Issue #1: Migrar `AllExceptionsFilter` para RFC 7807

```bash
gh issue create \
  --title "[CRIT] Migrar AllExceptionsFilter para RFC 7807 (application/problem+json)" \
  --body "## Contexto
Auditoria multi-agente da main (c38ba3e) identificou que AllExceptionsFilter retorna {statusCode, message, path, timestamp} em vez de seguir RFC 7807 (application/problem+json).

## Impacto
- Quebra contrato com consumidores B2B que esperam type, title, detail, instance, errors[]
- Dificulta integração com SDKs e API management
- Inconsistência com success responses

## Detalhes
- Arquivo: src/shared/infrastructure/filters/all-exceptions.filter.ts:75-80
- Origem: analista-backend
- Severidade: CRITICAL

## Recomendação
Migrar para application/problem+json com type/title/status/detail/instance/errors[].
Adicionar RFC 7807 ao Swagger. Atualizar testes e2e.

## Referências
- spec: docs/superpowers/specs/2026-06-19-post-merge-ci-and-main-validation-design.md
- report: /tmp/agent-backend.md (Dimensão 4 - API Design)
- RFC 7807: https://datatracker.ietf.org/doc/html/rfc7807" \
  --label "post-merge-backlog,priority:critical,api-design"
```

### Issue #2: Adicionar métricas Prometheus/RED-USE

```bash
gh issue create \
  --title "[CRIT] Adicionar métricas Prometheus/RED-USE (RPS, p95, erro por rota)" \
  --body "## Contexto
api-padrao tem tracing OpenTelemetry e logs Pino, mas zero métricas expostas. Sem RPS, p95, contadores de erro por rota. Health check usa Terminus, mas sem observabilidade quantitativa.

## Detalhes
- Arquivos: app.module.ts (sem registro de prom-client), controllers sem interceptor de métricas
- Origem: analista-backend (Dimensão 5 - Observability)
- Severidade: CRITICAL

## Recomendação
1. Adicionar @willsoto/nestjs-prometheus ou prom-client diretamente
2. Criar MetricsInterceptor que emite http_request_duration_seconds, http_requests_total
3. Expor /metrics endpoint (proteger em prod)
4. Adicionar histogram por rota + status code
5. Adicionar métricas de domínio: login_attempts_total, jwt_tokens_issued, bullmq_jobs_processed
6. Configurar alert no Prometheus/Grafana para p95 > 500ms e error rate > 1%

## Referências
- spec: docs/superpowers/specs/2026-06-19-post-merge-ci-and-main-validation-design.md
- report: /tmp/agent-backend.md" \
  --label "post-merge-backlog,priority:critical,observability"
```

### Issue #3: Atualizar Dockerfile para Node LTS + tini

```bash
gh issue create \
  --title "[CRIT] Dockerfile: atualizar Node 20.18 EOL para Node 22 LTS e adicionar tini para SIGTERM" \
  --body "## Contexto
Auditoria DevSecOps identificou dois problemas no Dockerfile:
1. node:20.18-alpine é EOL desde 2025-04-30 (LTS migrou para 22, e 20 só tem maintenance)
2. Sem tini/--init - Node como PID 1 não trata SIGTERM graciosamente (docker stop timeout 10s)

OWASP A06 Vulnerable Components.

## Detalhes
- Arquivo: Dockerfile:2 (FROM) e Dockerfile:54 (CMD)
- Origem: analista-dev-sec-ops
- Severidade: CRITICAL (CWE-1104)

## Recomendação
1. Mudar FROM node:20.18-alpine para node:22-alpine
2. Adicionar 'RUN apk add --no-cache tini' e 'ENTRYPOINT [\"/sbin/tini\", \"--\"]'
3. Validar em CI que docker build + docker run + docker stop funcionam sem perda de jobs
4. Adicionar renovate.json para auto-update de Node base image (ver issue #5)

## Referências
- spec: docs/superpowers/specs/2026-06-19-post-merge-ci-and-main-validation-design.md
- report: /tmp/agent-devsecops.md (CONT-001, CONT-002)
- Node EOL: https://nodejs.org/en/about/previous-releases" \
  --label "post-merge-backlog,priority:critical,security,devops"
```

### Issue #4: Adicionar cobertura de testes em arquivos de boot/DI

```bash
gh issue create \
  --title "[CRIT] Adicionar testes para 9 arquivos de boot/DI (main.ts, app.module.ts, tracing.ts, *.module.ts, env.validation.ts)" \
  --body "## Contexto
Auditoria de qualidade identificou que 9 arquivos críticos de boot/DI estão com 0% de cobertura:
- main.ts (1-183)
- app.module.ts (1-172)
- tracing.ts
- auth.module.ts, usuarios.module.ts, empresas.module.ts, perfis.module.ts, permissoes.module.ts
- env.validation.ts

O gate global de 80% passa porque pondera pelos arquivos cobertos, mas mudanças em Helmet/CSP/Joi env passam silenciosamente.

## Detalhes
- Origem: analista-qualidade (CRIT-001)
- Severidade: CRITICAL
- Impacto: regressões em segurança passam sem detecção

## Recomendação
1. Criar test/app-bootstrap.spec.ts que carrega AppModule e valida:
   - Helmet registrado com CSP estrita
   - CORS configurado
   - ValidationPipe global presente
   - ThrottlerModule global presente
   - GlobalPrefix aplicado
2. Criar test/env-validation.spec.ts com casos válidos/inválidos
3. Criar test/tracing.spec.ts que valida registro de providers OTel
4. Cada *.module.ts: spec mínimo verificando providers/exports
5. Meta: boot files saírem de 0% para > 80%

## Referências
- spec: docs/superpowers/specs/2026-06-19-post-merge-ci-and-main-validation-design.md
- report: /tmp/agent-qualidade.md" \
  --label "post-merge-backlog,priority:critical,coverage,quality"
```

### Issue #5: Implementar consumers BullMQ (email, auditoria, refresh-flush)

```bash
gh issue create \
  --title "[CRIT] Implementar @Processor BullMQ para email, auditoria e refresh-flush" \
  --body "## Contexto
BullModule.forRootAsync está registrado em app.module.ts:68-77 mas ZERO @Processor/@ProcessorWorker foram instanciados. Email transacional, auditoria e reset-flush rodam INLINE na request - sem retry, sem DLQ, sem backpressure.

## Detalhes
- Arquivo: src/app.module.ts:68-77 (registro) + ausência de consumers
- Origem: analista-backend
- Severidade: CRITICAL (resiliência + observability)

## Recomendação
1. Criar src/shared/infrastructure/queues/email.processor.ts
   - Subscribe a fila 'email'
   - Processa DefaultEmailSenderService.send()
   - Retry 3x com backoff exponencial
   - DLQ para falhas permanentes
2. Criar src/shared/infrastructure/queues/audit.processor.ts
   - Subscribe a fila 'audit'
   - Processa AuditInterceptor.events
3. Criar src/auth/infrastructure/queues/refresh-flush.processor.ts
   - Subscribe a fila 'refresh-flush'
   - Remove tokens expirados periodicamente
4. Adicionar @nestjs/bullmq board (ou @bull-board) para inspeção
5. Adicionar testes e2e de queue (já testam flow inline)
6. Adicionar métricas BullMQ (ver issue #2)

## Referências
- spec: docs/superpowers/specs/2026-06-19-post-merge-ci-and-main-validation-design.md
- report: /tmp/agent-backend.md (Dimensão 7 - Distributed Systems)" \
  --label "post-merge-backlog,priority:critical,architecture,distributed-systems"
```

---

## HIGH (12) — top 7 mais acionáveis, abrir como priority:medium

### Issue #6: Eliminar N+1 em perfis.service.ts (validar permissoesIds em batch)

```bash
gh issue create \
  --title "[HIGH] perfis.service.ts: validar permissoesIds em uma única query (findManyByIds)" \
  --body "## Contexto
src/perfis/application/services/perfis.service.ts:36-40 e :131-135 usam Promise.all(findOne()) para validar permissoesIds - N round-trips paralelos. Para 50 permissões, são 50 queries.

## Detalhes
- Arquivo: src/perfis/application/services/perfis.service.ts:36-40, 131-135
- Origem: analista-backend (HIGH)
- Severidade: HIGH (performance)

## Recomendação
1. Adicionar PermissaoRepository.findManyByIds(ids: number[]): Promise<Permissao[]>
2. Trocar Promise.all(findOne) por findManyByIds + validação de count
3. Adicionar cache de 5min em Permissao[] (são cross-tenant, ~dezenas)
4. Adicionar teste de carga no e2e" \
  --label "post-merge-backlog,priority:medium,performance"
```

### Issue #7: TenantThrottler deve aplicar tier por plano

```bash
gh issue create \
  --title "[HIGH] TenantThrottler: aplicar limites por tier FREE/PRO/ENTERPRISE" \
  --body "## Contexto
TenantThrottlerGuard.preFetchPlano (l.95-106) é fire-and-forget; o tier permanece global. Sem override de handleRequest aplicando PLANO_LIMITS[plano][tier]. Header X-RateLimit-* mostra limites globais para todos.

## Detalhes
- Arquivo: src/shared/infrastructure/guards/tenant-throttler.guard.ts
- Origem: analista-backend
- Severidade: HIGH (B2B feature não funciona)

## Recomendação
1. Aguardar preFetchPlano em handleRequest (não fire-and-forget)
2. Criar PLANO_LIMITS = { FREE: { short, medium, long }, PRO: {...}, ENTERPRISE: {...} }
3. Sobrescrever handleRequest para resolver limits pelo tier
4. Adicionar teste e2e validando X-RateLimit-* por tier" \
  --label "post-merge-backlog,priority:medium,business-logic"
```

### Issue #8: Configurar Renovate/Dependabot para SCA contínua

```bash
gh issue create \
  --title "[HIGH] Configurar Renovate (ou Dependabot) para SCA contínua" \
  --body "## Contexto
Hoje, npm audit --audit-level=high roda em CI mas atualização de deps é manual. Sem auto-merge, sem PRs automáticas de patch/minor.

## Detalhes
- Origem: analista-dev-sec-ops
- Severidade: HIGH (A06 Vulnerable Components)
- npm audit atual: 0 vulnerabilidades (1070 deps), mas janela de exposição alta

## Recomendação
1. Adicionar renovate.json (recomendado) com:
   - schedule: ['before 6am on monday']
   - automerge: true para patch em prod deps
   - group: all-non-major (atualiza múltiplas de uma vez)
   - labels: ['dependencies']
2. Adicionar badge de status no README
3. Configurar notifications no Slack
4. Alternativa: .github/dependabot.yml com group updates + auto-merge" \
  --label "post-merge-backlog,priority:medium,security,devops"
```

### Issue #9: OTel exporter com TLS (HTTPS) em produção

```bash
gh issue create \
  --title "[HIGH] OTel exporter: usar HTTPS em produção (tracing com PII em cleartext)" \
  --body "## Contexto
docker-compose.yml (dev) usa OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318. Em prod, configuração similar pode vazar traces (que contêm PII como user IDs, emails) em cleartext.

## Detalhes
- Origem: analista-dev-sec-ops
- Severidade: HIGH (A02 Cryptographic Failures, A09 Logging Failures)
- CWE-319

## Recomendação
1. Variável OTEL_EXPORTER_OTLP_ENDPOINT deve ser https:// em prod
2. Adicionar validação no envValidationSchema (Joi): prod exige https://
3. Documentar em AGENTS.md a obrigatoriedade
4. Adicionar teste e2e validando config" \
  --label "post-merge-backlog,priority:medium,security,observability"
```

### Issue #10: Sanitizar PII no AuditInterceptor (cpf/cnpj/telefone/email)

```bash
gh issue create \
  --title "[HIGH] AuditInterceptor.sanitizeBody: incluir cpf/cnpj/telefone/email" \
  --body "## Contexto
AuditInterceptor.sanitizeBody só filtra senha/password/token/secret. Faltam campos PII brasileiros: cpf, cnpj, telefone, email, endereco, cep, rg.

## Detalhes
- Arquivo: src/shared/infrastructure/interceptors/audit.interceptor.ts
- Origem: analista-dev-sec-ops
- Severidade: HIGH (LGPD, A09 Logging Failures)
- CWE-359

## Recomendação
1. Adicionar campos ao regex de sanitização
2. Considerar redação parcial (ex: email 'u***@e***' em vez de '[REDACTED]')
3. Adicionar teste unitário validando que cada campo é sanitizado
4. Adicionar documentação em AGENTS.md sobre PII policy" \
  --label "post-merge-backlog,priority:medium,security,lgpd"
```

### Issue #11: Adicionar rastreabilidade BDD/SDD/ATDD/TDD em arquivos restantes

```bash
gh issue create \
  --title "[HIGH] Aumentar rastreabilidade BDD/SDD/ATDD/TDD de 24% para 100% (AGENTS.md §6)" \
  --body "## Contexto
AGENTS.md §6 exige cabeçalho // BDD: ... | // SDD: ... | // ATDD: ... | // TDD: ... em arquivos de produção. Atualmente 24% (23/98) atendem.

## Detalhes
- Origem: analista-qualidade (HIGH-001)
- Severidade: HIGH (rastreabilidade + discovery de features)

## Recomendação
1. Auditar todos os 75 arquivos faltantes
2. Adicionar cabeçalho padronizado
3. Adicionar lint rule ou pre-commit hook que valida presença
4. Adicionar CI check no workflow" \
  --label "post-merge-backlog,priority:medium,quality,documentation"
```

### Issue #12: 3 features Gherkin sem e2e dedicado

```bash
gh issue create \
  --title "[HIGH] Criar e2e specs para autenticacao.feature, password-recovery.feature, devsecops-sprint1.feature" \
  --body "## Contexto
3 features em features/*.feature não têm test/*-e2e-spec.ts correspondente:
- features/autenticacao.feature
- features/password-recovery.feature
- features/devsecops-sprint1-quick-wins.feature

## Detalhes
- Origem: analista-qualidade (HIGH-002)
- Severidade: HIGH (cobertura BDD incompleta)

## Recomendação
1. Verificar quais cenários do .feature não estão cobertos
2. Criar test/auth-full.e2e-spec.ts (consolida com auth.e2e-spec.ts existente)
3. Criar test/password-recovery-full.e2e-spec.ts (consolida com auth-password-recovery.e2e-spec.ts)
4. Criar test/http-hardening-full.e2e-spec.ts (já existe parcial, expandir)
5. Garantir 1:1 entre scenarios .feature e describe blocks" \
  --label "post-merge-backlog,priority:medium,quality,bdd"
```

---

## Findings não-promovidos a issue (resumo)

Por questão de foco, estes foram capturados nos reports mas não viraram issues:

### MEDIUM (33+) — capturar em sprint planning
- Sem versionamento de API (`/v1/...`)
- Sem `Idempotency-Key` em POSTs sensíveis
- Sem RLS no Postgres (defence in depth ausente)
- Sem `app.enableShutdownHooks()` — SIGTERM pode deixar jobs BullMQ em voo (resolverá junto com Issue #5)
- `PaginationDto` sem `@Max()` em `limit` — DoS potencial
- Acoplamento `password-recovery.service.ts` ao `Prisma.TransactionClient`
- `perfis.service.ts` valida IDs mas não tenant
- Domain entity com decorators de framework (`@Exclude`, `@ApiProperty`)
- Health check `checkNetwork` pinga Google (ruim em prod)
- x-empresa-id aceito do header sem validação contra JWT (potencial IDOR)
- `app.config.ts` (0% branches) — config crítica sem teste
- `prisma.service.ts` (0% branches) — circuit breaker sem teste
- `empresas.service.ts` (75% branches)
- 7 asserções vacuous `toBeDefined()` em 5 specs
- Senha default `postgres` em `.env` local

### LOW (35+) — ignorar por agora
Lint warnings, code style, comments outdated.

### INFO (22+)
Observações, não requerem ação.

---

## Como criar as issues

```bash
# Setup (uma vez)
gh auth login
gh label create post-merge-backlog --color "FBCA04" --description "Achados da auditoria pós-merge 2026-06-19" -R b3ll3o/api-padrao
gh label create priority:critical --color "B60205" -R b3ll3o/api-padrao
gh label create priority:medium --color "D93F0B" -R b3ll3o/api-padrao
gh label create priority:low --color "0E8A16" -R b3ll3o/api-padrao

# Criar (executar cada bloco de gh issue create acima)
# ou copiar/colar na web UI: https://github.com/b3ll3o/api-padrao/issues/new
```

## Comandos úteis

```bash
# Listar findings por agente
cat /tmp/agent-backend.md
cat /tmp/agent-devsecops.md
cat /tmp/agent-qualidade.md

# Consolidado
cat /tmp/findings-consolidated.md
```
