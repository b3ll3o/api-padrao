---
description: [investigar e corrigir falhas de teste de forma sistemática]
last_updated: 2026-06-15
reviewer: claude-code
---

> **Autoridade geral**: [`/AGENTS.md`](../../AGENTS.md).
>
> Inspirado em `superpowers:systematic-debugging`. Este workflow é a versão **local** do projeto.

Quando um teste falha (unitário, integração ou E2E), **não chute correção**. Siga o ciclo abaixo.

## 1. Reproduzir de forma isolada

Antes de tudo, garanta que você consegue reproduzir a falha deterministicamente.

**Unitário**:

```bash
npm run test -- path/para/arquivo.spec.ts
npm run test -- path/arquivo.spec.ts -t "nome do caso"
```

**E2E**:

```bash
docker compose up -d postgres redis
export $(cat .env.test | grep -v '^#' | xargs)
npm run test:migrate
npm run test:e2e -- --testPathPattern=<feature>
```

**Com cobertura e saída verbosa**:

```bash
npm run test -- path/arquivo.spec.ts --verbose
npm run test:debug   # roda com --inspect-brk
```

## 2. Coletar evidências

- **Stack trace completo** (não só a primeira linha).
- **Logs do teste**: `test-output.log` (após `npm run test`) — pode estar filtrado; prefira a saída do terminal.
- **Logs do app** em dev: `npm run start:dev` em outro terminal; `LoggingInterceptor` loga método/URL/status/latência.
- **Traces do Jaeger**: `http://localhost:16686` — útil para E2E; procure o `traceId` retornado nos headers.
- **Estado do banco**: `npx prisma studio` para inspecionar tabelas/linhas envolvidas.

## 3. Formular hipóteses

Liste **2-3 causas candidatas** antes de tocar em código. Por exemplo, para "GET /usuarios retorna 500":

1. `PermissaoGuard` não está considerando o `empresaId` corretamente.
2. Repository está filtrando soft delete errado.
3. JWT expirado — `AuthGuard` lança e cai no `AllExceptionsFilter` com 500 em vez de 401.

Para cada hipótese, defina **um experimento que a confirme ou refute**.

## 4. Experimentos em ordem de menor custo

| Tipo de teste | Custo | Comando |
| ------------- | ----- | ------- |
| Unitário isolado | muito baixo | `npm run test -- <arquivo>` |
| Lint estático | muito baixo | `npm run lint` |
| Unitário + integração | baixo | `npm run test` |
| E2E focado | médio | `npm run test:e2e -- --testPathPattern=<x>` |
| E2E completo | alto | `npm run test:e2e` |
| Build | médio | `npm run build` |
| `validate:quick` | médio | `npm run validate:quick` |

**Regra**: confirme/elimine hipóteses com o **teste de menor custo** que dá a resposta.

## 5. Causas comuns neste projeto

| Sintoma | Suspeita principal |
| ------- | ------------------ |
| 401 em rota que deveria ser pública | Falta `@Public()` no controller |
| 403 inesperado | `PermissaoGuard` + `x-empresa-id` ausente; verifique `JwtPayload` |
| 500 com `AllExceptionsFilter` | Exceção não tratada no service; checar logs do `LoggingInterceptor` |
| Dados "fantasma" voltando | Soft delete não aplicado (repositório usando `prisma` direto em vez do `PrismaService` estendido) |
| Teste E2E intermitente | Race condition com `maxWorkers: 1` em `test/jest-e2e.json`; throttler atingido |
| Migration falhou em prod | Veja [`criar-migration.md`](./criar-migration.md) §6 (índice não-concurrent) |
| Build OK, runtime falha | `ValidationPipe` com `forbidNonWhitelisted: true` rejeitando payload |

## 6. Aplicar a correção

- Corrija **a causa raiz**, não o sintoma.
- Escreva um teste que **falhe sem** a correção e **passe com** ela (TDD red→green).
- Se a correção é grande, abra um branch e siga o ciclo pré-commit ([`alteracao-segura.md`](./alteracao-segura.md)).

## 7. Validar em ondas

Após a correção, repita a validação em ondas crescentes — não pule etapas:

1. Teste isolado que falhou → deve passar.
2. Suíte unitária do módulo → `npm run test -- src/<modulo>`.
3. Suíte unitária completa → `npm run test`.
4. E2E do módulo → `npm run test:e2e -- --testPathPattern=<modulo>`.
5. E2E completo → `npm run test:e2e`.
6. Validate completo → `npm run validate`.

## 8. Documentar a lição

Se a falha expôs um **anti-padrão** recorrente ou uma **convenção não documentada**:

- Atualize o `AGENTS.md` ou o `README.md` do módulo.
- Adicione um teste de regressão (caso ainda não exista).
- Considere adicionar uma skill em `.agent/skills/` se for um padrão reutilizável.

## 9. Quando escalar

Se após 30 min de experimentos a causa raiz não está clara:

- Pare e re-leia o `design.md` da spec em `.openspec/changes/<feature>/` (ou `.openspec/specs/<feature>/` se já arquivado).
- Abra um thread com a equipe anexando: stack trace, hipóteses já testadas, estado do banco.
- Não "forceje" uma correção sem entender — vai gerar regressões.
