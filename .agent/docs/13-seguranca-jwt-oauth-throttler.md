---
title: Segurança em APIs NestJS — JWT, OAuth, Throttler, OWASP
description: Autenticação, autorização, JWT, rotação, rate limit, OWASP Top 10, LGPD aplicado
last_updated: 2026-06-15
reviewer: analista-backend
related:
  - 05-ddd-aplicado-nestjs.md
  - 06-arquitetura-hexagonal-nestjs.md
  - 11-redis-bullmq-cache-best-practices.md
  - ../../AGENTS.md
---

# Segurança em APIs NestJS — JWT, OAuth, Throttler, OWASP

> Documento de referência sobre **segurança em APIs REST** aplicada ao
> NestJS 11 do projeto `api-padrao`. Foco: autenticação (JWT + refresh
> token rotation), autorização (RBAC multi-tenant), rate limiting
> (Throttler), OWASP Top 10, e LGPD.

## 1. O que o projeto já tem

| Camada | Implementação |
|--------|--------------|
| **Autenticação** | JWT (`@nestjs/jwt`) + Passport.js + bcrypt |
| **Refresh tokens** | Persistidos em `RefreshToken`, com rotação e detecção de reuso |
| **Multi-tenant auth** | `x-empresa-id` header + `EmpresaInterceptor` + `EmpresaContext` |
| **RBAC** | `PermissaoGuard` + `@TemPermissao('CODE')` |
| **Rate limit** | `@nestjs/throttler` (4 tiers: short, medium, long, sensitive) |
| **HTTP security headers** | `@fastify/helmet` |
| **CORS** | Configurável por env (`ALLOWED_ORIGINS`) |
| **Validação** | `class-validator` + `ValidationPipe` global |
| **Audit** | `AuditInterceptor` + tabela `AuditLog` (append-only) |
| **Login history** | `LoginHistory` (sucesso + falhas) |
| **CSRF** | API stateless JWT (sem cookie) — risco CSRF é mitigado |
| **LGPD** | `password` em `select` específico; soft delete |

## 2. Autenticação — JWT (JSON Web Token)

### 2.1 O que é

JWT é um **token auto-contido** com 3 partes (header.payload.signature).
Stateless: o servidor não consulta DB para validar (só checa a assinatura).

```text
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.   ← header (alg)
eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6...← payload (claims)
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c ← signature
```

### 2.2 Claims importantes

- `sub` (subject) — id do usuário (padrão, **obrigatório**)
- `iat` (issued at) — quando foi emitido
- `exp` (expiration) — quando expira
- `iss` (issuer) — quem emitiu
- `aud` (audience) — para quem
- `jti` (JWT ID) — id único (usado em blacklist)

**No projeto**:
```typescript
// src/auth/application/services/auth.service.ts
const payload = { email, sub: userId, empresas: mappedEmpresas };
```

**Boas práticas**:
- `sub` é o **id do usuário** (não email)
- `iat`/`exp` **sempre** presentes
- **Não** colocar dados sensíveis no payload (é só **codificado**, não criptografado)
- **Não** colocar muitas claims (token fica grande → toda request envia)

### 2.3 Tempo de vida

| Token | TTL típico | Por quê |
|-------|-----------|--------|
| **Access** | 5-15 min | Limita janela de exposição |
| **Refresh** | 7-30 dias | Permite sessões longas |

**No projeto** (env vars):
- `JWT_ACCESS_EXPIRES_IN=15m` (default) — **ok**
- `JWT_REFRESH_EXPIRES_DAYS=7` (default) — **ok**

### 2.4 Algoritmo

- **HS256** (HMAC SHA-256) — chave simétrica — **simples**, mas a chave é compartilhada
- **RS256** (RSA SHA-256) — chave assimétrica — **mais seguro** se múltiplos serviços validam

**No projeto**: HS256 (default do `@nestjs/jwt`). **Recomendação**: se
houver **múltiplos serviços** validando, migrar para RS256.

### 2.5 Revogação

JWT é **stateless** — uma vez emitido, vale até `exp`. Mas há cenários
em que precisa revogar:

- Usuário desativado → access token ainda válido por 15min
- Token roubado → precisa invalidar
- Logout de todos os devices

**Estratégias**:

| Estratégia | Custo | Latência |
|------------|-------|----------|
| **Reduzir TTL** | - | Janela do TTL |
| **Blacklist de `jti`** em Redis | 1 lookup por request | ~1ms |
| **Versão de credencial** no DB (token version) | 1 query | ~5ms |
| **Refresh token rotation** + invalidação em cadeia | Já implementado | - |

**No projeto**:
- ✓ Refresh token rotation (com detecção de reuso)
- ✗ Blacklist de access tokens (não há)
- **Trade-off aceito**: access token válido por 15min mesmo após
  desativar usuário. Mitigação: revogar **todos** os refresh tokens
  ao desativar (forçando login).

## 3. Refresh Token Rotation (já implementado)

```typescript
// src/auth/application/services/auth.service.ts
async refreshTokens(refreshToken: string) {
  const tokenRecord = await this.prisma.refreshToken.findUnique({ ... });

  if (tokenRecord.revokedAt) {
    // ⚠️ REUSO DETECTADO — revoga TUDO
    await this.prisma.refreshToken.updateMany({
      where: { userId: tokenRecord.userId },
      data: { revokedAt: new Date() },
    });
    throw new ForbiddenException('Atividade suspeita detectada. Todos os tokens revogados.');
  }
  // ...
  // Revoga o atual
  await this.prisma.refreshToken.update({
    where: { id: tokenRecord.id },
    data: { revokedAt: new Date() },
  });
  // Gera novo par
  return this.generateTokens(...);
}
```

**Excelente implementação**:
1. Cada refresh token é **único** e **de uso único** (rotação)
2. Reuso → invalida **toda** a cadeia (defesa contra roubo)
3. Token é persistido no DB (pode revogar/revogar tudo)

**Possíveis melhorias** (futuro):
- **Refresh token reuse interval** (RFC 6749): permitir reuso por X segundos
  em caso de race condition
- **Detecção de dispositivo** (device fingerprint): correlacionar IP+UA
- **Notificação de segurança**: enviar e-mail ao detectar reuso

## 4. Bcrypt vs Argon2

**No projeto**: `bcrypt` (cost 10, default).

| Algoritmo | Velocidade | Segurança | Recomendação |
|-----------|-----------|-----------|--------------|
| **bcrypt** | Médio (CPU-bound) | Bom (cost 10) | Padrão seguro |
| **argon2id** | Rápido (nativo) | Melhor (memory-hard) | Preferível em 2026 |
| **scrypt** | Lento (memory-hard) | Bom | Menos comum |

**Decisão**: migrar para `argon2id` é uma evolução **líquida** (mais
seguro, mais rápido). **Trade-off**: requer lib nativa (build em Docker).

**Implementação sugerida** (mantendo `PasswordHasher` interface):

```typescript
// src/shared/infrastructure/services/argon2-password-hasher.service.ts
@Injectable()
export class Argon2PasswordHasherService extends PasswordHasher {
  async hash(senha: string): Promise<string> {
    return argon2.hash(senha, { type: argon2.argon2id });
  }
  async compare(senha: string, hash: string): Promise<boolean> {
    return argon2.verify(hash, senha);
  }
}
```

E no `app.module.ts`, trocar `useClass` — **zero impacto** no domínio.

## 5. Throttler — rate limiting

### 5.1 Configuração atual (4 tiers)

```typescript
// src/app.module.ts
ThrottlerModule.forRoot([
  { name: 'short',     ttl: 1000,  limit: 3 },    // 3 req/s
  { name: 'medium',    ttl: 10000, limit: 20 },   // 20 req/10s
  { name: 'long',      ttl: 60000, limit: 100 },  // 100 req/min
  { name: 'sensitive', ttl: 60000, limit: 10 },   // 10 req/min (rotas com @Throttle)
]);
```

**Tiers**:
- `short` — janelas curtas (1s) para evitar burst
- `medium` — picos médios (10s)
- `long` — limite geral **dominante** (1min)
- `sensitive` — para rotas sensíveis (login, password reset)

**Limite efetivo** = `min(short, medium, long)` em uma janela. A request
passa se **todos** os tiers aceitarem.

### 5.2 Customizar por rota

```typescript
// Rota de login: tier 'sensitive' (10/min)
@Throttle({ sensitive: { ttl: 60000, limit: 10 } })
@Post('login')
async login() { ... }

// Rota de health: sem limite
@SkipThrottle()
@Get('health/live')
async live() { ... }
```

**No projeto**: já tem `@SkipThrottle()` no health (verificar).

### 5.3 Throttler storage

Default: **in-memory** (não escala horizontalmente). Para multi-instância,
usar **Redis** como storage:

```typescript
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

ThrottlerModule.forRootAsync({
  inject: [AppConfig],
  useFactory: (config: AppConfig) => ({
    throttlers: [...],
    storage: new ThrottlerStorageRedisService({ host: config.redisHost, port: config.redisPort }),
  }),
}),
```

**Recomendação**: **crítico** se for deploy multi-instância. Sem isso,
cada instância conta limites separados.

## 6. RBAC — Permissões e Perfis

### 6.1 Modelo

```text
Usuário ─N:M── Empresa (via UsuarioEmpresa)
                 │
                 └──N:M── Perfil (escopado por empresa)
                              │
                              └──N:M── Permissão (global, código atômico)
```

- **Perfis** são **escopados por empresa** (mesmo nome, permissões diferentes)
- **Permissões** são **globais** (códigos atômicos: `READ_USUARIOS`, `CREATE_PERFIS`)

### 6.2 Implementação

```typescript
// src/auth/application/decorators/temPermissao.decorator.ts
@SetMetadata('permissoes', ['READ_USUARIOS'])
@UseGuards(PermissaoGuard)
@Get()
async listar() { ... }
```

```typescript
// src/auth/application/guards/permissao.guard.ts
canActivate(ctx: ExecutionContext): boolean {
  const required = this.reflector.get<string[]>('permissoes', ctx.getHandler());
  const { user, empresaId } = ctx.switchToHttp().getRequest();
  const perfis = user.empresas.find((e) => e.id === empresaId)?.perfis;
  const has = perfis?.some((p) => p.permissoes.some((perm) => required.includes(perm.codigo)));
  if (!has) throw new ForbiddenException();
  return true;
}
```

**Pontos fortes**:
- Permissões carregadas no JWT (não consulta DB por request)
- Verificação por `empresaId` (multi-tenant)

**Pontos a auditar**:
- Revogação: se um admin revoga permissão **enquanto** o usuário tem
  JWT válido, o token ainda traz a permissão antiga. Mitigação: reduzir
  TTL do access token (15min é razoável) ou implementar blacklist de permissões.
- O `JWT` carrega **muita** info (empresas, perfis, permissões). Validar
  tamanho do payload (performance).

## 7. OWASP Top 10 (2021) — checklist

| # | Vulnerabilidade | Mitigação no projeto |
|---|----------------|----------------------|
| **A01** | Broken Access Control | ✓ Auth + RBAC + multi-tenant guard |
| **A02** | Cryptographic Failures | bcrypt para senha, HTTPS em prod (proxy) |
| **A03** | Injection (SQL, NoSQL) | Prisma (parametrized queries); JSDO/DTO com validators |
| **A04** | Insecure Design | DDD, BDD, revisão de design, threat modeling |
| **A05** | Security Misconfiguration | Helmet, CORS, validação de env (Joi) |
| **A06** | Vulnerable Components | `npm audit`, Dependabot |
| **A07** | Auth Failures | Refresh rotation, lockout (a implementar) |
| **A08** | Software & Data Integrity | Soft delete, audit log, validação DTO |
| **A09** | Security Logging Failures | `pino` + `AuditLog` + `LoginHistory` |
| **A10** | SSRF | `@nestjs/axios` valida URL? (auditar) |

## 8. Checklist de segurança por endpoint

Para **todo** novo endpoint:

```text
[ ] Autenticação requerida? @Public() só se for genuinamente público
[ ] Autorização verificada? @TemPermissao('CODE_xxx') — qual código?
[ ] Tenant check? @EmpresaId() — filtra por empresa
[ ] Rate limit? Rota sensível? @Throttle({ sensitive: ... })
[ ] DTO validado? class-validator em todo campo
[ ] Resposta não vaza dados? @Exclude() em campos sensíveis
[ ] Auditável? @Audit('ação') se for mutação crítica
[ ] Log de erro? this.logger.error({...}, 'contexto')
[ ] HTTPS-only em prod? (proxy / load balancer)
[ ] Headers? Helmet (CSP, HSTS, X-Frame-Options)
```

## 9. Headers de segurança (Helmet)

```typescript
contentSecurityPolicy:
  defaultSrc: ['self']
  styleSrc: ['self', 'unsafe-inline']    // Swagger
  scriptSrc: ['self', 'https:', "'unsafe-inline'"]  // Swagger
  imgSrc: ['self', 'data:', 'validator.swagger.io']
```

**Verificar**:
- ✓ `X-Content-Type-Options: nosniff` (Helmet default)
- ✓ `X-Frame-Options: DENY` (Helmet default)
- ✓ `Strict-Transport-Security: max-age=15552000; includeSubDomains` (em prod, atrás de proxy)
- ⚠️ `unsafe-inline` no CSP — **avaliar** se Swagger pode ser desabilitado em prod

## 10. CSRF

API REST com **JWT em header `Authorization`** (sem cookie) **não é
vulnerável a CSRF** (CSRF depende de cookies automáticos).

**Mas** se algum dia usar **cookies** (httpOnly, SameSite=Strict):
- **SameSite=Strict** (default 2024+)
- **CSRF token** (double-submit cookie) para mutações
- Validar `Origin` header

**No projeto**: stateless JWT → **CSRF não é risco** hoje.

## 11. LGPD

Lei Geral de Proteção de Dados (Brasil) — pontos práticos:

| Item | Como tratar no projeto |
|------|------------------------|
| **Consentimento** | Termo de uso + opt-in (fora da API) |
| **Finalidade** | Documentar no BDD qual o uso de cada dado |
| **Necessidade** | Coletar **só** o que precisa (DTO enxuto) |
| **Acesso** | Sujeito pode pedir seus dados (endpoint `/me/dados`) |
| **Correção** | Sujeito pode corrigir (atualização de perfil) |
| **Exclusão** | Soft delete + anonimização (não deletar fisicamente) |
| **Portabilidade** | Export JSON dos dados do usuário |
| **Segurança** | Criptografia em trânsito (HTTPS) e em repouso (DB) |
| **Auditoria** | `AuditLog` registra acessos a dados pessoais |
| **DPO** | Canal de contato com DPO (fora da API) |

**Ação recomendada**:
- Adicionar campo `consentimentoAt` no `Usuario` (data do consentimento)
- Anonimizar em soft delete de dados sensíveis (ex.: nome → "Anônimo")
- Endpoint `/me/exportar-dados` (LGPD art. 18)

## 12. Validação de entrada (anti-Injection)

```typescript
// ❌ SQL injection
const query = `SELECT * FROM users WHERE email = '${email}'`;

// ✅ Prisma (parametrized)
const user = await this.prisma.usuario.findUnique({ where: { email } });

// ❌ NoSQL injection
const user = await User.findOne({ email: req.body.email }); // { $gt: '' } bypassa

// ✅ class-validator
class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) senha!: string;
}
```

**No projeto**: ✓ Prisma (parametrized), ✓ class-validator global.

## 13. Logging de segurança

```typescript
// Login: sucesso
this.logger.log({ userId, ip, userAgent, duracaoMs }, 'auth.login.success');

// Login: falha
this.logger.warn({ email, ip, userAgent, motivo: 'credenciais invalidas' }, 'auth.login.fail');

// Reuso de refresh token
this.logger.error({ userId, ip, userAgent }, 'auth.refresh.reuse_detected');
```

**Já temos**:
- `LoginHistory` (sucesso)
- `AuditLog` (ações marcadas com `@Audit()`)
- `LoggingInterceptor` (todas as requests)

**Gap a fechar**: logar **falhas de login** (atualmente, só sucesso).

## 14. Account lockout

Após N tentativas de login com senha errada para o mesmo email:

```typescript
// Pseudocódigo
const attempts = await this.cache.get(`login:attempts:${email}`) ?? 0;
if (attempts >= 5) throw new TooManyRequestsException('Conta bloqueada temporariamente');
// ... validar
if (!valid) {
  await this.cache.set(`login:attempts:${email}`, attempts + 1, { ttl: 900 }); // 15min
  throw new UnauthorizedException();
}
await this.cache.del(`login:attempts:${email}`);
```

**No projeto**: **não implementado**. **Recomendação**: adicionar.

## 15. Boas práticas de secret management

| Onde | Como |
|------|------|
| `JWT_SECRET` | Env var (Joi validado), NUNCA hardcoded |
| **Em dev** | `.env` (não commitado) |
| **Em CI** | GitHub Actions Secrets / GitLab CI Variables |
| **Em prod** | Vault, AWS Secrets Manager, GCP Secret Manager |
| **Rotação** | Suportar múltiplos secrets (kid) e alternar gradualmente |

**No projeto**: ✓ Joi valida envs. ⚠️ Garantir que `JWT_SECRET` em prod
seja de **pelo menos 32 bytes** (HS256).

## 16. Headers de request — validação

```typescript
// Permitir só headers conhecidos
allowedHeaders: ['Content-Type', 'Authorization', 'x-empresa-id', 'x-request-id'],
```

**No projeto**: ✓ já configurado.

**Cuidado com**:
- `x-forwarded-for` — se `trustProxy: true`, vem do proxy; senão, não
  confiar (cliente pode falsificar)
- `user-agent` — qualquer string; loggar mas não confiar

## 17. Auditoria de segurança — checklist trimestral

```text
[ ] npm audit --audit-level=high → zero
[ ] npm outdated → avaliar atualizações
[ ] Review de novos endpoints (auth/authz/validation)
[ ] Revisão de permissões (princípio do menor privilégio)
[ ] Testes de segurança (XSS, SQLi, IDOR, CSRF, SSRF)
[ ] Penetration testing anual
[ ] Rotação de secrets (90 dias)
[ ] Revisão de logs de segurança (alertas, anomalias)
[ ] Backup testado (RPO/RTO)
[ ] Plano de resposta a incidente documentado
```

## 18. Anti-padrões de segurança a vigiar

| ❌ Anti | ✅ Correto |
|---------|-----------|
| `Authorization: Bearer undefined` | Validar que token existe |
| JWT sem `exp` | Sempre `exp` |
| Senha em log | `@Exclude()` + filtrar logs |
| Hardcoded secret | Env var + Vault |
| `try { ... } catch {}` (engolir erro de auth) | Loggar + lançar 401/403 |
| Token em URL (query string) | Sempre em header |
| `Access-Control-Allow-Origin: *` com `credentials: true` | Lista de origens específicas |
| `eval()`, `Function()`, `vm.runInNewContext` | Nunca em server-side |
| Confiar em `req.ip` sem `trustProxy` | Configurar `trustProxy` corretamente |
| `res.json(user)` com senha | `@Exclude()` na entidade |

## 19. Roadmap de segurança

1. **Já temos** (verificar)
   - [x] JWT + refresh rotation
   - [x] RBAC multi-tenant
   - [x] Throttler 4-tier
   - [x] Helmet + CORS
   - [x] class-validator
   - [x] AuditLog + LoginHistory
2. **Curto prazo**
   - [ ] Account lockout (5 tentativas → 15min)
   - [ ] Migrar bcrypt → argon2id
   - [ ] Throttler storage em Redis (multi-instância)
   - [ ] CSP mais estrito (sem `unsafe-inline` em prod)
3. **Médio prazo**
   - [ ] Blacklist de access tokens (revogação imediata)
   - [ ] Anonimização em soft delete (LGPD)
   - [ ] Endpoint `/me/exportar-dados` (LGPD)
   - [ ] Permission version (invalidação por mudança de role)
4. **Longo prazo**
   - [ ] MFA (TOTP / WebAuthn)
   - [ ] OAuth2 / OpenID Connect
   - [ ] Penetration testing anual
   - [ ] Bug bounty program

## 20. Referências

- OWASP Top 10 — [owasp.org/Top10](https://owasp.org/www-project-top-ten/)
- OWASP API Security Top 10 — [owasp.org/API-Security](https://owasp.org/www-project-api-security/)
- Auth0 JWT Handbook — [auth0.com/resources/jwt](https://auth0.com/resources/jwt)
- OWASP ASVS (Application Security Verification Standard)
- NestJS Security — [docs.nestjs.com/security/helmet](https://docs.nestjs.com/security/helmet)
- LGPD — [gov.br/lgpd](https://www.gov.br/cidadania/pt-br/acesso-a-informacao/lgpd)
- NIST SP 800-63B — Digital Identity Guidelines (Authentication)
- [.agent/docs/05-ddd-aplicado-nestjs.md](./05-ddd-aplicado-nestjs.md)
- [.agent/docs/06-arquitetura-hexagonal-nestjs.md](./06-arquitetura-hexagonal-nestjs.md)
- [AGENTS.md §10 — Variáveis de Ambiente](../../AGENTS.md#10-variáveis-de-ambiente)
- [src/auth/application/services/auth.service.ts](../../src/auth/application/services/auth.service.ts)
- [src/auth/application/guards/auth.guard.ts](../../src/auth/application/guards/auth.guard.ts)
- [src/auth/application/guards/permissao.guard.ts](../../src/auth/application/guards/permissao.guard.ts)
