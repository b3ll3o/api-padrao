---
description: [abrir e revisar um Pull Request seguindo as convenções do projeto]
last_updated: 2026-06-15
reviewer: claude-code
---

> **Autoridade geral**: [`/AGENTS.md`](../../AGENTS.md). Pré-requisito: ciclo pré-commit completo executado ([`alteracao-segura.md`](./alteracao-segura.md)).

Este workflow descreve como abrir e revisar um Pull Request (PR) neste repositório.

## 1. Antes de abrir

Certifique-se de que o ciclo pré-commit ([`alteracao-segura.md`](./alteracao-segura.md)) passou sem alterações, e que:

- A branch segue o padrão de nomenclatura (ver §5).
- O `AGENTS.md` e o README do módulo foram atualizados (se o contrato ou a arquitetura mudou).
- A spec em `.openspec/changes/<feature>/` (se aplicável) está revisada.

## 2. Push da branch

```bash
git push -u origin $(git branch --show-current)
```

## 3. Abertura do PR

Use a CLI do GitHub:

```bash
gh pr create \
  --base main \
  --head "$(git branch --show-current)" \
  --title "feat/fix/refactor: descrição curta e imperativa" \
  --body-file .github/PULL_REQUEST_TEMPLATE.md   # se existir
```

Se não houver template, o corpo do PR deve conter, no mínimo:

1. **Contexto**: qual problema está sendo resolvido.
2. **Mudanças**: bullets objetivos do que foi alterado.
3. **Issue/SDD link**: referência ao `proposal.md` / `design.md` em `.openspec/changes/` ou à issue do GitHub.
4. **Como testar**: comandos exatos (ex.: `npm run test:e2e -- --testPathPattern=<feature>`).
5. **Checklist de validação**:
   - [ ] `npm run security:check` passou
   - [ ] `npm run deps:check` revisado
   - [ ] `npm run lint` limpo
   - [ ] `npm run validate` (com E2E) passou
   - [ ] `AGENTS.md` e/ou README do módulo atualizados (se aplicável)
   - [ ] `.openspec/changes/<feature>/` revisado (se aplicável)

## 4. Checks de CI

Aguarde os checks automáticos:

- Lint + build + testes (CI padrão do projeto, ver `.github/workflows/`).
- Auditoria de segurança.

Se algum check falhar, **não faça merge**. Corrija na mesma branch e faça `git push` novamente — o PR atualiza automaticamente.

## 5. Convenção de nome de branch

Use `<tipo>/<escopo-curto>`, em **kebab-case** e **português ou inglês consistente**:

| Tipo         | Uso                                          | Exemplo                          |
| ------------ | -------------------------------------------- | -------------------------------- |
| `feat/`      | Nova feature                                  | `feat/login-refresh-token`       |
| `fix/`       | Correção de bug                               | `fix/corrige-throttler-tier`     |
| `refactor/`  | Refatoração sem mudança de comportamento     | `refactor/extrai-permissao-guard`|
| `chore/`     | Tarefas de manutenção (deps, build, CI)       | `chore/bump-fastify`             |
| `docs/`      | Apenas documentação                          | `docs/agentes-workflow`          |
| `test/`      | Apenas testes                                 | `test/e2e-empresas-vinculo`      |

## 6. Revisão e merge

- Solicite revisão de **pelo menos 1 mantenedor**.
- Responda a todos os comentários (ou marque como resolvido com justificativa).
- Após aprovação, use **squash merge** para manter o histórico linear:

```bash
gh pr merge --squash --delete-branch
```

> **Regra**: PRs não devem ser mergeados pelo próprio autor sem aprovação. Em emergências, documente no corpo do PR e obtenha aprovação verbal registrada em comentário.

## 7. Pós-merge

- A spec em `.openspec/changes/<feature>/` é movida para `.openspec/specs/<feature>/` (etapa 7 do [`sdd-workflow.md`](./sdd-workflow.md)).
- A branch remota é apagada (o `--delete-branch` acima já cuida disso).
- A issue correspondente (se houver) é fechada.
