---
description: [fluxo rápido de validação de alterações e saúde do projeto]
---

Este workflow serve para validar rapidamente as alterações realizadas e garantir que o projeto continua estável.

1. **Segurança e Dependências** (NOVO):
   // turbo

- Execute `npm run security:check` para verificar vulnerabilidades (bloqueia em high+).
  // turbo
- Execute `npm run deps:check` para identificar dependências desatualizadas.
  // turbo
- Execute `npm run deps:update` para atualizar dependências (se necessário).

2. **Validação Geral**:
   // turbo

- Execute `npm run validate` para rodar Lint, Build, Testes Unitários e E2E de uma só vez.
- Caso o comando acima falhe, prossiga para os passos 3 e 4 para isolar o problema.

3. **Lint e Formatação**:
   // turbo

- Execute `npm run lint` para verificar regras de estilo e erros estáticos.
  // turbo
- Execute `npm run format` para garantir a padronização do código.

4. **Build e Testes**:
   // turbo

- Execute `npm run build` para validar a transpilação do TypeScript e configurações do NestJS.
  // turbo
- Execute `npm run test` para rodar os testes unitários.
  // turbo
- Execute `npm run test:e2e` para validar os fluxos integrados (Requer banco de dados de teste ativo).

5. **Verificação de Resíduos**:

- Verifique se não restaram arquivos temporários ou logs (`npm run clean`).
- Verifique se não há importações para módulos removidos (ex: Sentry).

6. **Ciclo de Correção (Loop de Validação)**:

- Em caso de **QUALQUER** falha nos passos 1, 2, 3 ou 4:

1. Analise o erro e identifique a causa raiz.
2. Implemente a correção necessária.
3. **OBRIGATÓRIO**: Reinicie o processo de validação a partir do passo 1.
4. Repita este ciclo até que todos os comandos (Security, Lint, Build e Testes) passem sem erros.

5. **Conclusão**:

- As alterações só são consideradas prontas para commit após uma rodada completa de verificação bem-sucedida, sem necessidade de alterações adicionais.

## Scripts Disponíveis

- `npm run security:check` - Audit de segurança (npm audit --audit-level=high)
- `npm run deps:check` - Lista dependências desatualizadas (npm outdated)
- `npm run deps:update` - Atualiza dependências (npm update)
