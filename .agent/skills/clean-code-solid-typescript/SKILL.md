---
name: clean-code-solid-typescript
description: Use when reviewing a PR, refactoring code, naming functions, or deciding whether a class has too many responsibilities — applies the Clean Code and S.O.L.I.D. heuristics to TypeScript and NestJS code, with code smells and refactorings mapped to this project's conventions.
last_updated: 2026-06-15
reviewer: analista-backend
---

# Clean Code + S.O.L.I.D. para TypeScript/NestJS

Como aplicar **Clean Code** (Robert C. Martin) e **S.O.L.I.D.** em código
TypeScript e NestJS 11 do projeto `api-padrao`. Use quando for **revisar
PR**, **renomear**, **refatorar função grande**, ou **decidir se uma classe
precisa ser dividida**.

## When to Use

Sintomas: "essa função tem 80 linhas", "não sei o que esse método faz
sem ler 200 linhas", "essa classe mudou por 3 motivos essa sprint",
"por que tem `any` aqui?", "esse comentário não ajuda".

**Não** use para: modelagem de domínio (use `ddd-aggregate-modeling`),
decisões de arquitetura (use `hexagonal-ports-nestjs`), tuning de
performance (use `performance-profiling-nestjs`).

## As 5 regras de ouro

```text
1. Nomes revelam intenção          →  findByEmailWithPerfis (não "find")
2. Funções pequenas e focadas      →  < 30 linhas; 1 responsabilidade
3. Argumentos curtos               →  0-2 ideal; > 3 considere objeto
4. Sem side-effects ocultos        →  o nome diz exatamente o que faz
5. Comentários explicam "por quê"  →  não "o que" (o código já diz)
```

## 1. S — Single Responsibility Principle (SRP)

### Detector

> *"Eu consigo descrever o que essa classe faz em **uma frase** sem
> usar 'e'?"*

Se não, está violando SRP.

### Anti → Bom

```typescript
// ❌ Service com 4 motivos para mudar
@Injectable()
export class UsuariosService {
  async criar(dto: CreateUsuarioDto) { /* regra + persist + audit + email */ }
  async listar() { /* query + cache + log + metric */ }
  async desativar() { /* regra + email + audit + revoke */ }
}

// ✅ 1 classe por use case
@Injectable()
export class CriarUsuarioUseCase {
  constructor(
    private readonly userRepo: UsuarioRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly eventBus: EventBus,
  ) {}
  async execute(input: { email: string; senha: string }): Promise<Usuario> {
    const senhaHash = await this.passwordHasher.hash(input.senha);
    const user = Usuario.criar({ email: input.email, senhaHash });
    await this.userRepo.save(user);
    await this.eventBus.publish(new UsuarioCriadoEvent(user.id));
    return user;
  }
}
```

**Trade-off**: muitos arquivos vs classes grandes. **Regra prática**:
se o service tem > 5 métodos públicos, considere separar.

## 2. O — Open/Closed Principle (OCP)

### Anti → Bom

```typescript
// ❌ Toda vez que aparece um novo perfil, o if cresce
if (user.role === 'admin') { /* 20 linhas */ }
else if (user.role === 'gerente') { /* 20 linhas */ }
else if (user.role === 'auditor') { /* 20 linhas */ }

// ✅ Strategy / Decorator
interface ICalculaDesconto { calcular(valor: number): number; }
class DescontoAdmin implements ICalculaDesconto { calcular(v: number) { return v * 0.2; } }
class DescontoGerente implements ICalculaDesconto { calcular(v: number) { return v * 0.1; } }
// Para "auditor": cria a classe. Zero mudança no consumidor.
```

**No projeto**: `DefaultAuthorizationService` é candidato a Strategy se
surgir mais um modo de autorização (ex.: ABAC, ACL por recurso).

## 3. L — Liskov Substitution Principle (LSP)

### Anti → Bom

```typescript
// ❌ Subtipo que viola o contrato
class Cpf {
  validar(cpf: string): boolean { return true; }
}
class CpfEstrangeiro extends Cpf {
  validar(cpf: string): boolean { throw new Error('Não aplicável'); }
  // VIOLA — não pode ser usado em qualquer lugar que espera Cpf
}

// ✅ Não há herança; cada um implementa a interface
interface IIdentificador { validar(s: string): boolean; }
class Cpf implements IIdentificador { /* só CPF */ }
class DocumentoEstrangeiro implements IIdentificador { /* passaporte etc */ }
```

**No projeto**: `PasswordHasher` é interface honrada por
`BcryptPasswordHasherService`. Trocar para `Argon2PasswordHasherService`
não deve mudar **nada** no `AuthService` (DIP + LSP).

## 4. I — Interface Segregation Principle (ISP)

### Anti → Bom

```typescript
// ❌ Deus-interface
interface Repository<T> {
  save(entity: T): Promise<T>;
  update(entity: T): Promise<T>;
  delete(id: any): Promise<void>;
  findById(id: any): Promise<T>;
  findAll(): Promise<T[]>;
  search(criteria: any): Promise<T[]>;
  count(criteria?: any): Promise<number>;
  // ... 12 mais
}

// ✅ Interfaces segregadas
interface ReadRepository<T, ID> {
  findById(id: ID): Promise<T | null>;
  list(criteria: ListCriteria<T>): Promise<Paginated<T>>;
}
interface WriteRepository<T, ID> {
  save(entity: T): Promise<T>;
  delete(id: ID): Promise<void>;
}
```

**No projeto**: `UsuarioRepository` é granular. Manter essa granularidade.

## 5. D — Dependency Inversion Principle (DIP)

### Detector

```bash
grep -R "private prisma\|this.prisma\." src/<m>/application/
```

Se aparecer, está violando DIP (e Hexagonal).

### Anti → Bom

```typescript
// ❌ Depende de detalhe
constructor(private prisma: PrismaService) {}

// ✅ Depende de abstração (porta)
constructor(@Inject(USUARIO_REPOSITORY) private userRepo: UsuarioRepository) {}
```

**No projeto**: `AuthService` injeta `PrismaService` direto (gap a fechar).
Recomendação: extrair portas e refatorar (ver `hexagonal-ports-nestjs`).

## 6. Nomes que revelam intenção

### Comprimento vs clareza

```typescript
// ❌ Curto demais
const u = await this.uRepo.f(id);

// ✅ Comprimento proporcional ao escopo
const usuario = await this.userRepository.findById(id);
// ou, em escopo pequeno:
const u = users.find((u) => u.id === id); // ok
```

### Nomes de métodos (verbos)

| Verbo | Quando |
|-------|--------|
| `find*` | Pode retornar `null` |
| `get*` | Assume que existe (lança se não) |
| `fetch*` | I/O externo (rede, DB) |
| `load*` | Lê de cache/DB |
| `save` | Cria ou atualiza |
| `create` | Só cria (lança se já existe) |
| `update` | Só atualiza (lança se não existe) |
| `delete` / `remove` | Apaga (cuidado com soft delete) |
| `validate` | Retorna boolean (sem throw) |
| `assert` | Lança se inválido |

**No projeto**: `findById`, `findByEmail` (corretos — podem retornar null).
`generateTokens` (verbo correto). `runResilient` (verbete da lib `opossum` — ok).

## 7. Funções pequenas (e fazendo uma coisa)

### Detector

> *"Se eu pedir um resumo de **1 frase** do que essa função faz, e a
> frase tem 'e' (and), ela faz mais de uma coisa."*

### Refactorings comuns

| Sintoma | Refactor |
|---------|----------|
| Função de 80 linhas | Extrair método por parágrafo |
| Variável `temp1`, `temp2` | Renomear com domínio |
| Comentário explicando bloco | Extrair método (nome vira o "porquê") |
| Aninhamento > 3 | **Early return** (guard clauses) |
| `if (cond) { if (cond2) { ... } }` | `if (!cond || !cond2) return;` |

### Exemplo: early return

```typescript
// ❌ Aninhamento
async login(dto) {
  if (dto) {
    const user = await this.repo.findByEmail(dto.email);
    if (user) {
      const valid = await this.hasher.compare(dto.senha, user.senha);
      if (valid) {
        return this.issueTokens(user);
      } else {
        throw new UnauthorizedException();
      }
    } else {
      throw new UnauthorizedException();
    }
  } else {
    throw new BadRequestException();
  }
}

// ✅ Guard clauses
async login(dto) {
  if (!dto?.email || !dto?.senha) throw new BadRequestException();
  const user = await this.repo.findByEmail(dto.email);
  if (!user) throw new UnauthorizedException();
  const valid = await this.hasher.compare(dto.senha, user.senha);
  if (!valid) throw new UnauthorizedException();
  return this.issueTokens(user);
}
```

## 8. Argumentos — até 3

### Regra

> 0 = ideal (`.now()`)
> 1 = OK
> 2 = OK
> 3 = limite; considere objeto
> 4+ = use objeto SEMPRE

### Anti → Bom

```typescript
// ❌ 4+ args
async criarUsuario(email, senha, perfil, empresaId, ip) {}

// ✅ Objeto
async criarUsuario(input: {
  email: string;
  senha: string;
  perfil: string;
  empresaId: string;
  ip?: string;
}) {}
```

## 9. Comentários — explicam "por quê"

### Anti → Bom

```typescript
// ❌ Ruim: redundante
const i = 0; // inicializa i com 0
x = x + 1; // incrementa x

// ❌ Ruim: compensando código ruim
// i = i + 1; // FIXME: isso é um workaround por causa do bug #123
// (em vez disso, RESOLVA o bug #123)

// ❌ Ruim: commit log no código
// Modificado por Leo em 2026-05-01
// Refatorado por Ana em 2026-05-15

// ✅ Bom: explica "por quê"
// O TTL do cache é maior que o TTL do JWT (15min) para evitar
// inconsistência entre token válido e usuário desativado no cache
const CACHE_TTL = 1800;

// ✅ Bom: referência externa
// RFC 6749 §6 — Refresh Token Rotation: reuso = revogação
// https://datatracker.ietf.org/doc/html/rfc6749#section-6
if (tokenRecord.revokedAt) {
  // ... revoga tudo
}
```

## 10. Tratamento de erro

### Anti → Bom

```typescript
// ❌ Genérico
throw new Error('Falhou');

// ❌ Engolir
try { await this.x() } catch (e) { /* nada */ }

// ❌ Catch genérico
} catch (e) {
  console.log(e);
}

// ✅ Erro tipado
throw new DomainError('USUARIO_NAO_ENCONTRADO', 'Usuário não encontrado.');

// ✅ Log estruturado
} catch (e) {
  this.logger.error({ userId, err: e }, 'Falha ao desativar usuário');
  throw e;
}

// ✅ Engolir SÓ quando é esperado
try {
  await this.cache.set(key, value);
} catch (e) {
  this.logger.warn({ key, err: e }, 'Cache miss forçado por falha');
  // OK engolir: cache é best-effort
}
```

## 11. Imutabilidade

### Default `readonly`

```typescript
// ✅ Construtor com readonly
export class Money {
  constructor(
    public readonly amount: number,
    public readonly currency: 'BRL' | 'USD',
  ) {}

  add(other: Money): Money {
    return new Money(this.amount + other.amount, this.currency);
  }
}

// ❌ Mutação exposta
class Money {
  amount: number;
}
const m = new Money();
m.amount = 100; // mutação direta
```

**No projeto**: hoje entidades mutam (`user.ativo = true; user.deletedAt = null`).
Recomendação: refatorar para imutável (ver `ddd-aggregate-modeling`).

## 12. TypeScript estrito

### Sem `any`

```typescript
// ❌ any — perde checagem
const mapped: any = empresas.map((ue: any) => ({ ... }));

// ✅ tipo explícito
interface EmpresaMapping { id: string; perfis: PerfilMapping[]; }
const mapped: EmpresaMapping[] = empresas.map(empresaMapper.toMapping);
```

**Regra**: `any` só com `// eslint-disable-next-line` + justificativa.

### Sem `as any` (cast perigoso)

```typescript
// ❌ as any — esconde bug
const tokens = await this.generateTokens(...);
console.log((tokens as any).access);

// ✅ Type guard ou refactor da função
const tokens: { access_token: string; refresh_token: string } = await this.generateTokens(...);
```

**No projeto**: `auth.service.ts:78` usa `as any` para `expiresIn` (justificado
em comentário — gap a fechar com cast tipado).

## 13. Princípios adicionais

### DRY (Don't Repeat Yourself)

```typescript
// ❌ Validação duplicada em 3 DTOs
@IsEmail() email!: string;
@MinLength(8) senha!: string;
// ... em CreateUsuarioDto, UpdateUsuarioDto, LoginUsuarioDto

// ✅ Mapped types ou VO
@IsEmail() email!: Email; // VO encapsula validação
```

**No projeto**: usar `@nestjs/mapped-types` (`PartialType`, `PickType`,
`OmitType`) para evitar duplicação.

### KISS (Keep It Simple)

```typescript
// ❌ Factory + Strategy + Decorator para "se x entao y"
class CalculoFactory { /* 50 linhas */ }

// ✅ if simples
if (tipo === 'premium') return valor * 0.8;
return valor;
```

**Regra**: 3+ ifs encadeados na mesma variável → Strategy. 1-2 ifs → if.

### YAGNI (You Aren't Gonna Need It)

```typescript
// ❌ "E se um dia quisermos trocar de ORM?"
abstract class AbstractRepository<T> {
  // 200 linhas para 1 ORM possível
}

// ✅ Implementação concreta hoje; abstrair quando precisar
class PrismaUsuarioRepository { /* simples */ }
```

**No projeto**: cuidado com abstrações que ainda não têm **2+ implementações
concretas**. Hexagonal é valioso **mesmo** sem 2º ORM, mas as portas devem
ser **úteis** (não "para o dia que precisarmos").

## 14. ESLint — regras úteis

```javascript
// eslint.config.mjs
rules: {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/explicit-function-return-type': ['warn', {
    allowExpressions: true, allowHigherOrderFunctions: true,
  }],
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  'max-lines-per-function': ['error', { max: 50, skipComments: true }],
  'max-params': ['error', { max: 3 }],
  'complexity': ['error', { max: 10 }],
  'no-console': 'error',  // ou 'warn' em dev
  'prefer-const': 'error',
  'no-var': 'error',
}
```

## 15. Code Smells — checklist de revisão

| Smell | Detector | Ação |
|-------|----------|------|
| **Função longa** | > 30 linhas | Extrair |
| **Parâmetros demais** | > 3 | Objeto |
| **Anemic Entity** | só `get`/`set`; regra no service | Mover regra para entidade |
| **Feature Envy** | método usa mais outra classe | Mover método |
| **Primitive Obsession** | `string` para e-mail, `number` para cnpj | Value Object |
| **Long Method Chain** | `a.b().c().d().e()` | Encapsular |
| **Speculative Generality** | "e se um dia..." | Apagar (YAGNI) |
| **Dead Code** | método/classe não usado | Apagar |
| **Commentário redundante** | "soma x + y" ao lado de `x + y` | Apagar |
| **Mensagem de erro genérica** | `throw new Error('...')` | Tipar (`DomainError`) |
| **Try vazio** | `try { } catch {}` | Tratar ou propagar |
| **`any` sem justificativa** | `grep "any" src/` | Tipar |
| **Mutação compartilhada** | argumento mutado dentro de método | Imutabilidade |
| **Shotgun Surgery** | 1 mudança = N arquivos | Centralizar |
| **Divergent Change** | 1 classe = N motivos de mudança | SRP |

## 16. Métricas e limites (orientativos)

| Métrica | Limite saudável | Como medir |
|---------|---------------|-----------|
| Linhas por arquivo | < 300 | `wc -l` |
| Linhas por método | < 30 | ESLint |
| Parâmetros por método | ≤ 3 | ESLint |
| Complexidade ciclomática | < 10 | ESLint `complexity` |
| Acoplamento (deps) | ≤ 7 | análise estática |
| `any` por arquivo | 0 | `grep -c "any"` |
| `// eslint-disable` sem justificativa | 0 | `grep "eslint-disable"` |

## 17. Boas práticas de teste

- `deve [comportamento] quando [condição]` (projeto: pt-BR)
- 1 assertiva conceitual por teste
- Arrange-Act-Assert visível
- Sem `if` no teste
- Sem `setTimeout` real
- Mock só de **dependências** (não do SUT)
- `beforeEach` reseta estado

## 18. Reference

- Robert C. Martin — *Clean Code* (2008)
- Robert C. Martin — *Clean Architecture* (2017)
- Sandi Metz — *Practical Object-Oriented Design* (2012) — 99% aplicável a TS
- Refactoring Guru — [refactoring.guru](https://refactoring.guru/)
- TypeScript Handbook — [typescriptlang.org/docs](https://www.typescriptlang.org/docs/handbook/)
- [`.agent/docs/07-clean-code-solid-typescript.md`](../../docs/07-clean-code-solid-typescript.md) — completo
- [`.agent/skills/ddd-aggregate-modeling/SKILL.md`](../ddd-aggregate-modeling/SKILL.md)
- [`.agent/skills/hexagonal-ports-nestjs/SKILL.md`](../hexagonal-ports-nestjs/SKILL.md)
- [`.agent/skills/nest-testing-patterns/SKILL.md`](../nest-testing-patterns/SKILL.md) — testes
- [AGENTS.md §5 — Convenções](../../../AGENTS.md#5-convenções)
