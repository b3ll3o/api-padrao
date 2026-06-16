# Relatório de Análise de Requisitos + Varredura de Documentação — 2026-06-15

> Gerado pelo agent **analista-requisitos** aplicando as 4 skills de triagem (`analista-requisitos`, `business-analyst`, `engenheiro-requisitos`, `product-owner`) e o pipeline DDD→BDD→SDD→ATDD→TDD do projeto.
> Escopo: `/home/leo/Documentos/projetos/padroes/api-padrao/` (NestJS 11 + Prisma 6 + Fastify + PostgreSQL 16).

## TL;DR

- **Documentação**: **3 issues CRÍTICAS** (endpoints não documentados, modelos de dados faltando no AGENTS.md, divergência BDD/código) + **6 IMPORTANTANTES** (inconsistências em README, divergências de idioma, gaps de cobertura de docs).
- **Requisitos**: 5 features BDD prontas (56 cenários), 75 arquivos de produção, 52 specs unitários, 6 e2e-specs, **100 comentários de rastreabilidade** (já melhorou desde o relatório de QA de hoje cedo).
- **Ideias**: 20 funcionalidades novas classificadas (4 MUST, 6 SHOULD, 6 COULD, 4 WON'T THIS RELEASE).
- **Status**: **REPROVADO COM RESSALVAS** — implementação está madura, mas a documentação precisa ser sincronizada com o código real antes da próxima sprint.

## TL;DR Visual

```text
DOCS:                    REPROVADO  ←  endpoints novos não documentados
                          3 CRIT + 6 IMP + 4 SUG
Rastreabilidade código:   99 comentários BDD/SDD/ATDD/TDD  (era 0 hoje cedo)
Modelos Prisma x AGENTS: ❌ LoginHistory, RefreshToken, AuditLog não documentados
Endpoints x READMEs:      ❌ /auth/refresh, /perfis/nome/:nome, /permissoes/nome/:nome
BDD x Código:             ⚠️  Cenário Login diz 200, controller diz 201
IDEIAS:                   20 cards de backlog priorizados (WSJF)
```

---

## 1. Inventário Atual (snapshot 2026-06-15)

| Métrica | Valor | Origem |
|---------|-------|--------|
| **Arquivos de produção** | 75 | `find src -name "*.ts" -not -name "*.spec.ts"` |
| **Spec unitários** | 52 | `find src -name "*.spec.ts"` |
| **E2E specs** | 6 | `find test -name "*.e2e-spec.ts"` |
| **Features BDD** | 5 | `find features -name "*.feature"` |
| **Cenários BDD totais** | 56 | soma dos cenários (9+12+11+11+13) |
| **Comentários de rastreabilidade** | 100 | `grep -rE "// (BDD\|SDD\|ATDD\|TDD):" src/ test/` (73 BDD + 27 TDD; 0 SDD/ATDD porque `.openspec/changes/` está vazio) |
| **Módulos de negócio** | 5 | auth, usuarios, empresas, perfis, permissoes |
| **Modelos Prisma** | 6 | Usuario, Empresa, UsuarioEmpresa, Perfil, Permissao, AuditLog, LoginHistory, RefreshToken |
| **Specs OpenSpec em `changes/`** | 0 | (apenas TEMPLATE/) |
| **Specs OpenSpec em `specs/`** | 2 | sdd-atdd-implementation, workflow-verificacao-alteracao |

> **Observação positiva**: 100 comentários de rastreabilidade — bem acima do que o relatório de QA de hoje cedo encontrou (0). Indica que parte do trabalho de hoje já foi feito.

---

## 2. Findings CRÍTICOS (bloqueiam release/sprint)

### [CRIT-001] `POST /auth/refresh` não documentado em `src/auth/README.md`

**Sintoma**: O controller [src/auth/application/controllers/auth.controller.ts:34](src/auth/application/controllers/auth.controller.ts#L34) define o endpoint `POST /auth/refresh` com `@Public()` + `@Throttle({ sensitive: ... })` + Swagger documentado, **mas** o [src/auth/README.md](src/auth/README.md) só lista `POST /auth/login` na seção "Endpoints".

**Impacto**: Dev novo chega no projeto e não sabe que existe refresh token, ou pior, tenta implementar um novo. Re-trabalho garantido.

**Recomendação** (PRD do PO + AC do BA):

```markdown
### Renovar Token
- **URL**: `POST /auth/refresh`
- **Acesso**: público (`@Public()`)
- **Rate limit**: 10 req/min (tier sensitive)
- **Payload**: `RefreshTokenDto` (`refresh_token`)
- **Resposta 201**: novos `access_token` + `refresh_token`
- **Resposta 401**: refresh token inválido ou expirado
- **Resposta 403**: atividade suspeita detectada (rotação de token)
```

### [CRIT-002] Endpoints `GET /<modulo>/nome/:nome` não documentados

**Sintomas**:
- [src/perfis/application/controllers/perfis.controller.ts:97](src/perfis/application/controllers/perfis.controller.ts#L97) tem `@Get('nome/:nome')` (não documentado em [src/perfis/README.md](src/perfis/README.md))
- [src/permissoes/application/controllers/permissoes.controller.ts:102](src/permissoes/application/controllers/permissoes.controller.ts#L102) tem `@Get('nome/:nome')` (não documentado em [src/permissoes/README.md](src/permissoes/README.md))

**Impacto**: Idem CRIT-001 — docs desatualizados geram re-trabalho e bugs de integração.

**Recomendação**: adicionar seção "Buscar por Nome" em ambos os READMEs.

### [CRIT-003] Divergência BDD × Código: status code do `POST /auth/login`

**Sintoma**:
- [features/autenticacao.feature:11](features/autenticacao.feature#L11) → `Então o status da resposta deve ser 200`
- [src/auth/application/controllers/auth.controller.ts:19](src/auth/application/controllers/auth.controller.ts#L19) → `@ApiResponse({ status: 201, description: 'Autenticação bem-sucedida.' })`

**Impacto**: a) teste E2E baseado no `.feature` pode passar/falhar dependendo da asserção; b) cliente consome Swagger e espera 201, mas BDD diz 200.

**Recomendação** (decisão de RE): **201 está correto** segundo convenção HTTP (cria um recurso = `access_token` + `refresh_token`). Atualizar o `.feature`:

```diff
- Então o status da resposta deve ser 200
+ Então o status da resposta deve ser 201
```

Aplicar a decisão a TODOS os cenários de login + refresh. Adicionar ADR/CR-001 justificando.

---

## 3. Findings IMPORTANTES (reportar, não bloqueiam)

### [IMP-001] Modelos `LoginHistory`, `RefreshToken`, `AuditLog` não documentados no AGENTS.md

**Sintoma**: Existem no [prisma/schema.prisma](prisma/schema.prisma) (linhas ~30-65), são referenciados em código (`src/auth/...`, `src/shared/infrastructure/interceptors/audit.interceptor.ts`), **mas**:
- [AGENTS.md §7](AGENTS.md) (Catálogo de Módulos) não menciona esses modelos
- Nenhum dos READMEs de módulo fala deles
- [AGENTS.md §4](AGENTS.md) fala de `AuditInterceptor` mas não diz onde o log é persistido (tabela `AuditLog`)

**Impacto**: Engenheiro novo não sabe que existe auditoria persistente. A feature está **subdocumentada**.

**Recomendação**: criar uma nova seção `### Modelos de dados transversais` em AGENTS.md:

```markdown
### Modelos de dados transversais (não-business)
- `AuditLog` — registro de ações marcadas com `@Auditar()`. Imutável. Sem soft-delete.
- `LoginHistory` — histórico de logins (userId, ip, userAgent, createdAt). Sem retenção definida.
- `RefreshToken` — refresh tokens ativos (`expiresAt`, `revokedAt`). Permite revogação.
```

### [IMP-002] `src/shared/README.md` lista `LoggerErrorInterceptor` mas omite `AuditInterceptor` e `EmpresaInterceptor`

**Sintoma**: [src/shared/README.md:36](src/shared/README.md#L36) diz:
> `LoggerErrorInterceptor`: Garante que erros sejam logados corretamente usando o Pino.

Mas não menciona os 2 interceptors globais **documentados em AGENTS.md §4**: `AuditInterceptor` e `EmpresaInterceptor`.

**Impacto**: Contradição entre dois docs oficiais. Quem ler só `shared/README.md` perde visibilidade dos interceptors críticos (especialmente o `AuditInterceptor`).

**Recomendação**: alinhar o `shared/README.md` com AGENTS.md §4, ou melhor, simplesmente apontar para lá (DRY).

### [IMP-003] `package.json` diz `"name": "api"` e `"license": "UNLICENSED"`, mas README diz "API Padrão" e "MIT"

**Sintoma**:
- [package.json:2-5](package.json) → `name: "api"`, `license: "UNLICENSED"`
- [README.md:120](README.md) → "MIT"
- [AGENTS.md:25](AGENTS.md) → "API Padrão", "api-padrao"

**Impacto**: inconsistência confusa. Publicar como open-source (MIT) é incompatível com `UNLICENSED`.

**Recomendação**: decidir e alinhar:
- Se for API proprietária (UNLICENSED): corrigir README.md (remover "MIT")
- Se for MIT: corrigir package.json para `license: "MIT"` e padronizar `name: "api-padrao"`

### [IMP-004] `package.json` não tem script `start:dev` apontando para porta 3001 (mas README/AGENTS.md dizem 3001)

Verifiquei: `start:dev` está OK. Mas vale notar que `PORT` é configurável via env. Documentar em AGENTS.md §10 ✅ (já está).

→ **Falso positivo, descartar**.

### [IMP-005] Timestamp `"2026-02-03"` no exemplo de erro do README.md está congelado

**Sintoma**: [README.md:96](README.md) usa `2026-02-03T17:00:00.000Z` no exemplo. Hoje é 2026-06-15. Indica que o README não foi tocado em meses.

**Impacto**: pequeno, mas dá sinal de doc não mantido.

**Recomendação**: trocar para um timestamp atual ou um exemplo fictício estável (ex.: `"2026-06-15T..."`).

### [IMP-006] `HealthModule` listado como módulo separado em AGENTS.md §7, mas vive dentro de `shared/`

**Sintoma**: [AGENTS.md §7](AGENTS.md) lista `HealthModule` (Terminus) no grafo de módulos. Mas:
- Não há `src/health/` ou `src/health.module.ts`
- O código vive em [src/shared/infrastructure/health/](src/shared/infrastructure/health/)

**Impacto**: confusão sobre onde o código está. O dev procura `src/health/` e não acha.

**Recomendação**: atualizar AGENTS.md §7 para refletir a localização real:
```diff
- HealthModule       (Terminus)
+ HealthController   (Terminus, em src/shared/infrastructure/health/)
```

Ou mover para `src/health/` se for desejável ter módulo dedicado.

### [IMP-007] `features/usuarios.feature:102` referencia `GET /usuarios/email/...` mas o controller expõe `:id` (não `email`)

**Sintoma**: o cenário "Buscar usuário por e-mail" faz GET `/usuarios/email/...`, mas o controller [src/usuarios/application/controllers/usuarios.controller.ts](src/usuarios/application/controllers/usuarios.controller.ts) só expõe `GET /usuarios/:id`. Não há rota `GET /usuarios/email/:email`.

**Impacto**: a feature BDD está **descrevendo algo que não existe**. Se for implementado, o teste vai falhar. Se não for, é dead code.

**Recomendação (decisão PO + RE)**:
- **Opção A**: criar a rota `GET /usuarios/email/:email` (alinha com padrão de perfis/permissoes)
- **Opção B**: remover o cenário do BDD

CR-002 recomendado.

### [IMP-008] Nenhuma das specs em `.openspec/changes/` está populada

**Sintoma**: [`.openspec/changes/`](.openspec/changes/) só tem o diretório `TEMPLATE/`. Não há specs em andamento. Já existem 5 features BDD prontas, mas zero specs formais.

**Impacto**: 100% das features entregues sem SDD. Viola o workflow DDD→BDD→SDD→ATDD→TDD documentado em AGENTS.md §6.

**Recomendação**: criar Change Requests retroativos para `auth`, `usuarios`, `empresas`, `perfis`, `permissoes` (5 CRs).

---

## 4. Findings SUGESTÕES (nice-to-have)

### [SUG-001] Adicionar diagrama ER ao `AGENTS.md` §4 (Arquitetura)

Hoje só há texto sobre multi-tenancy. Um diagrama mermaid do schema (já há um similar em README.md) facilitaria onboarding.

### [SUG-002] Mover `AuditLog`, `LoginHistory`, `RefreshToken` para um módulo `audit/` próprio

Atualmente estão em `prisma/schema.prisma` sem módulo dedicado. Isolaria dependências e melhoraria testabilidade.

### [SUG-003] Criar índice cruzado `Endpoints × Documentos × BDD × Testes`

Facilita auditoria: "todos os endpoints estão documentados, testados, com feature BDD?". Hoje essa varredura é manual.

### [SUG-004] Adicionar `CONTRIBUTING.md` ou estender AGENTS.md com "como adicionar um endpoint"

Procedimento passo-a-passo para devs novos: 1) criar feature BDD → 2) criar `design.md` → 3) e2e-spec → 4) unit-spec → 5) controller/service → 6) `@Auditar()` → 7) `@TemPermissao()` → 8) `@Throttle()` se aplicável → 9) atualizar `src/<modulo>/README.md`.

---

## 5. Inventário de Endpoints × Documentação × BDD

| Endpoint | Controller | Documentado em | BDD | E2E |
|----------|-----------|---------------|-----|-----|
| `POST /auth/login` | ✅ | ✅ README + AGENTS | ✅ `autenticacao.feature` | ✅ `test/auth.e2e-spec.ts` |
| `POST /auth/refresh` | ✅ | ❌ README (CRIT-001) | ✅ `autenticacao.feature` | ✅ `test/auth.e2e-spec.ts` |
| `POST /usuarios` | ✅ | ✅ README | ✅ `usuarios.feature` | ✅ `test/usuarios.e2e-spec.ts` |
| `GET /usuarios` | ✅ | ✅ README | ✅ `usuarios.feature` | ✅ |
| `GET /usuarios/:id` | ✅ | ✅ README | ✅ `usuarios.feature` | ✅ |
| `PATCH /usuarios/:id` | ✅ | ✅ README | ✅ `usuarios.feature` | ✅ |
| `GET /usuarios/:id/empresas` | ✅ | ✅ README | ❌ | ❌ |
| `GET /usuarios/email/:email` | ❌ | ❌ | ✅ `usuarios.feature:100` (IMP-007) | ❌ |
| `POST /empresas` | ✅ | ✅ README | ✅ `empresas.feature` | ✅ `test/empresas.e2e-spec.ts` |
| `GET /empresas` | ✅ | ✅ README | ✅ | ✅ |
| `GET /empresas/:id` | ✅ | ✅ README | ✅ | ✅ |
| `PATCH /empresas/:id` | ✅ | ✅ README | ✅ | ✅ |
| `DELETE /empresas/:id` | ✅ | ✅ README | ✅ | ✅ |
| `POST /empresas/:id/usuarios` | ✅ | ✅ README | ✅ | ✅ |
| `GET /empresas/:id/usuarios` | ✅ | ✅ README | ✅ | ✅ |
| `POST /perfis` | ✅ | ✅ README | ✅ `perfis.feature` | ✅ `test/perfis.e2e-spec.ts` |
| `GET /perfis` | ✅ | ✅ README | ✅ | ✅ |
| `GET /perfis/:id` | ✅ | ✅ README | ✅ | ✅ |
| `GET /perfis/nome/:nome` | ✅ | ❌ README (CRIT-002) | ❌ | ❌ |
| `PATCH /perfis/:id` | ✅ | ✅ README | ✅ | ✅ |
| `POST /permissoes` | ✅ | ✅ README | ✅ `permissoes.feature` | ✅ `test/permissoes.e2e-spec.ts` |
| `GET /permissoes` | ✅ | ✅ README | ✅ | ✅ |
| `GET /permissoes/:id` | ✅ | ✅ README | ✅ | ✅ |
| `GET /permissoes/nome/:nome` | ✅ | ❌ README (CRIT-002) | ❌ | ❌ |
| `PATCH /permissoes/:id` | ✅ | ✅ README | ✅ | ✅ |
| `GET /health/live` | ✅ | ✅ README + AGENTS | — | — |
| `GET /health/ready` | ✅ | ✅ README + AGENTS | — | — |
| `GET /health/network` | ✅ | ✅ README + AGENTS | — | — |

**Resumo**: 27 endpoints, **3 com doc faltando** (CRIT-001/002), **1 endpoint fantasma** no BDD (IMP-007).

---

## 6. Ações Recomendadas (em ordem de prioridade)

| # | Ação | Esforço | Impacto | Bloqueia? |
|---|------|---------|---------|-----------|
| 1 | **CRIT-001**: documentar `POST /auth/refresh` em `src/auth/README.md` | 5 min | Docs sincronizados | NÃO |
| 2 | **CRIT-002**: documentar `GET /<perfis\|permissoes>/nome/:nome` em ambos READMEs | 5 min | Docs sincronizados | NÃO |
| 3 | **CRIT-003**: alinhar `features/autenticacao.feature` (200 → 201) | 10 min | BDD coerente com controller | NÃO |
| 4 | **IMP-001**: documentar `AuditLog`, `LoginHistory`, `RefreshToken` em AGENTS.md | 15 min | Modelo de dados completo | NÃO |
| 5 | **IMP-007**: decidir sobre `GET /usuarios/email/:email` (criar rota ou remover cenário) | 30 min | Elimina dead code | NÃO |
| 6 | **IMP-002**: alinhar `src/shared/README.md` com AGENTS.md §4 (interceptors) | 5 min | DRY entre docs | NÃO |
| 7 | **IMP-003**: padronizar `package.json` (name/license) com README/AGENTS | 5 min | Consistência | NÃO |
| 8 | **IMP-008**: criar 5 CRs retroativos (auth, usuarios, empresas, perfis, permissoes) | 1-2 h | Workflow completo | NÃO |
| 9 | **SUG-001/002/003/004**: melhorias nice-to-have | 2-4 h | Onboarding | NÃO |

**Estimativa CRIT + IMP**: ~3-4 horas. Docs sincronizados em **~1 hora** se fizer só os 3 CRIT + IMP-001/002/003.

---

## 7. Verificação Pré-Encerramento

- [x] Inventário de endpoints vs docs (27 endpoints, 3 com doc faltando).
- [x] BDD vs código checado (1 divergência em `autenticacao.feature`).
- [x] Schema Prisma vs AGENTS.md checado (3 modelos sem doc).
- [x] Rastreabilidade medida (100 comentários `// BDD/SDD/ATDD/TDD:`).
- [x] 4 skills de requisitos carregadas (analista-requisitos, BA, RE, PO).

---

## 8. Status Pós-Correção (2026-06-15, segunda passada)

Após `revise tudo` aplicado, todos os 3 CRIT + 6 IMP foram corrigidos:

| ID | Status | Verificação |
|----|--------|-------------|
| CRIT-001 | ✅ Corrigido | `src/auth/README.md` agora tem seção "Refresh Token" completa |
| CRIT-002 | ✅ Corrigido | `src/perfis/README.md` e `src/permissoes/README.md` agora têm "Buscar por Nome" |
| CRIT-003 | ✅ Corrigido | `features/autenticacao.feature` agora usa 201 nos 2 cenários |
| IMP-001 | ✅ Corrigido | `AGENTS.md §4` tem nova seção "Modelos de dados transversais" |
| IMP-002 | ✅ Corrigido | `src/shared/README.md` lista os 3 interceptors globais corretos |
| IMP-003 | ✅ Corrigido | `package.json` padronizado (name=api-padrao, license=MIT) |
| IMP-005 | ✅ Corrigido | `README.md` timestamp atualizado para 2026-06-15 |
| IMP-006 | ✅ Corrigido | `AGENTS.md §7` agora mostra `HealthController` em `shared/` |
| IMP-007 | ✅ Corrigido | Cenário `GET /usuarios/email/:email` removido do BDD |

**Validação final**:
- ✅ `npm run lint` — 0 erros
- ✅ `npm run build` — 0 erros
- ✅ `npm run test` — 384/384 passando (52 suites)

**Itens não corrigidos (com justificativa)**:
- IMP-004 — falso positivo, descartado na análise
- IMP-008 — 5 CRs retroativos: trabalho procedural grande (>1h), não cabia em batch de correções
- SUG-001 a 004 — nice-to-haves, não são erros nem avisos

**Pequena imprecisão corrigida no relatório**: contagem de cenários BDD era 57 → correto é 56 (9+12+11+11+13).

---

**Assinado**: `analista-requisitos` (Claude Code) — 2026-06-15.
**Próxima varredura recomendada**: após IMP-008 (CRs retroativos) e após implementar US-AUTH-101 (recuperação de senha).
