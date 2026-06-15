---
description: [executar testes E2E da aplicação]
last_updated: 2026-06-15
reviewer: claude-code
---

> **Autoridade geral**: [`/AGENTS.md`](../../AGENTS.md). Para contexto de testing, veja [AGENTS.md §11](../../AGENTS.md#11-testing).
>
> Para investigar falhas em testes E2E, use [`debug-test-failure.md`](./debug-test-failure.md).

Para executar os testes de ponta a ponta (E2E), siga estes passos:

1. Suba a infra de teste (Postgres + Redis) se ainda não estiver rodando:

```bash
docker compose up -d postgres redis
```

2. Aplique as migrações no banco de teste (lê `DATABASE_URL` do `.env.test` em uso):

```bash
export $(cat .env.test | grep -v '^#' | xargs)
npm run test:migrate
```

3. Execute os testes E2E:

```bash
npm run test:e2e
```

**Notas**:

- Os testes E2E usam a porta `5434` (mapeada do container `5432`) conforme `.env.test`.
- O `NODE_ENV=test` é setado automaticamente pelo script `test:e2e` (ver `package.json`).
- O Jest E2E roda com `maxWorkers: 1` ([`test/jest-e2e.json`](../../test/jest-e2e.json)) — não há paralelismo, então falhas intermitentes geralmente **não** são race conditions do runner.
- Helpers compartilhados estão em [`test/e2e-utils.ts`](../../test/e2e-utils.ts) — **reaproveite-os** em vez de rolar fixtures novas.
- Para rodar apenas um arquivo ou um caso: `npm run test:e2e -- --testPathPattern=<feature>` ou `npm run test:e2e -- -t "<texto do it>"`.
