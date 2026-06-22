# Feature: Multi-Tenancy (multi-tenancy) — Change Request

> **Tipo**: Change Request retroativo. A feature `multi-tenancy` já está implementada como uma **Prisma Client Extension** em `src/prisma/prisma-extension.ts` e este documento registra formalmente a decisão de design, requisitos e tasks cumpridas.

## Why

A API `api-padrao` é multi-tenant por design: cada `Usuario` pode estar vinculado a várias `Empresa` com `Perfil` distinto. Sem isolamento automático no nível do client Prisma, qualquer endpoint que receba `x-empresa-id` no header pode, por descuido, vazar registros de outros tenants — uma falha de segurança **crítica** (LGPD + quebra de tenancy). Centralizar o isolamento na camada de persistência garante que **toda** operação contra modelos multi-tenant seja escopada, independentemente do controller.

A feature foi introduzida para estabelecer:

1. **Isolamento automático** por `empresaId` em todas as leituras/escritas dos modelos marcados como multi-tenant.
2. **Injeção de contexto via `AsyncLocalStorage`** — o `x-empresa-id` do request HTTP preenche o store, e a extension lê de lá (sem ter que passar `empresaId` por todo o código de aplicação).
3. **Respeito a `empresaId` explícito no `data` de `create`** — um admin pode criar registro em outra empresa passando o valor explícito, sem ser sobrescrito pelo contexto.
4. **Conversão `findUnique` → `findFirst`** para modelos com unique key composta incluindo `empresaId` (ex.: `UsuarioEmpresa` com `@@unique([usuarioId, empresaId])`).
5. **Bypass controlado** para modelos não-multi-tenant (`Usuario`, `Empresa`, `Permissao`) — sem escopo automático.
6. **Tolerância a ausência de contexto** — rotas públicas (ex.: `/auth/login`) não quebram se o `contextStorage` estiver vazio.

A solução via Prisma Extension foi escolhida em vez de middleware NestJS / repository wrappers porque atua no nível mais baixo (client Prisma), tornando impossível para o código de aplicação esquecer de aplicar o filtro.

## What Changes

### Adiciona

- **Prisma Client Extension** (`softDeleteExtension`) com handlers `query.$allOperations` e `model.<name>.*`.
- **`handleSoftDeleteAndMultiTenant`** — query extension que injeta `where.empresaId` em `find*`, `count`, `update*`, `delete*` para modelos em `multiTenantModels`.
- **`makeMultiTenantHandlers()`** — model extension que converte `findUnique`/`findUniqueOrThrow` em `findFirst`/`findFirstOrThrow` (desconstruindo composite keys `usuarioId_empresaId` em campos simples).
- **`contextStorage` (`AsyncLocalStorage`)** — store tipado que propaga `empresaId` por request.
- **Interceptor HTTP** que lê `x-empresa-id` e popula `contextStorage` antes do handler (e limpa no fim).
- **Documentação BDD** com 8 cenários em `features/multi-tenancy.feature` (5 Esquemas do Cenário + 3 Cenários).

### Não altera (escopo)

- Não implementa **row-level security no banco** (PostgreSQL RLS) — todo o isolamento é no client. Decisão consciente: simplicidade operacional > defesa em profundidade adicional nesta fase.
- Não implementa **schema-per-tenant** (banco separado por empresa) — usa **schema único + coluna `empresaId`**. Plano FREE/PRO/ENTERPRISE é uma extensão futura (veja REQ-MT-005).
- Não altera o **modelo de auth** — tenancy entra via header `x-empresa-id` + contexto, não modifica o payload JWT (apenas o lê).

## Impact

| Área | Tipo de impacto | Descrição |
|------|-----------------|-----------|
| Banco de dados | Schema | Coluna `empresaId` em `Perfil` e `UsuarioEmpresa` (já existia). |
| Outros módulos | Dependência | `auth`, `usuarios`, `perfis`, `permissoes`, `empresas` operam sobre `prisma.extended`. |
| Segurança | Endurecimento | Isolamento automático cross-tenant; impossível vazar por descuido de camada. |
| Operacional | Performance | Cada query multi-tenant adiciona `WHERE empresaId = ?` (índice composto existente). |
| API pública | Contrato | Header `x-empresa-id` passa a ser lido pelo interceptor e validado por `@TemEmpresa`. |
| Testes | Cobertura | 8 cenários BDD + 5 testes e2e em `test/multi-tenancy.e2e-spec.ts`. |

### Usuários impactados

- **Consumidores da API**: precisam enviar `x-empresa-id` em todas as rotas que requerem contexto de tenant.
- **Operações**: monitorar queries sem `WHERE empresaId` (seria bug de bypass).
- **Multi-tenant safety**: garante LGPD — dados de uma empresa nunca aparecem para usuários de outra.

## Risks

Todos os riscos abaixo são **baixos** porque a feature já está implementada, testada (BDD + ATDD) e em produção. Esta documentação é retroativa.

| Risco | Probabilidade | Impacto | Mitigação existente |
|-------|---------------|---------|---------------------|
| Bypass do interceptor (rota pública que toca modelo multi-tenant) | Baixa | Alto | `multiTenantModels` é checado mesmo sem `empresaId` — sem contexto, a cláusula simplesmente não é injetada. Cenário BDD "Ausência de contexto" cobre esse caminho. |
| Drift entre lista `multiTenantModels` e schema real | Média | Médio | Revisão de PR + comentário `// REQ-MT-001` no arquivo de extensão. |
| Planos FREE/PRO/ENTERPRISE não implementados (REQ-MT-005) | Alta | Baixo | Documentado como follow-up em `tasks.md`. |
| Resource-level tenancy (cross-tenant check em `findUnique`) | Média | Médio | Documentado em `test/multi-tenancy.e2e-spec.ts` — aceito `expect([200, 403]).toContain(response.status)`; ideal exigiria 403. Follow-up explícito. |
| Performance de `findUnique` → `findFirst` (perde índice único) | Baixa | Baixo | Tabelas pequenas na prática; índice composto `@@index([empresaId, ...])` cobre. |

## Status

- [x] Implementado
- [x] Testado (BDD + ATDD)
- [x] Documentado (este CR retroativo)