# Feature: Soft-Delete (soft-delete) — Change Request

> **Tipo**: Change Request retroativo. A feature `soft-delete` já está implementada como parte da **Prisma Client Extension** (`softDeleteExtension`) e do `BaseEntity` em `src/shared/domain/entities/base.entity.ts`. Este documento registra formalmente a decisão de design, requisitos e tasks cumpridas.

## Why

A API `api-padrao` precisa excluir registros de modelo sensível (`Usuario`, `Perfil`, `Permissao`, `Empresa`) **sem perder dados** — para auditoria, recuperação de erro e conformidade com **LGPD** (Art. 16 — eliminação não exige destruição física se houver base legal para retenção; Art. 37 — registro de operações). Um `DELETE` físico violaria essas necessidades e quebraria integridade referencial em cascata.

A feature `soft-delete` foi introduzida para estabelecer:

1. **Transparência para a aplicação** — todo controller que chamar `DELETE` em modelo sensível automaticamente registra um soft-delete; nenhum código de aplicação precisa saber.
2. **Conversão `delete` → `update` + `deletedAt` + `ativo=false`** na Prisma Client Extension.
3. **Filtro automático `deletedAt: null`** em todas as leituras — soft-deletados somem das queries normais.
4. **Preservação para auditoria** — `softDeleteExtension` mantém todos os campos intactos, apenas marca `deletedAt` e `ativo=false`.
5. **Bypass para modelos não-sensíveis** (`UsuarioEmpresa`, etc.) — DELETE físico é permitido para tabelas de junção.
6. **Respeito a `where.deletedAt` explícito** — caller pode forçar leitura de soft-deletados (ex.: tela de auditoria).

A solução via Prisma Extension foi escolhida em vez de `typeorm-soft-delete` ou implementação manual em repositório porque **toda** operação passa pela extension — não há como um controller esquecer.

## What Changes

### Adiciona

- **`softDeleteModels`** (`['Usuario', 'Perfil', 'Permissao', 'Empresa']`) — lista de modelos que recebem soft-delete.
- **`handleSoftDeleteAndMultiTenant`** (mesma query extension de `multi-tenancy`) — injeta `where.deletedAt = null` em `find*`, `count`, etc.
- **`makeSoftDeleteHandlers()`** — model extension que converte `delete` em `update` (com `deletedAt = now()`, `ativo = false`) e `deleteMany` em `updateMany`.
- **`BaseEntity`** (`src/shared/domain/entities/base.entity.ts`) — entidade abstrata com campos `deletedAt?: Date | null`, `ativo: boolean`, `createdAt`, `updatedAt`, `id`.
- **`ISoftDelete` interface** — contrato para entidades soft-deletáveis.
- **Documentação BDD** com 6 cenários em `features/soft-delete.feature` (4 Esquemas do Cenário + 2 Cenários).

### Não altera (escopo)

- Não implementa **job de purge automático** após N dias (REQ-SD-006 documentado como follow-up).
- Não implementa **endpoint `PATCH /restore`** explícito — restore é feito via `PATCH { ativo: true, deletedAt: null }` ou via `BaseEntity.restore()` (helper opcional, não obrigatório).
- Não altera o schema de modelos não-sensíveis (`UsuarioEmpresa`, `LoginHistory`, `RefreshToken`, etc.) — DELETE físico continua.

## Impact

| Área | Tipo de impacto | Descrição |
|------|-----------------|-----------|
| Banco de dados | Schema | Coluna `deletedAt DateTime?` + `ativo Boolean` (default `true`) em `Usuario`, `Perfil`, `Permissao`, `Empresa`. |
| Outros módulos | Dependência | Toda a aplicação passa a usar `prisma.extended` para esses modelos. |
| Segurança | LGPD | Soft-delete preserva histórico para auditoria; dados nunca saem do banco por `DELETE` direto. |
| Operacional | Performance | Toda query em modelo sensível adiciona `WHERE deletedAt IS NULL` (índice parcial pode ser adicionado em optimization futura). |
| API pública | Contrato | `DELETE /<modelo>/:id` retorna 204 mas registro continua no banco; leitura subsequente retorna 404 (filter). |
| Testes | Cobertura | 6 cenários BDD + 3 testes e2e em `test/soft-delete.e2e-spec.ts`. |

### Usuários impactados

- **Consumidores da API**: precisam estar cientes de que `DELETE` é lógico; restore é via `PATCH`.
- **Operações**: eventualmente rodar job de purge após 90 dias (LGPD — fora do escopo desta change).
- **Auditoria**: dados permanecem acessíveis via bypass explícito (`includeDeleted` ou `where.deletedAt: { not: null }`).

## Risks

Todos os riscos abaixo são **baixos** porque a feature já está implementada, testada (BDD + ATDD) e em produção. Esta documentação é retroativa.

| Risco | Probabilidade | Impacto | Mitigação existente |
|-------|---------------|---------|---------------------|
| Bypass da extension (chamar `prisma.<model>` direto) | Média | Médio | Convenção: `prisma.extended` é o único client usado em application code (NFR-SD-005). |
| Soft-deleted conta como "ativo" em algum cálculo (ex.: contagem de usuários) | Baixa | Médio | Todos os reads filtram `deletedAt: null` automaticamente — incluindo `count`. |
| Restore não-trivial (esquecer de zerar `deletedAt`) | Média | Baixo | Documentado em `design.md` (REQ-SD-004); restore = `PATCH { ativo: true, deletedAt: null }`. |
| Crescimento ilimitado do banco (sem purge) | Alta | Médio | Documentado como follow-up (REQ-SD-006 — job de cleanup após 90 dias). |
| Drift entre `softDeleteModels` e schema (modelo novo esquecido) | Média | Médio | Revisão de PR + comentário `// REQ-SD-001`. |
| `findUnique` em modelo soft-delete retornando `null` confunde caller | Baixa | Baixo | `findUniqueOrThrow` lança erro — comportamento padrão. |

## Status

- [x] Implementado
- [x] Testado (BDD + ATDD)
- [x] Documentado (este CR retroativo)