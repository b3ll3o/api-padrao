---
description: [executar testes E2E da aplicação]
---

Para executar os testes de ponta a ponta (E2E), siga estes passos:

1. Suba o banco de dados de teste (se ainda não estiver rodando):

```bash
docker compose up -d postgres
```

2. Execute as migrações no banco de teste:

```bash
export $(cat .env.test | grep -v '^#' | xargs)
npm run test:migrate
```

3. Execute os testes E2E:

```bash
npm run test:e2e
```

**Nota:** Os testes E2E usam a porta 5434 (mapeada do container 5432) conforme `.env.test`.
