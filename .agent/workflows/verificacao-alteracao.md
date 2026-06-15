---
description: [ciclo rápido de validação durante o desenvolvimento — usa validate:quick]
last_updated: 2026-06-15
reviewer: claude-code
---

> **Autoridade geral**: [`/AGENTS.md`](../../AGENTS.md).
>
> **Quando usar este workflow**: durante o desenvolvimento, em ciclos de iteração curtos (entre uma alteração e a próxima). Para o **ciclo pré-commit completo** (com E2E e commit), use [`alteracao-segura.md`](./alteracao-segura.md).
>
> **Diferença-chave**: este workflow **não** roda testes E2E (mais demorados) e **não** faz commit. Use-o para feedback rápido enquanto edita.

1. **Segurança e Dependências**:
   - Execute `npm run security:check` para verificar vulnerabilidades (bloqueia em high+).
   - Execute `npm run deps:check` para identificar dependências desatualizadas (somente leitura; não atualiza).

2. **Validação Rápida**:
   - Execute `npm run validate:quick` (lint + build + testes unitários) — este é o mesmo script rodado pelo pre-commit do Husky.
   - Se `validate:quick` falhar, vá direto para o passo 4 (ciclo de correção).
   - **Não** rode `npm run test:e2e` aqui — use o workflow [`test-e2e.md`](./test-e2e.md) apenas quando precisar validar fluxos integrados específicos.

3. **Verificação de Resíduos**:
   - Execute `npm run clean` para remover artefatos (`coverage_report*.txt`, `test_output*.log`).
   - Verifique que não há importações para módulos removidos (ex: Sentry) ou arquivos temporários versionados.

4. **Ciclo de Correção (Loop de Validação)**:
   - Em caso de **QUALQUER** falha nos passos 1, 2 ou 3:
     1. Analise o erro e identifique a causa raiz.
     2. Implemente a correção necessária.
     3. **OBRIGATÓRIO**: Reinicie o processo de validação a partir do passo 1.
     4. Repita até que `security:check`, `validate:quick` e `clean` passem sem erros.

5. **Conclusão**:
   - As alterações estão prontas para iteração adicional **ou** para iniciar o ciclo pré-commit completo ([`alteracao-segura.md`](./alteracao-segura.md)).

## Scripts Úteis

- `npm run security:check` — `npm audit --audit-level=high`
- `npm run deps:check` — `npm outdated`
- `npm run validate:quick` — `lint && build && test`
- `npm run clean` — remove `coverage_report*.txt` e `test_output*.log`
