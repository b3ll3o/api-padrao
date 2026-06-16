# Endpoints Index — Proposal

## Why

Esta mudança implementa a sugestão **SUG-003** identificada no relatório de varredura do projeto `api-padrao`.

Hoje, a API expõe **29 endpoints HTTP** espalhados por 5 módulos (`auth`, `usuarios`, `empresas`, `perfis`, `permissoes`) + 3 endpoints de `health`, mas não existe um único documento que cruze:

- Endpoint HTTP (path + verbo) com seus decorators (`@Public`, `@Throttle`, `@TemPermissao`, `@Auditar`).
- Cenários BDD correspondentes em `features/*.feature`.
- Cobertura de testes E2E em `test/*.e2e-spec.ts`.
- Documentação (README/AGENTS.md/Swagger).

Sem este índice cruzado, fica difícil responder perguntas triviais como:

- "Quais endpoints não têm cenário BDD?"
- "Quais rotas protegidas não estão testadas em E2E?"
- "Quantos endpoints têm auditoria habilitada?"
- "Existe algum endpoint documentado em Swagger mas sem teste E2E (ou vice-versa)?"

Este artefato é um **catalisador de qualidade**: ao ter uma visão única, a equipe consegue identificar gaps rapidamente e priorizar refactors.

## What Changes

- **Adiciona** `docs/endpoints-index.md` — índice cruzado de Endpoints × Documentação × BDD × Testes, com tabela principal, resumo de cobertura, listas de gaps (sem BDD, sem E2E, sem documentação) e seção "Como regenerar este índice" com os comandos shell.

- **Não modifica** nenhum código de aplicação, teste, schema ou configuração. Trata-se de um artefato puramente documental.

- O documento é **gerado manualmente** a partir de inspeção do código. Comandos shell para regenerar estão documentados no próprio arquivo, em uma seção dedicada.

## Impact

- **Risco**: zero. Apenas criação de arquivo markdown + este `proposal.md`. Nenhum código é alterado, nenhum teste precisa ser atualizado, nenhum migration é necessária.
- **Benefício**: melhoria imediata de observabilidade do contrato HTTP da API. Suporta auditorias internas, onboarding de novos devs e planejamento de sprints.
- **Compatibilidade**: 100% retrocompatível.

## Risks

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Índice desatualizado após adicionar novo endpoint | Média | Documentar processo de regeneração; revisar mensalmente; opcionalmente, automatizar via script CI que detecta `@Get/@Post/@Patch/@Delete/@Put` em `src/` e gera a tabela. |
| Falsa sensação de cobertura (endpoint com teste E2E mas sem BDD) | Baixa | Distinguir explicitamente BDD vs E2E no índice; seção dedicada de "Endpoints sem BDD". |
| Divergência entre este índice e Swagger | Baixa | Citar Swagger (`/api`) como fonte de verdade para o contrato HTTP; este índice referencia o controller como fonte primária. |
| Fork de estrutura de pastas (novo módulo) quebrar comando de regeneração | Baixa | Comandos shell usam globs `src/*/application/controllers/*.controller.ts` que cobrem novos módulos automaticamente. |

## Out of Scope

- Geração automática via script shell (fica como follow-up SUG-003.1).
- Integração com OpenAPI/Swagger para sincronização automática.
- Métricas de cobertura de código por endpoint.

## Acceptance Criteria

- [ ] `docs/endpoints-index.md` existe e contém a tabela cruzada.
- [ ] Cada um dos 29 endpoints + 3 health endpoints aparece na tabela.
- [ ] Resumo de cobertura (totais e percentuais) está correto.
- [ ] Seção "Como regenerar este índice" contém comandos shell executáveis.
- [ ] Listas de "Endpoints sem BDD" / "sem E2E" / "sem documentação" estão preenchidas.
- [ ] Nenhum código de aplicação foi alterado por este change.
