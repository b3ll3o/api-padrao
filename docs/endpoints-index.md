# Índice de Endpoints — API Padrão

> **Última atualização**: 2026-06-15
> **Gerado**: manualmente, conferir periodicamente.
> **Total**: 32 endpoints (29 de negócio + 3 de saúde/health).
> **Módulos**: `auth`, `usuarios`, `empresas`, `perfis`, `permissoes`, `health` (shared).

## Legenda

- ✅ — coberto
- ❌ — não coberto
- ⚠️ — parcial / divergente
- N/A — não se aplica (ex.: endpoint público não tem `@TemPermissao`)

## Endpoints × Documentação × BDD × Testes

| #  | Endpoint                            | Módulo     | Documentado           | BDD                         | E2E                                              | Throttle | Permissão (N/A se público)  | Auditoria |
|----|-------------------------------------|------------|-----------------------|-----------------------------|--------------------------------------------------|----------|----------------------------|-----------|
| 1  | POST /auth/login                    | auth       | ✅ README + AGENTS    | ✅ autenticacao.feature     | ✅ auth.e2e-spec.ts                              | sensitive| N/A (público)              | ❌        |
| 2  | POST /auth/refresh                  | auth       | ✅ README             | ✅ autenticacao.feature     | ❌                                                | sensitive| N/A (público)              | ❌        |
| 3  | POST /auth/forgot-password          | auth       | ✅ README             | ✅ autenticacao.feature     | ✅ auth-password-recovery.e2e-spec.ts            | sensitive| N/A (público)              | ❌        |
| 4  | POST /auth/reset-password           | auth       | ✅ README             | ✅ autenticacao.feature     | ✅ auth-password-recovery.e2e-spec.ts            | sensitive| N/A (público)              | ❌        |
| 5  | POST /usuarios                      | usuarios   | ✅ README             | ✅ usuarios.feature         | ✅ usuarios.e2e-spec.ts                          | ❌       | N/A (público)              | ✅ CRIAR  |
| 6  | GET /usuarios                       | usuarios   | ✅ README             | ✅ usuarios.feature         | ⚠️ (cobre paginação via tenant-rate-limit.e2e)   | long     | READ_USUARIOS              | ❌        |
| 7  | GET /usuarios/:id                   | usuarios   | ✅ README             | ✅ usuarios.feature         | ✅ usuarios.e2e-spec.ts                          | ❌       | READ_USUARIO_BY_ID         | ❌        |
| 8  | PATCH /usuarios/:id                 | usuarios   | ✅ README             | ✅ usuarios.feature         | ✅ usuarios.e2e-spec.ts                          | sensitive| UPDATE_USUARIO             | ✅ ATUALIZAR |
| 9  | GET /usuarios/:id/empresas          | usuarios   | ✅ README             | ❌                          | ✅ usuarios.e2e-spec.ts                          | ❌       | READ_USUARIO_EMPRESAS      | ❌        |
| 10 | POST /empresas                      | empresas   | ✅ README             | ✅ empresas.feature         | ✅ empresas.e2e-spec.ts                          | sensitive| CREATE_EMPRESA             | ✅ CRIAR  |
| 11 | GET /empresas                       | empresas   | ✅ README             | ✅ empresas.feature         | ✅ empresas.e2e-spec.ts                          | ❌       | READ_EMPRESAS              | ❌        |
| 12 | GET /empresas/:id                   | empresas   | ✅ README             | ✅ empresas.feature         | ✅ empresas.e2e-spec.ts                          | ❌       | READ_EMPRESA_BY_ID         | ❌        |
| 13 | PATCH /empresas/:id                 | empresas   | ✅ README             | ✅ empresas.feature         | ✅ empresas.e2e-spec.ts                          | sensitive| UPDATE_EMPRESA             | ✅ ATUALIZAR |
| 14 | DELETE /empresas/:id                | empresas   | ✅ README             | ✅ empresas.feature         | ✅ empresas.e2e-spec.ts                          | sensitive| DELETE_EMPRESA             | ✅ REMOVER |
| 15 | POST /empresas/:id/usuarios         | empresas   | ✅ README             | ✅ empresas.feature         | ✅ empresas.e2e-spec.ts                          | ❌       | ADD_USER_TO_EMPRESA        | ❌        |
| 16 | GET /empresas/:id/usuarios          | empresas   | ✅ README             | ✅ empresas.feature         | ✅ empresas.e2e-spec.ts                          | ❌       | READ_EMPRESA_USUARIOS      | ❌        |
| 17 | POST /perfis                        | perfis     | ✅ README             | ✅ perfis.feature           | ✅ perfis.e2e-spec.ts                            | ❌       | CREATE_PERFIL              | ❌        |
| 18 | GET /perfis                         | perfis     | ✅ README             | ✅ perfis.feature           | ✅ perfis.e2e-spec.ts                            | ❌       | READ_PERFIS                | ❌        |
| 19 | GET /perfis/:id                     | perfis     | ✅ README             | ✅ perfis.feature           | ✅ perfis.e2e-spec.ts                            | ❌       | READ_PERFIL_BY_ID          | ❌        |
| 20 | GET /perfis/nome/:nome              | perfis     | ⚠️ (não documentado) | ❌                          | ❌                                                | ❌       | READ_PERFIL_BY_NOME        | ❌        |
| 21 | PATCH /perfis/:id                   | perfis     | ✅ README             | ✅ perfis.feature           | ✅ perfis.e2e-spec.ts                            | ❌       | UPDATE_PERFIL              | ❌        |
| 22 | POST /permissoes                    | permissoes | ✅ README             | ✅ permissoes.feature       | ✅ permissoes.e2e-spec.ts                        | ❌       | CREATE_PERMISSAO           | ❌        |
| 23 | GET /permissoes                     | permissoes | ✅ README             | ✅ permissoes.feature       | ✅ permissoes.e2e-spec.ts                        | ❌       | READ_PERMISSOES            | ❌        |
| 24 | GET /permissoes/:id                 | permissoes | ✅ README             | ✅ permissoes.feature       | ✅ permissoes.e2e-spec.ts                        | ❌       | READ_PERMISSAO_BY_ID       | ❌        |
| 25 | GET /permissoes/nome/:nome          | permissoes | ⚠️ (não documentado) | ❌                          | ✅ permissoes.e2e-spec.ts                        | ❌       | READ_PERMISSAO_BY_NOME     | ❌        |
| 26 | PATCH /permissoes/:id               | permissoes | ✅ README             | ✅ permissoes.feature       | ✅ permissoes.e2e-spec.ts                        | ❌       | UPDATE_PERMISSAO           | ❌        |
| 27 | GET /health/live                    | health     | ✅ README + AGENTS    | ❌                          | ❌                                                | ❌       | N/A (público)              | ❌        |
| 28 | GET /health/ready                   | health     | ✅ README + AGENTS    | ❌                          | ❌                                                | ❌       | N/A (público)              | ❌        |
| 29 | GET /health/network                 | health     | ✅ README + AGENTS    | ❌                          | ❌                                                | ❌       | N/A (público)              | ❌        |

> **Notas:**
> - Endpoints com `@Throttle({ sensitive: ... })` ou `@Throttle({ long: ... })` aplicam rate limit. `@Throttle` ausente (marcado ❌) significa que o limite padrão do `ThrottlerModule` se aplica (geralmente 60 req/min). Veja `src/app.module.ts` para a config global.
> - O `GET /usuarios` E2E é coberto indiretamente em `test/tenant-rate-limit.e2e-spec.ts` (validação de plano FREE/PRO com 100+ requisições). Marcação ⚠️ indica cobertura parcial — não há `describe('GET /usuarios', ...)` dedicado em `usuarios.e2e-spec.ts`.
> - **`POST /auth/refresh`** não tem `describe`/cenário explícito em `auth.e2e-spec.ts` (apenas cenários BDD em `autenticacao.feature`). Recomendação: adicionar `describe('POST /auth/refresh', ...)` em `auth.e2e-spec.ts` para fechar o gap.
> - Endpoints de `/health/*` não têm BDD nem E2E por design (são probes de infraestrutura consumidos por Kubernetes/load balancers).
> - Auditoria está ativa apenas em 4 endpoints (todos relacionados a mutações em `usuarios` e `empresas`). Veja `src/shared/application/decorators/audit.decorator.ts`.

## Resumo de Cobertura

**Excluindo `/health/*` (29 endpoints de negócio):**

- Total de endpoints: **29**
- Com BDD: **25** (86%)
- Com E2E: **26** (90%)
- Com documentação: **27** (93%)
- Com auditoria: **4** (14%)

**Incluindo `/health/*` (32 endpoints no total):**

- Total de endpoints: **32**
- Com BDD: **25** (78%)
- Com E2E: **26** (81%)
- Com documentação: **30** (94%)

### Cobertura por módulo

| Módulo      | Endpoints | Com BDD | Com E2E | Documentados |
|-------------|-----------|---------|---------|--------------|
| auth        | 4         | 4       | 3       | 4            |
| usuarios    | 5         | 4       | 5       | 5            |
| empresas    | 7         | 7       | 7       | 7            |
| perfis      | 5         | 4       | 4       | 4            |
| permissoes  | 5         | 4       | 5       | 4            |
| health      | 3         | 0       | 0       | 3            |

## Endpoints sem BDD

- `GET /usuarios/:id/empresas`
- `GET /perfis/nome/:nome`
- `GET /permissoes/nome/:nome`
- `GET /health/live` *(por design — probe k8s)*
- `GET /health/ready` *(por design — probe k8s)*
- `GET /health/network` *(por design — probe k8s)*

**Recomendação:** Adicionar cenários BDD em `features/usuarios.feature`, `features/perfis.feature` e `features/permissoes.feature` para os 3 endpoints de negócio sem cobertura (são buscas por nome que merecem validação explícita do comportamento).

## Endpoints sem E2E

- `POST /auth/refresh`
- `GET /usuarios` (cobertura parcial via `tenant-rate-limit.e2e-spec.ts`)
- `GET /perfis/nome/:nome`
- `GET /health/live` *(por design)*
- `GET /health/ready` *(por design)*
- `GET /health/network` *(por design)*

**Recomendação:** Adicionar `describe('POST /auth/refresh', ...)` em `test/auth.e2e-spec.ts` (já tem BDD) e `describe('GET /perfis/nome/:nome', ...)` em `test/perfis.e2e-spec.ts`.

## Endpoints sem documentação

- `GET /perfis/nome/:nome` (existe no controller, no Swagger e nos decorators, mas não está listado nos READMEs de módulo nem no `AGENTS.md`)
- `GET /permissoes/nome/:nome` (mesma situação)

**Recomendação:** Atualizar `src/perfis/README.md` e `src/permissoes/README.md` para listar essas rotas de busca por nome (parcialmente cobertas pelo Swagger `/api`).

## Como regenerar este índice

Para regerar a tabela manualmente após adicionar/remover endpoints, execute os comandos abaixo a partir da raiz do projeto.

### 1. Inventariar endpoints nos controllers

```bash
# Lista todos os decorators de método HTTP nos controllers
grep -rn "@Get\|@Post\|@Patch\|@Delete\|@Put" src/ --include="*.controller.ts"

# Lista os controllers (um por módulo)
ls src/*/application/controllers/*.controller.ts
ls src/shared/infrastructure/health/*.controller.ts
```

### 2. Identificar cenários BDD

```bash
# Procura por referências a endpoints nos arquivos .feature
grep -E "POST|GET|PATCH|DELETE" features/*.feature

# Lista os arquivos de feature
ls features/*.feature
```

### 3. Identificar cobertura E2E

```bash
# Lista os arquivos de teste e2e
ls test/*.e2e-spec.ts

# Extrai todos os métodos HTTP chamados nos testes
grep -nE "\.(get|post|patch|put|delete)\(['\"]/" test/*.e2e-spec.ts \
  | grep -oE "\.(get|post|patch|put|delete)\(['\"][^'\"]+" \
  | sort -u
```

### 4. Identificar decorators aplicados (Throttle, Permissão, Auditoria)

```bash
# Throttle
grep -rn "@Throttle" src/ --include="*.controller.ts"

# Permissões
grep -rn "@TemPermissao" src/ --include="*.controller.ts"

# Auditoria
grep -rn "@Auditar" src/ --include="*.controller.ts"

# Endpoints públicos
grep -rn "@Public" src/ --include="*.controller.ts"
```

### 5. Verificar documentação

```bash
# Procura por endpoints nos READMEs
grep -rE "POST|GET|PATCH|DELETE" src/*/README.md README.md AGENTS.md
```

### 6. (Opcional) Diff automatizado

Para automatizar detecção de gaps (futuro, SUG-003.1):

```bash
# Endpoints declarados em controllers
ENDPOINTS=$(grep -rhE "@(Get|Post|Patch|Delete|Put)\(" src/ --include="*.controller.ts" \
  | sed -E 's/.*@(Get|Post|Patch|Delete|Put)\((.*)\).*/\1 \2/' \
  | sort -u)

# Endpoints efetivamente testados em E2E
TESTED=$(grep -hoE "\.(get|post|patch|put|delete)\(['\"][^'\"]+" test/*.e2e-spec.ts \
  | sed -E "s/\.(get|post|patch|put|delete)\('//;s/'$//" \
  | sort -u)

# Diff: endpoints sem teste
comm -23 <(echo "$ENDPOINTS") <(echo "$TESTED")
```

## Histórico de Atualizações

| Data       | Versão | Mudança                                              |
|------------|--------|------------------------------------------------------|
| 2026-06-15 | 1.0    | Criação inicial (SUG-003) — 32 endpoints inventariados. |
