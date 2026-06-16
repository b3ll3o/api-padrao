# Contribuindo

> Bem-vindo! Este guia é o caminho para adicionar uma feature ou endpoint novo no projeto `api-padrao`. Obedeça as fases na ordem — pular uma fase é a principal causa de retrabalho.

## TL;DR

```text
1. BDD   → escreve o cenário Gherkin em features/<modulo>.feature
2. SDD   → cria a spec em .openspec/changes/<feature>/{proposal,design,tasks}.md
3. ATDD  → escreve o teste e2e (deve FALHAR)
4. TDD   → escreve o teste unitário (deve FALHAR)
5. CODE  → implementa até os testes passarem
6. DOCS  → atualiza src/<modulo>/README.md
7. AUDIT → adiciona @Auditar({...}) se aplicável
8. PERM  → adiciona @TemPermissao('CODIGO') se aplicável
9. THROT → adiciona @Throttle({ tier: 'X' }) se aplicável
10. PR   → abre PR, RTM atualizado
```

## Pré-requisitos

- [ ] Ler `AGENTS.md` (visão geral)
- [ ] Ler `.openspec/AGENTS.md` (formato de spec)
- [ ] Familiaridade com NestJS 11, Prisma 6
- [ ] Docker rodando (Postgres + Redis)

## Workflow Detalhado

### Fase 0: Definir o que vai ser construído

- [ ] **Story Mapping**: quebrar a feature em user stories
- [ ] **Critérios de Aceitação**: usar `Quando/Então` em Gherkin
- [ ] **INVEST**: a story é Independent, Negotiable, Valuable, Estimable, Small, Testable?

### Fase 1: BDD (Behavior-Driven Development)

Cenários em Gherkin documentam o COMPORTAMENTO esperado, antes do código.

**Arquivo**: `features/<modulo>.feature`

```gherkin
Funcionalidade: <Nome da feature>

Cenário: <Descrição do cenário>
  Dado que <contexto>
  Quando <ação>
  Então <resultado esperado>
```

**Critérios**:
- [ ] Pelo menos 1 cenário "happy path"
- [ ] Cenários de erro (validação, autenticação, autorização)
- [ ] Linguagem de negócio (sem jargão técnico)

### Fase 2: SDD (Spec-Driven Development)

Spec formal em `.openspec/changes/<feature>/`.

**Estrutura**:
```
.openspec/changes/<feature>/
├── proposal.md   # Por que + What Changes + Impact + Risks
├── design.md     # FR/NFR em RFC 2119 + API + Data Models + Edge Cases
└── tasks.md      # Checklist de tasks (com [x] ao completar)
```

**Critérios**:
- [ ] RFC 2119 em todos os requisitos (MUST/SHALL/SHOULD/MAY)
- [ ] Cada REQ tem ID e rastreabilidade (BDD/ATDD/TDD)
- [ ] Approval de pelo menos 1 reviewer antes de prosseguir

### Fase 3: ATDD (Acceptance Test-Driven Development)

Teste e2e que valida o comportamento end-to-end. **Deve FALHAR inicialmente.**

**Arquivo**: `test/<feature>.e2e-spec.ts`

```typescript
describe('Feature: <Nome>', () => {
  it('should <comportamento>', async () => {
    const res = await request(app).post('/endpoint').send(payload);
    expect(res.status).toBe(201);
  });
});
```

**Critérios**:
- [ ] Cobre os ACs do SDD
- [ ] Roda com `npm run test:e2e`
- [ ] Estado limpo entre testes (use `e2e-utils.ts`)

### Fase 4: TDD (Test-Driven Development)

Testes unitários que validam a lógica. **Devem FALHAR inicialmente.**

**Arquivo**: `src/<modulo>/<arquivo>.spec.ts` (colocalizado)

```typescript
describe('Service', () => {
  it('should <comportamento>', async () => {
    // Arrange
    // Act
    // Assert
  });
});
```

**Critérios**:
- [ ] Cobre casos de borda (null, empty, erro)
- [ ] Mocks para dependências externas
- [ ] Roda com `npm run test`

### Fase 5: Implementação

Implementar até os testes passarem. **Não inventar features não documentadas.**

- [ ] Domain layer (entities, repositories interfaces, services interfaces)
- [ ] Application layer (use cases, DTOs com class-validator)
- [ ] Infrastructure layer (Prisma repositories, controllers, guards)
- [ ] Module wiring (providers, exports)

### Fase 6: Documentação

- [ ] Atualizar `src/<modulo>/README.md` com o novo endpoint
- [ ] Swagger decorators (`@ApiOperation`, `@ApiResponse`)
- [ ] Atualizar `AGENTS.md` §7 (Catálogo de Módulos) se necessário

### Fase 7: Segurança e Auditoria

- [ ] `@Public()` apenas em endpoints públicos
- [ ] `@TemPermissao('CODIGO_PERMISSAO')` em endpoints protegidos
- [ ] `@Auditar({ recurso: 'recurso', acao: 'CREATE' })` em mutações
- [ ] `@Throttle({ tier: 'X' })` em endpoints sensíveis (login, refresh, etc.)
- [ ] Senhas hasheadas (nunca em plain text)
- [ ] Inputs validados com class-validator

### Fase 8: Pull Request

- [ ] Todos os testes passando (lint, build, test, e2e)
- [ ] RTM atualizado (cada REQ aponta para arquivo de teste)
- [ ] Comentários `// BDD: ...`, `// SDD: ...`, `// ATDD: ...`, `// TDD: ...` no código
- [ ] Description do PR linka a spec em `.openspec/changes/<feature>/`
- [ ] Reviewer: 1 dev sênior + 1 QA

## Convenções de Código

### Naming
- Arquivos: kebab-case (`usuario.service.ts`)
- Classes: PascalCase (`UsuarioService`)
- Métodos: camelCase (`findById`)
- Constantes: UPPER_SNAKE_CASE (`MAX_RETRY_COUNT`)
- DTOs: `<Nome>Dto` (`CreateUsuarioDto`)
- Enums: PascalCase + valores UPPER_SNAKE_CASE

### Estrutura de Módulo (Clean Architecture)
```
src/<modulo>/
├── application/
│   ├── controllers/    # NestJS controllers
│   ├── services/       # Use cases
│   └── dto/            # DTOs com class-validator
├── domain/
│   ├── entities/       # Entidades de domínio
│   ├── repositories/   # Interfaces de repositório
│   └── services/       # Interfaces de serviços externos
├── infrastructure/
│   ├── repositories/   # Implementações Prisma
│   ├── strategies/     # Passport strategies, etc.
│   └── services/       # Implementações de serviços
├── <modulo>.module.ts
└── README.md
```

### Imports
- Use path aliases: `import { X } from 'src/...'`
- Evite imports circulares (use `forwardRef` se inevitável)

## Comandos Úteis

```bash
# Validar tudo
npm run validate

# Lint
npm run lint

# Build
npm run build

# Testes unitários
npm run test

# Testes e2e (requer Postgres + Redis)
npm run test:migrate && npm run test:e2e

# Migração do Prisma
npx prisma migrate dev --name <descricao>
npx prisma format
npx prisma generate
```

## O que NÃO fazer

- ❌ Pular BDD e ir direto para o código
- ❌ Inventar endpoints que não estão no SDD
- ❌ Commitar `.env` ou segredos
- ❌ Commitar migrations sem testar
- ❌ Esquecer `@Throttle` em endpoints sensíveis
- ❌ Retornar 200 em vez de 201 para criação de recursos
- ❌ Senhas em logs ou respostas
- ❌ Soft delete sem `BaseEntity`

## Onde Pedir Ajuda

- Spec dúvida → ler `.openspec/AGENTS.md`
- Arquitetura → ler `AGENTS.md`
- Workflow → este arquivo
- Skills disponíveis → `.agent/skills/`
