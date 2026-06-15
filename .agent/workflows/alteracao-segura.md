---
description: [ciclo completo de validação pré-commit: dependências, lint, testes, fix e commit]
last_updated: 2026-06-15
reviewer: claude-code
---

> **Autoridade geral**: [`/AGENTS.md`](../../AGENTS.md). Este workflow é o procedimento detalhado do passo-a-passo; leia AGENTS.md para contexto, comandos e convenções.
>
> **Ciclo rápido (durante desenvolvimento)**: [`verificacao-alteracao.md`](./verificacao-alteracao.md). Use este arquivo apenas quando for **fechar um commit / abrir PR**.

Este workflow deve ser seguido obrigatoriamente ANTES de realizar o commit final das alterações.

1. **Verificação de Dependências**:
   - Execute `npm run security:check` para garantir que não há vulnerabilidades conhecidas em severidade `high`+.
   - Execute `npm run deps:check` para verificar se há pacotes desatualizados.
   - Execute `npm run deps:update` para aplicar atualizações menores e de patch (se seguro; evite breaking changes automáticas).

2. **Revisão e Impacto**:
   - Revise o código gerado em busca de bugs ou inconsistências.
   - Analise módulos dependentes (ex: se alterar o Prisma, verifique os Repositórios; se alterar `PermissoesModule`, verifique `PerfisModule`).

3. **Linting e Formatação**:
   - Execute `npm run lint` para identificar problemas.
   - Corrija todos os erros e avisos reportados.
   - Execute `npm run format` se necessário.

4. **Testes Unitários**:
   - Execute `npm run test` para garantir a integridade das unidades.
   - Corrija qualquer falha encontrada.

5. **Testes de Integração e E2E**:
   - Suba a infra de teste (Postgres + Redis) se ainda não estiver rodando: `docker compose up -d postgres redis`.
   - Aplique migrações no banco de teste: `npm run test:migrate`.
   - Execute os testes E2E: `npm run test:e2e` (detalhes em [`test-e2e.md`](./test-e2e.md)).
   - Corrija qualquer quebra nos fluxos de negócio.

6. **Build**:
   - Execute `npm run build` para garantir que o projeto compila.

7. **Re-Validação Final**:
   - Repita os passos 3 a 6 se houveram correções durante os testes ou build.

8. **Commit e Push**:
   - Execute `git add .` (ou selecione arquivos específicos com `git add <path>`).
   - Execute `git commit -m "feat/fix/refactor: descrição da alteração"`.
   - Execute `git push -u origin $(git branch --show-current)` para enviar ao remoto.

> **Loop obrigatório**: se **qualquer** passo de 1 a 7 falhar, corrija a causa raiz e reinicie a partir do passo 1. O commit só é válido após uma rodada completa bem-sucedida, sem necessidade de novas alterações.
