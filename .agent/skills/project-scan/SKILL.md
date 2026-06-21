---
name: project-scan
description: Use when performing a full project audit, executing "varredura completa", or running the 8-dimension analysis — applies the analista-backend methodology to inspect code, classify findings, and produce a structured report.
last_updated: 2026-06-15
reviewer: analista-backend
---

# Varredura Completa de Projeto — Metodologia

Como executar uma **varredura completa** (auditoria técnica) do projeto
`api-padrao`, aplicando as 8 dimensões definidas pelo agente
[analista-backend](../../agents/analista-backend.md). Use quando o usuário
pedir "varredura", "scan", "auditoria completa" ou "análise técnica do projeto".

## When to Use

Sintomas: usuário pediu "varredura completa do projeto", "auditoria
técnica", "análise de gaps", "como o projeto está?".

**Não** use para: revisão de PR específica (use revisão de código),
implementação de feature (use workflow DDD→BDD→SDD→ATDD→TDD), debug de
erro (use debug-test-failure).

## 1. As 8 dimensões (checklist)

```text
1. BUILD         — tsc OK? lint OK? pre-commit OK?
2. TESTES        — unit + e2e + cobertura + rastreabilidade
3. ARQUITETURA   — Hexagonal (portas/adapters) + DDD (agregados)
4. PERFORMANCE   — N+1, índices, cache, paginação, payload
5. SEGURANÇA     — OWASP, RBAC, throttler, audit, secrets
6. OBSERVABIL.   — logs estruturados, traces, métricas
7. CÓDIGO        — SOLID, Clean Code, complexidade, type safety
8. WORKFLOW      — DDD→BDD→SDD→ATDD→TDD rastreável?
```

## 2. Coleta de métricas (script inicial)

```bash
# Estrutura
find src -name "*.ts" | wc -l
find test -name "*.e2e-spec.ts" | wc -l
find src -name "*.spec.ts" | wc -l
find features -name "*.feature" | wc -l

# Cobertura
find src -name "*.ts" ! -name "*.spec.ts" | wc -l   # produção
find src -name "*.spec.ts" | wc -l                   # specs

# Linhas de código
find src -name "*.ts" -exec cat {} + | wc -l

# TODOs
grep -RE "TODO|FIXME|XXX" src/ | wc -l

# Any types
grep -RE ":\s*any\b|<any>" src/ | wc -l

# Console.log
grep -RE "console\.(log|debug|info|warn|error)" src/ | wc -l
```

## 3. Inspeção de build e qualidade

```bash
# Build
npm run build 2>&1 | tee /tmp/build.log

# Lint
npm run lint 2>&1 | tee /tmp/lint.log

# Testes unit
npm run test 2>&1 | tee /tmp/test-unit.log

# Testes e2e (requer docker up)
npm run test:e2e 2>&1 | tee /tmp/test-e2e.log

# Auditoria de deps
npm audit --audit-level=high
```

## 4. Análise por dimensão

### Dimensão 1 — BUILD

| Check | Comando | Esperado |
|-------|---------|----------|
| tsc compila | `npm run build` | exit 0 |
| Lint passa | `npm run lint` | exit 0 |
| Pre-commit | `npx lint-staged` | exit 0 |
| Migrations aplicadas | `npx prisma migrate status` | "Database schema is up to date" |

### Dimensão 2 — TESTES

| Check | Esperado |
|-------|----------|
| % de cobertura por módulo | > 80% (sugestão) |
| Cada spec cobre 1 caso | ✓ |
| 1 assertiva conceitual por teste | ✓ |
| Mock só de dependências (não do SUT) | ✓ |
| Comentário `// TDD:` em todos os specs | ✓ |
| Comentário `// ATDD:` em todos os e2e | ✓ |
| `npm run test:cov` mostra números | ✓ |

### Dimensão 3 — ARQUITETURA

```bash
# Hexagonal — domain não pode importar @nestjs/*, @prisma/*
for m in src/*/domain; do
  echo "== $m =="
  grep -RE "from '@nestjs|@prisma|class-validator|axios" $m 2>/dev/null
done

# Cada repositório é interface + impl
for m in src/*/domain/repositories/*.ts; do
  echo "== $m =="
  grep -l "implements" $m || echo "  (sem implementador?)"
done

# Services não devem injetar PrismaService
grep -RE "constructor.*prisma|PrismaService" src/*/application/ | grep -v "test\|spec"
```

### Dimensão 4 — PERFORMANCE

```bash
# findMany sem take
grep -RE "findMany\(\s*\{[^}]*\}\s*\)" src/ -A 1 | grep -v "take" | head -30

# SELECT * — findUnique/findMany sem select explícito
grep -RE "(findUnique|findFirst)\(\s*\{\s*where:" src/ -A 2 | grep -c "select" || echo "0"

# Loop com await (potencial N+1)
grep -RE "for\s*\(.*of\s" src/ -A 3 | grep -c "await"

# Cache sem TTL
grep -RE "cache\.set\(" src/

# OFFSET alto (cursor seria melhor)
grep -RE "skip:\s*[0-9]{3,}" src/
```

### Dimensão 5 — SEGURANÇA

```bash
# Endpoints sem @TemPermissao/@Public
grep -R "@Get\|@Post\|@Put\|@Patch\|@Delete" src/*/application/controllers/

# @Public() em rota que tem regra de auth implícita
grep -R "@Public" src/ -B 1

# Logs com PII (senha, token, cpf, cnpj)
grep -R "senha\|password\|cpf\|cnpj\|token" src/*/application/ -i | grep "log\|console"

# JWT_SECRET no .env (não .env.test, .env.example)
grep -r "JWT_SECRET" .

# eval/Function/dangerous patterns
grep -RE "eval\(|new Function\(" src/
```

### Dimensão 6 — OBSERVABILIDADE

```bash
# Logger usa this.logger (não console)
grep -RE "console\." src/ -l

# Logs estruturados ({ chave: valor })
grep -R "this\.logger\." src/ | grep -c "{.*}"

# Tracer.startActiveSpan
grep -R "startActiveSpan" src/

# Métricas
grep -R "@willsoto/nestjs-prometheus\|prom-client" src/ package.json
```

### Dimensão 7 — CÓDIGO

```bash
# Any
grep -RE ":\s*any\b|<any>" src/ | wc -l

# Métodos longos (> 30 linhas — heurística)
awk '/^[[:space:]]*(async |public |private )?[[:alnum:]_]+.*\(.*\) *\{?/ {start=NR; name=$0} /^[[:space:]]*\}/ {if (start && NR-start > 30) print FILENAME":"start"-"NR" ("(NR-start)" linhas): "name; start=0}' src/**/*.ts

# Magic numbers
grep -RE "[^a-zA-Z_][0-9]{2,}" src/ | grep -v "@\|test\|spec" | head

# Comentários TODO/FIXME
grep -R "TODO\|FIXME\|XXX" src/ | wc -l
```

### Dimensão 8 — WORKFLOW

```bash
# Rastreabilidade: arquivos sem comentário BDD/SDD/ATDD/TDD
for f in $(find src -name "*.ts" ! -name "*.spec.ts" ! -name "*.dto.ts"); do
  if ! grep -q "// BDD:\|// SDD:\|// ATDD:\|// TDD:" $f; then
    echo "FALTA: $f"
  fi
done

# Features BDD para cada módulo
ls features/

# design.md (SDD) para cada mudança
ls .openspec/changes/

# Cobertura BDD→ATDD
grep -l "Cenario:" test/*.e2e-spec.ts
```

## 5. Classificação de findings

| Severidade | Critério | Exemplo |
|-----------|----------|---------|
| **CRÍTICO** | Bloqueia build, vazamento de dados, RNF descumprido | `tsc` falhando, SQL injection, `any` em auth |
| **ALTO** | Gap de cobertura, gap de segurança, N+1 em hot path | DTO sem teste, bcrypt em event loop |
| **MÉDIO** | Débito técnico, code smell, RNF não documentado | Anemic entity, serviço com 8 métodos |
| **BAIXO** | Estilo, otimização marginal, melhoria de DX | Comentário redundante, magic number |
| **INFO** | Observação, alinhamento, sugestão | "Considerar migrar para argon2id" |

## 6. Estrutura do relatório

Salvar em `.agent/agents/relatorio-varredura-<YYYY-MM-DD>.md`:

```markdown
# Relatório de QA — Varredura Completa — <DATA>

> Gerado pelo agente **analista-backend** aplicando as 8 dimensões.

## TL;DR

- **Status**: APROVADO / APROVADO COM RESSALVAS / REPROVADO
- **Build**: ✅ / ⚠️ / ❌
- **Testes**: X% cobertura
- **Findings**: N críticos, N altos, ...

## TL;DR Visual

```text
BUILD:        ✅
TESTES UNIT:  220/222 passing
COBERTURA:    46%
HEXAGONAL:    ⚠️ AuthService injeta PrismaService
SEGURO:       ⚠️ Bcrypt no event loop
```

## 1. Métricas

(tabela de cobertura por módulo, totais, tendências)

## 2. Findings CRÍTICOS (bloqueiam)

[CRIT-001] ...
[CRIT-002] ...

## 3. Findings ALTOS (sprint atual)

[ALT-001] ...
[ALT-002] ...

## 4. Findings MÉDIOS (backlog priorizado)

[MED-001] ...
[MED-002] ...

## 5. Findings BAIXOS e INFO

[BAI-001] ...
[INF-001] ...

## 6. Por dimensão

### 6.1 Build
### 6.2 Testes
### 6.3 Arquitetura
### 6.4 Performance
### 6.5 Segurança
### 6.6 Observabilidade
### 6.7 Código
### 6.8 Workflow

## 7. Recomendações priorizadas

1. **Imediato**: [CRIT-001]
2. **Esta sprint**: [ALT-001], [ALT-002]
3. **Backlog**: [MED-*]
4. **Roadmap**: [INF-*]

## 8. Comparação com varredura anterior

| Métrica | Antes | Agora | Δ |
|---------|-------|-------|---|
| ... | ... | ... | ±X% |

## 9. Próximas ações

(roteiro para próxima varredura)
```

## 7. Comportamento esperado

- **Tempo de execução**: 10-20 min para projeto de 60 arquivos
- **Citação de fonte**: cada finding aponta o arquivo e linha
- **Recomendação concreta**: cada finding tem "como corrigir" (snippet
  ou referência a doc/skill)
- **Linguagem**: pt-BR; código/identificadores em inglês
- **Reproduzibilidade**: comandos exatos no relatório

## 8. Anti-padrões da varredura

| ❌ Anti | ✅ Correto |
|---------|-----------|
| Ler código aleatório sem métrica | Coleta primeiro, leitura depois |
| Listar tudo como "BAIXO" | Classificar por severidade real |
| "Refatorar tudo" | Recomendações priorizadas |
| Findings sem file:line | Cada um com referência |
| Recomendações sem exemplo | Snippet ou doc-link |
| Relatório de 100 páginas | TL;DR + tabelas + detalhes sob demanda |
| Tabela rasa "está ok" | Tabela com %/números/quando corrigir |

## 9. Output esperado

```text
✅ /home/leo/Documentos/projetos/padroes/api-padrao/.agent/agents/relatorio-varredura-<DATA>.md
   - TL;DR com status
   - Métricas tabuladas
   - Findings classificados (CRIT/ALT/MED/BAI/INF)
   - Cada finding: arquivo:linha, causa, impacto, recomendação
   - Recomendações priorizadas
   - Comparação com varredura anterior (se houver)
```

## 10. Reference

- `~/.claude/agents/analista-backend.md` — definição do agente
  (user-level; carregado pelo Claude Code em todas as sessões do usuário)
- [`.agent/skills/ddd-aggregate-modeling/SKILL.md`](../ddd-aggregate-modeling/SKILL.md)
- [`.agent/skills/hexagonal-ports-nestjs/SKILL.md`](../hexagonal-ports-nestjs/SKILL.md)
- [`.agent/skills/clean-code-solid-typescript/SKILL.md`](../clean-code-solid-typescript/SKILL.md)
- [`.agent/skills/performance-profiling-nestjs/SKILL.md`](../performance-profiling-nestjs/SKILL.md)
- [`.agent/skills/prisma-query-optimization/SKILL.md`](../prisma-query-optimization/SKILL.md)
- [`.agent/skills/redis-bullmq-caching/SKILL.md`](../redis-bullmq-caching/SKILL.md)
- [`.agent/skills/opentelemetry-tracing/SKILL.md`](../opentelemetry-tracing/SKILL.md)
- [`.agent/skills/security-auth-review/SKILL.md`](../security-auth-review/SKILL.md)
- [`.agent/docs/01-estrategia-testes.md`](../../docs/01-estrategia-testes.md) — testes
- [`.agent/agents/relatorio-varredura-2026-06-15.md`](../../agents/relatorio-varredura-2026-06-15.md) —
  exemplo de relatório anterior
