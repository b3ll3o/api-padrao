---
name: security-auth-review
description: Use when reviewing authentication/authorization, designing new endpoints, picking throttling tiers, handling PII, or planning LGPD compliance — applies JWT/refresh rotation, RBAC multi-tenant, OWASP Top 10, and rate limiting heuristics to NestJS APIs.
last_updated: 2026-06-15
reviewer: analista-backend
---

# Segurança — AuthN, AuthZ, Rate Limit, OWASP, LGPD

Como aplicar **segurança** em APIs NestJS do projeto `api-padrao`. Foco:
JWT + refresh rotation, RBAC multi-tenant, throttling, OWASP Top 10, LGPD.

## When to Use

Sintomas: "esse endpoint precisa de auth?", "qual tier de throttle?",
"como revogar access token?", "campo sensível está no JSON?", "esqueci o
filtro `empresaId`", "como fica LGPD?".

**Não** use para: modelagem de domínio (use `ddd-aggregate-modeling`),
performance de I/O (use `performance-profiling-nestjs`).

## 1. Checklist por endpoint (obrigatório)

```text
[ ] Autenticação requerida? @Public() só se for genuinamente público
[ ] Autorização verificada? @TemPermissao('CODE_xxx') — qual código?
[ ] Tenant check? @EmpresaId() — filtra por empresa
[ ] Rate limit? Rota sensível? @Throttle({ sensitive: { ... } })
[ ] DTO validado? class-validator em todo campo
[ ] Resposta não vaza dados? @Exclude() em campos sensíveis
[ ] Auditável? @Audit('ação') se for mutação crítica
[ ] Log de erro? this.logger.error({...}, 'contexto')
[ ] HTTPS-only em prod? (proxy / LB)
[ ] Headers? Helmet (CSP, HSTS, X-Frame-Options)
```

## 2. JWT — claims e tempo de vida

| Claim | Significado | Obrigatório |
|-------|-------------|-------------|
| `sub` | id do usuário | SIM |
| `iat` | emitido em | sim |
| `exp` | expira em | SIM |
| `iss` | quem emitiu | recomendado |
| `aud` | para quem | recomendado |
| `jti` | id único (blacklist) | quando precisa revogar |

**No projeto** (env vars):
- `JWT_ACCESS_EXPIRES_IN=15m` (default) — **ok**
- `JWT_REFRESH_EXPIRES_DAYS=7` (default) — **ok**

**Boas práticas**:
- `sub` = id (não email)
- Não colocar dados sensíveis (é só **codificado**)
- Não colocar muitas claims (token fica grande)

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
    throw new ForbiddenException('Atividade suspeita detectada.');
  }
  // ...
}
```

**Por que importa**: rotação de refresh tokens mitiga **roubo** (token
visto uma vez não pode ser reusado). Reuso = sinal de ataque → revoga tudo.

## 4. Throttler (4 tiers)

```typescript
ThrottlerModule.forRoot([
  { name: 'short',     ttl: 1000,  limit: 3 },    // 3 req/s
  { name: 'medium',    ttl: 10000, limit: 20 },   // 20 req/10s
  { name: 'long',      ttl: 60000, limit: 100 },  // 100 req/min
  { name: 'sensitive', ttl: 60000, limit: 10 },   // 10 req/min
]);
```

**Limite efetivo** = `min(short, medium, long)`. A request passa se
**todos** aceitarem.

### Customizar por rota

```typescript
// Rota sensível (login, password reset)
@Throttle({ sensitive: { ttl: 60000, limit: 10 } })
@Post('login')
async login() { ... }

// Sem limite (health check)
@SkipThrottle()
@Get('health/live')
async live() { ... }
```

### Storage em Redis (multi-instância)

Default é in-memory (não escala). Para multi-instância:

```typescript
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

ThrottlerModule.forRootAsync({
  useFactory: (config: AppConfig) => ({
    throttlers: [...],
    storage: new ThrottlerStorageRedisService({
      host: config.redisHost, port: config.redisPort,
    }),
  }),
}),
```

**Recomendação**: **crítico** se for deploy multi-instância.

## 5. RBAC multi-tenant

```text
Usuário ─N:M── Empresa (via UsuarioEmpresa)
                 │
                 └──N:M── Perfil (escopado por empresa)
                              │
                              └──N:M── Permissão (código atômico)
```

- **Perfis**: escopados por empresa (mesmo nome, permissões diferentes)
- **Permissões**: globais (códigos atômicos: `READ_USUARIOS`, etc.)

### Implementação

```typescript
// src/auth/application/decorators/temPermissao.decorator.ts
@SetMetadata('permissoes', ['READ_USUARIOS'])
@UseGuards(PermissaoGuard)
@Get()
async listar() { ... }
```

```typescript
// permissao.guard.ts
canActivate(ctx: ExecutionContext): boolean {
  const required = this.reflector.get<string[]>('permissoes', ctx.getHandler());
  const { user, empresaId } = ctx.switchToHttp().getRequest();
  const perfis = user.empresas.find((e) => e.id === empresaId)?.perfis;
  const has = perfis?.some((p) =>
    p.permissoes.some((perm) => required.includes(perm.codigo)),
  );
  if (!has) throw new ForbiddenException();
  return true;
}
```

**Pontos fortes**: Permissões no JWT (sem DB lookup). Tenant check (multi-tenant).

**Pontos a auditar**:
- Revogação: token válido por 15min mesmo após revogar permissão. Mitigação:
  TTL curto ou blacklist de permissões.
- JWT grande: se carregar **tudo** (empresas+perfis+perms), crescer.

## 6. Validação de entrada

```typescript
// ❌ SQL injection (NÃO use raw com concatenação)
const query = `SELECT * FROM users WHERE email = '${email}'`;

// ✅ Prisma (parametrized)
const user = await this.prisma.usuario.findUnique({ where: { email } });

// ✅ class-validator
class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) senha!: string;
}
```

**No projeto**: ✓ Prisma, ✓ class-validator global.

## 7. CSRF

API REST com **JWT em header `Authorization`** (sem cookie) **não é
vulnerável a CSRF**.

**Mas** se algum dia usar cookies:
- `SameSite=Strict`
- CSRF token (double-submit cookie) para mutações
- Validar `Origin` header

**No projeto**: stateless JWT → **CSRF não é risco** hoje.

## 8. Headers de segurança (Helmet)

```typescript
await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: [`'self'`],
      styleSrc: [`'self'`, `'unsafe-inline'`],     // Swagger
      scriptSrc: [`'self'`, `https:`, `'unsafe-inline'`], // Swagger
    },
  },
});
```

**Verificar**:
- ✓ `X-Content-Type-Options: nosniff`
- ✓ `X-Frame-Options: DENY`
- ✓ `Strict-Transport-Security` (em prod, atrás de proxy)
- ⚠️ `unsafe-inline` no CSP — **avaliar** se Swagger pode ser desabilitado em prod

## 9. Account lockout (gap recomendado)

Após N tentativas de login com senha errada para o mesmo email:

```typescript
// Pseudocódigo
const attempts = await this.cache.get(`login:attempts:${email}`) ?? 0;
if (attempts >= 5) throw new TooManyRequestsException('Conta bloqueada temporariamente');
if (!valid) {
  await this.cache.set(`login:attempts:${email}`, attempts + 1, { ttl: 900 });
  throw new UnauthorizedException();
}
await this.cache.del(`login:attempts:${email}`);
```

**No projeto**: **não implementado**. **Recomendação**: adicionar.

## 10. Bcrypt vs Argon2 (recomendação de evolução)

| Algoritmo | Velocidade | Segurança | Recomendação |
|-----------|-----------|-----------|--------------|
| **bcrypt** | Médio | Bom | Padrão seguro |
| **argon2id** | Rápido (nativo) | Melhor | Preferível em 2026 |
| **scrypt** | Lento | Bom | Menos comum |

**Decisão**: migrar para `argon2id` (mais seguro, mais rápido, mas
requer lib nativa).

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

## 11. Logging de segurança

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

**Gap a fechar**: logar **falhas de login** (atualmente, só sucesso).

## 12. LGPD — pontos práticos

| Item | Como tratar |
|------|-------------|
| **Consentimento** | Termo de uso + opt-in (fora da API) |
| **Finalidade** | Documentar no BDD o uso de cada dado |
| **Necessidade** | Coletar só o que precisa (DTO enxuto) |
| **Acesso** | Endpoint `/me/dados` |
| **Correção** | Endpoint de atualização |
| **Exclusão** | Soft delete + anonimização |
| **Portabilidade** | Endpoint `/me/exportar-dados` (LGPD art. 18) |
| **Segurança** | HTTPS, criptografia em repouso (DB) |
| **Auditoria** | `AuditLog` registra acessos a dados pessoais |
| **DPO** | Canal de contato com DPO (fora da API) |

**Ação recomendada**:
- Adicionar `consentimentoAt` no `Usuario`
- Anonimizar em soft delete (LGPD: "dado não pode mais ser vinculado a pessoa")
- Endpoint `/me/exportar-dados`

## 13. OWASP Top 10 (2021) — checklist

| # | Vulnerabilidade | Mitigação no projeto |
|---|----------------|----------------------|
| **A01** | Broken Access Control | ✓ Auth + RBAC + multi-tenant guard |
| **A02** | Cryptographic Failures | bcrypt para senha, HTTPS em prod |
| **A03** | Injection (SQL, NoSQL) | Prisma (parametrized) + class-validator |
| **A04** | Insecure Design | DDD, BDD, threat modeling |
| **A05** | Security Misconfiguration | Helmet, CORS, validação de env (Joi) |
| **A06** | Vulnerable Components | `npm audit`, Dependabot |
| **A07** | Auth Failures | Refresh rotation (lockout a implementar) |
| **A08** | Software & Data Integrity | Soft delete, audit log, validação DTO |
| **A09** | Security Logging Failures | `pino` + `AuditLog` (login fail a implementar) |
| **A10** | SSRF | Auditar `@nestjs/axios` (whitelist de URL?) |

## 14. Secret management

| Onde | Como |
|------|------|
| `JWT_SECRET` | Env var (Joi), NUNCA hardcoded |
| **Dev** | `.env` (não commitado) |
| **CI** | GitHub Actions Secrets |
| **Prod** | Vault, AWS Secrets Manager |
| **Rotação** | Suportar múltiplos secrets (kid) |

**No projeto**: ✓ Joi valida. ⚠️ Garantir `JWT_SECRET` ≥ 32 bytes (HS256).

## 15. Anti-padrões a vigiar

| ❌ Anti | ✅ Correto |
|---------|-----------|
| `Authorization: Bearer undefined` | Validar que token existe |
| JWT sem `exp` | Sempre `exp` |
| Senha em log | `@Exclude()` + filtrar logs |
| Hardcoded secret | Env var + Vault |
| `try { ... } catch {}` (engolir erro de auth) | Loggar + 401/403 |
| Token em URL (query string) | Sempre em header |
| `Access-Control-Allow-Origin: *` com `credentials: true` | Lista específica |
| `eval()`, `Function()` | Nunca em server-side |
| `res.json(user)` com senha | `@Exclude()` na entidade |
| Loggar PII completo (CPF, RG) | Mascarar ou omitir |

## 16. Auditoria de segurança — checklist trimestral

```text
[ ] npm audit --audit-level=high → zero
[ ] npm outdated → avaliar atualizações
[ ] Review de endpoints (auth/authz/validation)
[ ] Revisão de permissões (princípio do menor privilégio)
[ ] Testes de segurança (XSS, SQLi, IDOR, CSRF, SSRF)
[ ] Penetration testing anual
[ ] Rotação de secrets (90 dias)
[ ] Revisão de logs de segurança
[ ] Backup testado (RPO/RTO)
[ ] Plano de resposta a incidente documentado
```

## 17. Roadmap de segurança

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
   - [ ] Throttler storage em Redis
   - [ ] CSP mais estrito (sem `unsafe-inline` em prod)
   - [ ] Loggar falhas de login
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

## 18. Reference

- [`.agent/docs/13-seguranca-jwt-oauth-throttler.md`](../../docs/13-seguranca-jwt-oauth-throttler.md) — completo
- [`.agent/skills/hexagonal-ports-nestjs/SKILL.md`](../hexagonal-ports-nestjs/SKILL.md) — PasswordHasher é uma porta
- OWASP Top 10 — [owasp.org/Top10](https://owasp.org/www-project-top-ten/)
- OWASP API Security Top 10
- RFC 6749 — OAuth 2.0
- Auth0 JWT Handbook — [auth0.com/resources/jwt](https://auth0.com/resources/jwt)
- LGPD — [gov.br/lgpd](https://www.gov.br/cidadania/pt-br/acesso-a-informacao/lgpd)
- [AGENTS.md §10 — Variáveis de Ambiente](../../../AGENTS.md#10-variáveis-de-ambiente)
- [src/auth/application/services/auth.service.ts](../../../src/auth/application/services/auth.service.ts)
- [src/auth/application/guards/auth.guard.ts](../../../src/auth/application/guards/auth.guard.ts)
- [src/auth/application/guards/permissao.guard.ts](../../../src/auth/application/guards/permissao.guard.ts)
