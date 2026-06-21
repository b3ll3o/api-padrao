---
name: bdd-gherkin-authoring
description: Use when writing or reviewing Gherkin .feature files for BDD scenarios in pt-BR — applies when creating features/<modulo>.feature, adding new scenarios to existing features, or reviewing whether scenarios are concrete, testable, and avoid anti-patterns like UI details or excessive E-chaining.
---

# BDD Gherkin Authoring (pt-BR)

Como escrever **bons cenários Gherkin** em português para esta API. Use quando for **criar** ou **revisar** `features/<modulo>.feature`.

## When to Use

Sintomas: "cenário ficou vago", "não sei o que testar", "time não entende o cenário", "cenário repete a implementação", `Então` ausente, 5+ `E` encadeados.

Não use para: implementar (ir para TDD), revisar código TS, ou debugar teste falhando.

## Core Heurística — SMART

| Letra | Critério | Anti → Bom |
|-------|---------|-----------|
| **S** | Specific (concreto) | "deve funcionar" → "deve retornar 401 com mensagem 'Credenciais inválidas'" |
| **M** | Measurable | "rápido" → "status 200" |
| **A** | Attainable | "detecta todo ataque" → "rejeita 5 tentativas em 1 min" |
| **R** | Realistic | "user clica" → "POST /auth/login" |
| **T** | Traceable | sem tag → `@REQ-AUTH-01` |

## Quick Reference — anatomia obrigatória

```gherkin
# language: pt
Funcionalidade: Autenticação de Usuário
  Eu como usuário do sistema
  Quero me autenticar com e-mail e senha
  Para que eu possa acessar as funcionalidades protegidas

  Cenário: Login com credenciais válidas
    Dado que existe usuário com e-mail "user@empresa.com" e senha "Password123!"
    Quando eu enviar POST para "/auth/login" com:
      | email | user@empresa.com |
      | senha | Password123!     |
    Então o status deve ser 201
    E o corpo deve conter "access_token"
```

| Parte | Obrigatório? | Por quê |
|-------|--------------|---------|
| `# language: pt` | sim | Define idioma das keywords |
| `Funcionalidade:` | sim | 1 por arquivo |
| "Eu como/Quero/Para que" | recomendado | força contexto de quem precisa |
| `Cenário:` | sim | caso de teste |
| `Dado`/`Quando`/`Então` | sim | estrutura mínima |
| `E`/`Mas` | opcional | encadear passos (máx 1-2) |
| `Esquema do Cenário` + `Exemplos` | quando ≥ 3 variações | reduz duplicação |

## Regra dos 5 cenários

Para cada feature/comportamento novo, escreva **pelo menos**:

1. **Happy path** — caso de sucesso "óbvio".
2. **Validação** — entrada inválida (campos, formato, tamanho).
3. **Estado** — pré-condição ausente (user não existe, token expirado).
4. **Regra de negócio** — exceção da regra principal (tenant errado, perfil sem permissão).
5. **Borda** — limite (paginação `page=0`, senha 8 vs 9 chars, UUID inválido).

## Common Mistakes

| ❌ Evite | ✅ Prefira |
|----------|-----------|
| Detalhes de UI ("clica botão azul") | Detalhes de API ("POST /auth/login") |
| 5+ `E` encadeados | Dividir em 2 cenários |
| Cenários idênticos com 1 valor diferente | `Esquema do Cenário` + `Exemplos` |
| Implementação ("mocka o repository") | Comportamento ("usuário não existe no banco") |
| `Então` ausente | Sempre `Então` — sem assertiva é lenda |
| "deve funcionar" | "deve retornar 201 com access_token" |
| Misturar Given e When ("Dado que clico") | Given = estado prévio, When = ação |
| Testar 2 coisas em 1 cenário | 1 comportamento por cenário |

## Quando usar Esquema do Cenário

✅ **Use** quando: ≥ 3 variações do **mesmo comportamento** com inputs diferentes (boundary, validação).

❌ **Não use** quando: variações testam **comportamentos diferentes**. Ex.:

```gherkin
# ❌ Errado: mistura comportamentos
Esquema do Cenário: Login
  Quando envio POST "/auth/login" com <input>
  Então status <status>
  Exemplos:
    | input           | status |
    | {válido}        | 201    |
    | {credenciais erradas} | 401  |  # comportamento diferente

# ✅ Certo: 2 cenários separados
Cenário: Login com credenciais válidas
  Quando ...
  Então status 201
Cenário: Login com senha inválida
  Quando ...
  Então status 401
```

## Conexão com o código (rastreabilidade)

Comentário no spec/linka a origem:

```typescript
// test/auth.e2e-spec.ts
it('deve permitir login com sucesso', async () => {
  // BDD: features/autenticacao.feature:Cenário: Login com credenciais válidas
  // ATDD: test/auth.e2e-spec.ts
});
```

## Red Flags — pare e reescreva

- Cenário sem `Então` (não tem o que verificar).
- `Dado` que é uma **ação** ("Dado que eu crio um usuário") — Given = **estado prévio**, não ação.
- 5+ `E` encadeados → está descrevendo um fluxo, divida.
- "Dado que tudo funciona" → vago, reescreva.
- Linguagem de implementação ("mocka", "espera", "instancia") → use comportamento.

## Reference

- Detalhes: [`.agent/docs/02-bdd-na-stack.md`](../../docs/02-bdd-na-stack.md)
- Estratégia: [`.agent/docs/01-estrategia-testes.md`](../../docs/01-estrategia-testes.md)
- Workflow SDD: [`.agent/workflows/sdd-workflow.md`](../../workflows/sdd-workflow.md)
- Gherkin ref: https://cucumber.io/docs/gherkin/reference/
