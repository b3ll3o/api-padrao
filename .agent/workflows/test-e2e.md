---
description: [executar testes E2E da aplicação]
---

Para executar os testes de ponta a ponta (E2E), siga estes passos:

1. Suba o banco de dados de teste (se ainda não estiver rodando):
// turbo
run_command: docker compose up -d postgres

2. Execute as migrações no banco de teste:
// turbo
run_command: DATABASE_URL="postgresql://postgres:postgres@localhost:5433/api-padrao-test" npx prisma migrate deploy

3. Execute os testes E2E:
// turbo
run_command: npm run test:e2e
