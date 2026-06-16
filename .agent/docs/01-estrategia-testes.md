---
title: Estratégia de Testes da API
description: Visão geral, pirâmide, filosofia e métricas de qualidade de testes
last_updated: 2026-06-15
reviewer: analista-qualidade
related:
  - 02-bdd-na-stack.md
  - 03-tdd-atdd-na-stack.md
  - 04-padroes-testes-nestjs.md
  - ../../AGENTS.md
---

# Estratégia de Testes da API

> Documento canônico da estratégia de testes. Complementa `AGENTS.md §11` com profundidade operacional.

## 1. Filosofia

Aplicamos **o Agile Testing Quadrant adaptado** (Marick): o tipo de teste certo para a pergunta certa.

| Pergunta de negócio | Tipo | Camada |
|---------------------|------|--------|
| "Construímos o produto **certo**?" | Acceptance / BDD | E2E + Gherkin |
| "Construímos o produto **certo** com o **código** certo?" | E2E / Integration | E2E (Supertest) |
| "Os **componentes** funcionam juntos corretamente?" | Integration | Test.createTestingModule com deps reais |
| "Os **componentes** funcionam **isoladamente**?" | Unit | Spec co-localizado |

**Regra de ouro**: testes **guiam** o design (TDD/BDD), não **verificam código já escrito**. Quem escreve o teste antes do código descobre o contrato antes do acoplamento.

## 2. Pirâmide de Testes (números-alvo)

```text
              ╱╲
             ╱  ╲           E2E (Supertest)
            ╱ 6+ ╲          poucos, lentos, alto-sinal
           ╱──────╲
          ╱        ╲        Integration
         ╱   10-20  ╲       Test.createTestingModule
        ╱────────────╲      com 2+ providers reais
       ╱              ╲
      ╱   Unit (TDD)   ╲    Spec co-localizado,
     ╱     29+ hoje     ╲   maioria, rápidos
    ╱────────────────────╲
```

| Camada | Volume-alvo | Velocidade | Sinal de regressão |
|--------|-------------|-----------|---------------------|
| **Unit** | 60-70% | < 5 ms/caso | Localização exata do bug |
| **Integration** | 20-30% | < 200 ms/caso | Contratos entre módulos |
| **E2E** | 5-10% | 0.5-2 s/caso | Fluxo crítico do usuário |

> **Princípio invertido**: muitos E2E = testes frágeis e lentos. Muitos unitários sem integração = testes que mentem (passam no isolado, quebram no conjunto).

## 3. Estado Atual (snapshot 2026-06-15)

| Métrica | Valor | Tendência |
|---------|-------|-----------|
| Specs unitários | 29 arquivos | ↑ deveria crescer com novos módulos |
| Specs e2e | 6 arquivos | ↑ acompanhar cada módulo |
| Features Gherkin | 5 arquivos | = manter 1:1 com módulos |
| Cobertura aproximada | ~47% dos arquivos .ts de produção têm spec | precisa subir |
| Tempo de execução unit | < 5 s total | excelente |
| Tempo de execução e2e | ~30-60 s | aceitável (maxWorkers: 1) |

### Gaps identificados nesta varredura

1. **DTOs sem spec**: `create-usuario.dto.ts`, `update-usuario.dto.ts`, `create-permissao.dto.ts`, `update-permissao.dto.ts`, `create-perfil.dto.ts`, `update-perfil.dto.ts`, `create-empresa.dto.ts`, `update-empresa.dto.ts`, `add-usuario-empresa.dto.ts`, `refresh-token.dto.ts`, `login-usuario.dto.ts` — **11 DTOs sem teste de validação**.
2. **Decorators sem spec**: `public.decorator.ts` — **0 testes** para garantir que `SetMetadata(IS_PUBLIC_KEY, true)` está aplicado.
3. **Entities sem spec**: `base.entity.ts` e `soft-delete.interface.ts` — comportamento de soft delete precisa ser testado.
4. **Strategies sem spec**: nenhum spec para `passport-jwt` setup além do `jwt.strategy.spec.ts`.
5. **Pouca cobertura de cenários negativos** em vários specs (ex.: timeout, null vs undefined, decimal/string conversion, paginação no boundary page=0).

## 4. Política de Cobertura

Não definimos **threshold rígido** de % (anti-padrão: leva a testes inflados). Em vez disso, exigimos cobertura **significativa** para os seguintes pontos:

### Sempre cobrir (regra "O Quê Mínimo")

- [x] Cada service tem **pelo menos 1 teste de happy path** e **1 teste de erro por branch de exceção**.
- [x] Cada controller tem teste de **status code** (201/200/400/401/403/404/409) por rota documentada.
- [x] Cada DTO com `class-validator` tem **1 teste por constraint** (mínimo, maxLength, regex, IsEnum, IsUUID, IsEmail).
- [x] Cada decorator customizado tem teste de **emissão de metadata** (Reflector).
- [x] Cada guard tem teste de **allow + deny** com mock do `ExecutionContext`.
- [x] Cada interceptor tem teste de **side-effect** observável (log, header, transform).
- [x] Cada repository Prisma tem teste de **soft-delete auto-filter** e **restore**.
- [x] Cada caso de uso multi-tenant tem teste de **isolamento por `empresaId`**.

### Não exigir

- Cobertura de `migrations/`, `dto/` triviais (sem decorator), `*.module.ts`, `main.ts`, `tracing.ts`.
- 100% de linhas — aceitamos até 5-10% de código defensivo não coberto (logs, branches de erro irrecuperável).

## 5. Critérios "Pronto" (Definition of Done — Testes)

Uma feature só é "pronta" quando:

1. **BDD**: feature Gherkin em `features/<modulo>.feature` cobre happy path + 2 exceções principais.
2. **ATDD**: e2e-spec cobre todos os cenários Gherkin (1:1).
3. **TDD**: cada service/guard/interceptor tem spec próprio com pelo menos happy + 1 erro.
4. **Lint limpo**: `npm run lint` sem warnings.
5. **Tudo verde**: `npm run validate:quick` passa (lint + build + unit).
6. **E2E verde**: `npm run test:e2e` passa quando aplicável.
7. **Rastreabilidade**: comentários `// BDD:`, `// SDD:`, `// ATDD:`, `// TDD:` no código de produção.

## 6. Métricas a monitorar

- **Mutation score** (opcional, `stryker`): alvo ≥ 70% nos módulos críticos (auth, prisma-extension).
- **Tempo de feedback**: `npm run validate:quick` < 30 s.
- **Flakiness rate**: 0 (e2e usa `maxWorkers: 1` deliberadamente; se aparecer flake, investigar).
- **Ratio teste/código**: 1.0-1.5x (testes ≈ código em linhas) é o saudável para serviços bem cobertos.

## 7. Antipadrões a evitar

| Antipadrão | Por que é ruim | Como evitar |
|------------|----------------|-------------|
| Mockear o que se está testando | Teste vira tautologia | Mock **dependências**, não o SUT |
| Testes que dependem de ordem | Suite frágil | `beforeEach` reseta estado |
| `expect(true).toBe(true)` | Mentira | Sempre asserção sobre o **comportamento**, não a implementação |
| Hardcoded sleep (`setTimeout`) | Flakiness | Usar `waitFor` / eventos |
| Snapshot test de objetos grandes | Acopla a estrutura | Snapshot só para **componentes visuais** (não aplicável aqui) |
| Ignorar teste vermelho "depois resolvo" | Dívida técnica | Nunca commitar teste que falha |
| Espelhar Gherkin em spec | Duplicação | Spec **implementa** Gherkin, não repete |

## 8. Referências

- [AGENTS.md §11 — Testing](../../AGENTS.md#11-testing) — fonte canônica.
- [`.agent/docs/02-bdd-na-stack.md`](./02-bdd-na-stack.md) — BDD em detalhe.
- [`.agent/docs/03-tdd-atdd-na-stack.md`](./03-tdd-atdd-na-stack.md) — TDD/ATDD em detalhe.
- [`.agent/docs/04-padroes-testes-nestjs.md`](./04-padroes-testes-nestjs.md) — padrões NestJS.
- [.openspec/AGENTS.md](../../.openspec/AGENTS.md) — formato de spec.
