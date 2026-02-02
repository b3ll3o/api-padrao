---
description: [ciclo completo de validação PRÉ-COMMIT: dependências, lint, testes, fix e commit]
---

Este workflow deve ser seguido obrigatoriamente ANTES de realizar o commit final das alterações.

1. **Verificação de Dependências**:
   // turbo
   - Execute `npm outdated` para verificar se há pacotes desatualizados.
   // turbo
   - Execute `npm audit` para garantir que não há vulnerabilidades conhecidas.
   - Atualize os pacotes se necessário e se for seguro (evite breaking changes automáticas).
   // turbo
   - Execute `npm update` para aplicar atualizações menores e de patch.

2. **Revisão e Impacto**:
   - Revise o código gerado em busca de bugs ou inconsistências.
   - Analise módulos dependentes (ex: se alterar o Prisma, verifique os Repositórios).

2. **Linting e Formatação**:
   // turbo
   - Execute `npm run lint` para identificar problemas.
   - Corrija todos os erros e avisos reportados.
   // turbo
   - Execute `npm run format` se necessário.

3. **Testes Unitários**:
   // turbo
   - Execute `npm run test` para garantir a integridade das unidades.
   - Corrija qualquer falha encontrada.

4. **Testes de Integração e E2E**:
   // turbo
   - Execute o workflow de testes E2E: `DATABASE_URL="..." npx prisma migrate deploy && npm run test:e2e`.
   - Corrija qualquer quebra nos fluxos de negócio.

5. **Atualização e Build**:
   // turbo
   - Execute `npm update` para garantir que as dependências de build estão no topo.
   // turbo
   - Execute `npm run build` para garantir que o projeto compila.

6. **Re-Validação Final**:
   - Repita os passos 2 e 3 se houveram correções durante os testes ou build.

7. **Commit e Push**:
   // turbo
   - Execute `git add .`.
   // turbo
   - Execute `git commit -m "feat/fix/refactor: descrição da alteração"`.
   // turbo
   - Execute `git push branch principal`.
