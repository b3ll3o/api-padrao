---
description: [criar e revisar uma migration Prisma com segurança em dev, test e prod]
last_updated: 2026-06-15
reviewer: claude-code
---

> **Autoridade geral**: [`/AGENTS.md`](../../AGENTS.md). Fonte da verdade do modelo de dados: [`prisma/schema.prisma`](../../prisma/schema.prisma).

Este workflow descreve o ciclo completo de uma migration Prisma: criação, revisão, aplicação em dev/test e deploy em prod.

## 1. Modelar a mudança no schema

Edite [`prisma/schema.prisma`](../../prisma/schema.prisma).

**Boas práticas**:

- Não altere migrations já aplicadas em `prisma/migrations/` — crie uma nova.
- Para **soft delete** (regra do projeto, ver [AGENTS.md §4 "Soft delete"](../../AGENTS.md#4-arquitetura)): use `deletedAt DateTime?` e `ativo Boolean @default(true)`. A extensão em [`src/prisma/prisma-extension.ts`](../../src/prisma/prisma-extension.ts) já auto-filtra `deletedAt: null`.
- Para entidades persistentes, estenda `BaseEntity` (campos: `id`, `createdAt`, `updatedAt`, `deletedAt`, `ativo`).
- Documente a mudança no `design.md` da spec (etapa 2 do [`sdd-workflow.md`](./sdd-workflow.md)) **antes** de gerar a migration.

## 2. Gerar a migration (dev local)

```bash
npx prisma migrate dev --name <nome-descritivo>
```

- `<nome-descritivo>` em **kebab-case**, ex.: `add-empresa-cnpj-unique`, `add-login-refresh-audit-tables`.
- O Prisma aplica a migration e regenera o client.
- Arquivo criado em `prisma/migrations/<timestamp>_<nome>/migration.sql` — **revisá-lo manualmente** (próximo passo).

## 3. Revisar a SQL gerada

Abra o arquivo `migration.sql` e verifique:

- [ ] Apenas as alterações intencionais estão presentes (sem drops acidentais).
- [ ] Constraints (`UNIQUE`, `FK`, `CHECK`) e índices (`CREATE INDEX`) estão corretos.
- [ ] Colunas `NOT NULL` têm `DEFAULT` ou são inicializadas no script (não vamos quebrar linhas existentes).
- [ ] Se há `ALTER TABLE ... DROP COLUMN`: confirme com 2º par de olhos — drop é destrutivo.
- [ ] Se há `CREATE INDEX CONCURRENTLY` (Postgres): necessário em produção, mas o Prisma gera `CREATE INDEX` simples — reescreva manualmente para prod (ver §6).

> **Atenção**: o `prisma migrate dev` **reseta o banco** em alguns casos. **Nunca** rode em banco com dados de produção. Use `prisma migrate dev --create-only` se quiser apenas gerar o SQL sem aplicar.

## 4. Validar a migration no banco de teste

```bash
docker compose up -d postgres redis
export $(cat .env.test | grep -v '^#' | xargs)
npm run test:migrate   # npx prisma migrate deploy
npm run test:e2e       # garante que nada quebrou
```

## 5. Atualizar módulos dependentes

Mudanças de schema geralmente exigem atualizações em:

- **Repositories** em `src/<modulo>/infrastructure/repositories/` (assinaturas e include/select).
- **Entidades** em `src/<modulo>/domain/entities/` (campos novos).
- **DTOs** em `src/<modulo>/dto/` (campos expostos via API).
- **Testes** em `src/**/*.spec.ts` e `test/*.e2e-spec.ts`.
- **Documentação**: `AGENTS.md` e o `README.md` do módulo se houver mudança de contrato.

Rode o ciclo rápido ([`verificacao-alteracao.md`](./verificacao-alteracao.md)) a cada módulo atualizado.

## 6. Deploy em produção (CI/CD)

- A pipeline roda `npx prisma migrate deploy` no startup do container (ver [`Dockerfile`](../../Dockerfile) e [`docker-compose.yml`](../../docker-compose.yml)).
- A migration é **imutável** após aplicada em prod: correções exigem uma nova migration subsequente.
- Se a migration for **breaking** (mover/renomear colunas, alterar tipos), faça **em duas etapas**:
  1. Migration 1: adiciona a nova coluna (nullable ou com default) — deploy.
  2. Migration 2: backfill + drop da coluna antiga — deploy.
- Para tabelas grandes, reescreva índices como `CREATE INDEX CONCURRENTLY` no SQL antes de commitar (Prisma não emite essa forma automaticamente). Documente no corpo do `migration.sql` com `-- PRISMA: reescrito manualmente para CONCURRENTLY`.

## 7. Antes do commit

Siga o ciclo pré-commit completo: [`alteracao-segura.md`](./alteracao-segura.md).

Pontos extras para migrations:

- [ ] `migration.sql` revisado por 2 pessoas (mudança de schema = mudança destrutiva potencial).
- [ ] `.env.test` aplicado e E2E verde.
- [ ] `prisma/migrations/<timestamp>_<nome>/migration.sql` está versionado (Prisma exige).
- [ ] `prisma/migrations/migration_lock.toml` está versionado e inalterado.
- [ ] Spec em `.openspec/changes/<feature>/` referencia a migration.

## 8. Rollback (emergência)

`prisma migrate deploy` **não** tem rollback automático. Em caso de falha em prod:

1. Pare o tráfego no endpoint afetado (ou faça rollback do deploy inteiro).
2. Crie uma nova migration com a operação inversa (ex.: `add-coluna-x-back`).
3. Aplique via `npx prisma migrate deploy`.
4. Documente o incidente e atualize a spec em `.openspec/specs/`.
