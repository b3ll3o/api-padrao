---
title: BDD na Stack
description: Como aplicar Behavior-Driven Development com Gherkin + Cucumber na API
last_updated: 2026-06-15
reviewer: analista-qualidade
related:
  - 01-estrategia-testes.md
  - 03-tdd-atdd-na-stack.md
  - ../../AGENTS.md
---

# BDD na Stack (Gherkin → Specs → Testes)

> Como transformamos requisitos de negócio em **cenários Gherkin** que viram **testes executáveis**.

## 1. O que é BDD (em 1 parágrafo)

BDD é a prática de **descrever comportamento em linguagem ubíqua** (Given/When/Then) **antes** de implementar. O objetivo não é "escrever testes em inglês" — é **forçar conversas** entre negócio, dev e QA sobre **o que** o sistema faz, antes de discutir **como**.

## 2. Onde BDD vive no projeto

```text
features/                              ← especificação (humana + executável)
├── autenticacao.feature               ← 1 arquivo por módulo
├── empresas.feature
├── perfis.feature
├── permissoes.feature
└── usuarios.feature
```

Os arquivos `.feature` são a **fonte da verdade do comportamento** — escritos em pt-BR (convenção do projeto, ver AGENTS.md §5) e revisáveis pelo time inteiro.

## 3. Anatomia de um cenário Gherkin

Exemplo real (`features/autenticacao.feature`):

```gherkin
# language: pt
Funcionalidade: Autenticação de Usuário

  Eu como usuário do sistema
  Quero me autenticar com e-mail e senha
  Para que eu possa acessar as funcionalidades protegidas

  Cenário: Login com credenciais válidas
    Dado que o usuário está cadastrado com e-mail "usuario@empresa.com" e senha "Password123!"
    Quando eu enviar uma requisição POST para "/auth/login" com:
      | email     | usuario@empresa.com |
      | senha     | Password123!        |
    Então o status da resposta deve ser 200
    E o corpo da resposta deve conter "access_token"
    E o corpo da resposta deve conter "refresh_token"
```

### Estrutura obrigatória

| Parte | Obrigatório? | Propósito |
|-------|--------------|-----------|
| `# language: pt` | Sim | Define idioma das palavras-chave |
| `Funcionalidade:` | Sim | Nome da feature (1 por arquivo) |
| Bloco "Eu como / Quero / Para que" | Recomendado | Contexto de quem precisa |
| `Cenário:` (ou `Contexto:` + `Cenário:`) | Sim | Caso de teste em si |
| `Dado` / `Quando` / `Então` | Sim | Given/When/Then |
| `E` / `Mas` | Opcional | Encadear passos |

## 4. Heurística: bons cenários

### SMART (acrónimo de "Scenario Must...")

| Letra | Critério | Exemplo ruim → bom |
|-------|----------|---------------------|
| **S** | **Specific** (concreto) | "deve funcionar" → "deve retornar 401 com mensagem 'Credenciais inválidas'" |
| **M** | **Measurable** (verificável) | "rápido" → "responde em < 200 ms" |
| **A** | **Attainable** (possível) | "detecta todos os ataques" → "rejeita 5 tentativas em 1 min" |
| **R** | **Realistic** (real) | "user clica" → "POST /auth/login com body JSON" |
| **T** | **Traceable** (rastreável) | sem tag → `@REQ-AUTH-01` |

### Cobrir 3-5 cenários por feature

Para cada endpoint/comportamento, escreva **pelo menos**:

1. **Happy path** — o caso de sucesso "óbvio".
2. **Validação** — entrada inválida (campos obrigatórios, formato).
3. **Estado** — pré-condição ausente (ex.: usuário não existe, token expirado).
4. **Regra de negócio** — uma exceção da regra principal (ex.: tenant errado).
5. **Borda** — limite (paginação `page=0`, senha com 8 chars vs 9).

### Anti-padrões em Gherkin

| ❌ Evite | ✅ Prefira |
|----------|-----------|
| Detalhes de UI ("clica no botão azul") | Detalhes de API ("POST /auth/login") |
| Múltiplos "E" encadeados (5+ passos) | Dividir em 2 cenários |
| Cenários idênticos com 1 valor diferente | `Esquema do Cenário` + `Exemplos` |
| Implementação ("mocka o repository") | Comportamento ("usuário não existe no banco") |
| Sem "Então" | Sempre "Então" — caso sem assertiva é lenda |

## 5. Esquema do Cenário (Scenario Outline)

Para cobrir variações de input com a mesma lógica:

```gherkin
Esquema do Cenário: Validação de senha no login
  Quando eu enviar uma requisição POST para "/auth/login" com:
    | email     | <email>     |
    | senha     | <senha>     |
  Então o status da resposta deve ser <status>

  Exemplos:
    | email                | senha         | status |
    | user@empresa.com     | Password123!  | 200    |
    | user@empresa.com     | curta1        | 400    |
    | invalido             | Password123!  | 400    |
    | naoexiste@empresa.com| Password123!  | 401    |
```

> **Quando usar**: ≥ 3 variações do mesmo comportamento. Abaixo disso, escreva cenários separados — fica mais legível.

## 6. Como o `.feature` se conecta aos testes

Hoje a conexão é **manual** mas rastreável: o comentário `// BDD: features/autenticacao.feature:Cenário: Login com credenciais válidas` aparece no spec.

```typescript
// test/auth.e2e-spec.ts
it('deve permitir que um usuário faça login com sucesso', async () => {
  // BDD: features/autenticacao.feature:Cenário: Login com credenciais válidas
  // ATDD: test/auth.e2e-spec.ts
  // ...
});
```

### Futuro: Cucumber.js formal (recomendação)

Recomendamos avaliar a adoção de **Cucumber.js** para **automatizar** a ligação `.feature` → `*.e2e-spec.ts`:

```typescript
// futuro: test/step-definitions/auth.steps.ts
import { Given, When, Then } from '@cucumber/cucumber';
import request from 'supertest';
import { app } from '../support/app';

Given('que o usuário está cadastrado com e-mail {string} e senha {string}',
  async (email, senha) => {
    await request(app).post('/usuarios').send({ email, senha });
  }
);

When('eu enviar uma requisição POST para {string} com:',
  async (url, dataTable) => {
    this.response = await request(app).post(url).send(dataTable.rowsHash());
  }
);

Then('o status da resposta deve ser {int}', (status) => {
  expect(this.response.status).toBe(status);
});
```

> **Não fazer agora**: adicionar Cucumber aumentaria a complexidade (step-definitions duplicando o que já está nos specs). Faça **depois** se o time crescer e a rastreabilidade manual virar gargalo.

## 7. Checklist BDD por feature nova

- [ ] 1 arquivo `features/<modulo>.feature` criado/atualizado
- [ ] `# language: pt` no topo
- [ ] Bloco "Eu como / Quero / Para que" preenchido
- [ ] 3-5 cenários cobrindo: happy, validação, estado, regra, borda
- [ ] Sem detalhes de UI, sem "E" excessivos
- [ ] Cenários usam `Esquema do Cenário` quando ≥ 3 variações
- [ ] Cada cenário está referenciado em um `it()` do e2e-spec com `// BDD: ...`

## 8. Referências

- [AGENTS.md §6 — Workflow DDD → BDD → SDD → ATDD → TDD](../../AGENTS.md#6-workflow-de-desenvolvimento-ddd--bdd--sdd--atdd--tdd)
- [Gherkin Reference (Cucumber)](https://cucumber.io/docs/gherkin/reference/)
- [BDD — Dan North](https://dannorth.net/introducing-bdd/)
