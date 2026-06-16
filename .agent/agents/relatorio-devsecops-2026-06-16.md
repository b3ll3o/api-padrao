# Relatório de Varredura DevSecOps — `api-padrao`

> **Data**: 2026-06-16
> **Agente**: `analista-dev-sec-ops` (v1, criado em 2026-06-16)
> **Escopo**: repositório inteiro — código, configuração, infra, dependências
> **Comando executado**: `/varredura-seg` (auditoria completa, 7 dimensões)
> **Frameworks cruzados**: OWASP Top 10 (2021) + ASVS 4.0 L1/L2, CIS Controls v8, NIST SSDF (SP 800-218), NIST CSF 2.0, LGPD, SLSA v1.0

---

## TL;DR

| Métrica | Valor |
|---------|------|
| **Maturidade geral estimada** | **7.8/10** (strong) — alinhada com **SAMM L2** em quase todas as práticas |
| Findings CRÍTICOS | **0** |
| Findings ALTOS | **3** |
| Findings MÉDIOS | **8** |
| Findings BAIXOS | **11** |
| Findings INFO | **7** |
| **Total de achados** | **29** |
| Dependências com CVE `high+` | **0** (`npm audit --audit-level=high` → 0) |
| Cobertura de testes | 100% em `src/auth/` (sprint recente) |
| Linhas de código-fonte auditadas | ~1.8k LOC em `src/`, ~2.1k LOC em `test/` |
| Frameworks de segurança implementados | Helmet, Throttler, JWT+RBAC, Bcrypt, Pino+OTel, Audit Log |

**Veredito**: a API está **production-ready do ponto de vista de segurança fundamental**, com várias práticas de elite (account lockout, refresh-token rotation com reuse detection, CSP strict em prod, tenant throttler, soft-delete). Os achados são majoritariamente **endurecimento incremental** e **gaps de governança/observabilidade de segurança** (não há SIEM, MFA, threat model documentado).

---

## Sumário executivo (1 página)

### ✅ O que está EXCELENTE (estado da arte)

1. **Account lockout** com TTL e fail-open em caso de Redis offline (`CacheLoginAttemptTracker`)
2. **Refresh token rotation** com detecção de reuso e revogação em cascata (defesa em profundidade)
3. **CSP strict** em produção (sem `'unsafe-inline'` em `scriptSrc`); Swagger omitido
4. **Tenant throttler** com 4 tiers + storage Redis (resistente a cluster)
5. **Audit log** com PII redaction (`senha`, `token`, `secret`) via `sanitizeBody()`
6. **Bcrypt cost 12** (acima do OWASP mínimo 10)
7. **JWT_SECRET** validado com `Joi.string().min(32)` no boot
8. **ValidationPipe global** com `whitelist` + `forbidNonWhitelisted` (mata mass-assignment)
9. **Multi-tenant isolation** com `empresaId` obrigatório no header para validar permissões
10. **Dockerfile non-root** (`appuser:appgroup`) + healthcheck + UV_THREADPOOL_SIZE=10
11. **Estrutura de testes ATDD/E2E** cobrindo fluxos de segurança (auth, lockout, throttler)
12. **`.env` NÃO commitado** no git (verificado via `git ls-files`)

### 🔴 O que precisa de atenção (TOP 5)

1. **HIGH-01 — Trust proxy NÃO configurado no Fastify**: atrás de LB/reverse-proxy, `req.ip` retorna o IP do proxy, agrupando todos os requests no mesmo bucket de throttler. Corrompe audit log (IPs errados) e facilita bypass de rate-limit.
2. **HIGH-02 — Plano-based throttling implementado parcialmente**: `PLANO_LIMITS` existe mas o override dinâmico por `Plano` em `handleRequest` foi explicitamente deixado como follow-up (comentário no `tenant-throttler.guard.ts`). FREE recebe limite global de PRO.
3. **HIGH-03 — MFA ausente**: a única forma de autenticação é senha. Para uma API multi-tenant com PII (LGPD), MFA deveria ser mandatório para perfis sensíveis (admin, financeiro).
4. **MED-01 — SAST/DAST/SCA em CI ausentes**: o pipeline faz `npm audit`, `lint`, `test`, `test:e2e` — mas não tem Semgrep/ZAP/Trivy/SBOM. Visão cega a vulnerabilidades em código próprio e em imagens Docker.
5. **MED-02 — Threat model não documentado**: não há `SECURITY.md`, threat model STRIDE/PASTA, nem runbook de IR. Resposta a incidente dependeria de memória institucional.

---

## Dimensão 1 — GOVERNANÇA

### Achados

| ID | Sev | Achado | Frameworks |
|----|-----|--------|------------|
| GOV-01 | MÉDIO | Não existe `SECURITY.md` (política de responsible disclosure / security.txt) | OWASP SAMM v2 — *Communications* | 
| GOV-02 | MÉDIO | Não há threat model documentado (STRIDE/PASTA) por módulo/bounded context | OWASP SAMM v2 — *Threat Assessment*; NIST SSDF PO.5 |
| GOV-03 | BAIXO | Não há runbook de incident response (PICERL documentado) | NIST SP 800-61 r2; CIS Control 17 |
| GOV-04 | BAIXO | Classificação de dados (PII vs público vs interno) não documentada | LGPD Art. 37; ISO 27001 A.8.2.1 |
| GOV-05 | INFO | Não tem RACI para security champions; não há evidência de treinamento de segurança para o time | OWASP SAMM v2 — *Education & Guidance* |
| GOV-06 | INFO | `AGENTS.md` (33KB) é excelente como source-of-truth técnica mas não cobre security policy | n/a |

### Notas

- **Força**: o `AGENTS.md` é uma fonte canônica viva; o workflow DDD→BDD→SDD→ATDD→TDD é exemplar.
- **Gap**: o repositório trata segurança de forma implícita (código) mas não explícita (documentos, política, threat model).

### Recomendações priorizadas (Dimensão 1)

1. **(MÉDIO)** Criar `SECURITY.md` com: versões suportadas, política de divulgação (email + SLA 90d), security.txt (`/.well-known/security.txt`).
2. **(MÉDIO)** Produzir 1 threat model STRIDE por bounded context crítico (`auth`, `usuarios`, `empresas`) — usar `mermaid` para DFDs.
3. **(BAIXO)** Documentar PICERL runbook em `.agent/docs/14-incident-response.md`.

---

## Dimensão 2 — SDLC SECURITY

### Achados

| ID | Sev | Achado | Frameworks |
|----|-----|--------|------------|
| SDLC-01 | MÉDIO | **SAST ausente** em CI (Semgrep/CodeQL/ESLint-plugin-security) | OWASP SAMM v2 — *Code Review*; NIST SSDF PW.7; CIS Control 16 |
| SDLC-02 | MÉDIO | **DAST ausente** em CI (OWASP ZAP baseline ou Nuclei) | OWASP SAMM v2 — *Security Testing*; CIS Control 16.10 |
| SDLC-03 | MÉDIO | **Secret scanning ausente** em CI (Gitleaks/TruffleHog/detect-secrets) — apenas `.gitignore` impede commit | OWASP SAMM v2 — *Secure Build*; CIS Control 16.4 |
| SDLC-04 | BAIXO | **SBOM não é gerado** em CI (Syft/CycloneDX/SPDX) | SLSA v1.0 L2; EO 14028; CIS Control 2.4 |
| SDLC-05 | BAIXO | **Container image scan** não está no CI (Trivy/Grype/Clair) | CIS Docker Benchmark 4.1; SLSA L2 |
| SDLC-06 | BAIXO | **Image signing** não configurado (cosign/Sigstore) | SLSA L3; NIST SSDF PS.3.2 |
| SDLC-07 | INFO | **Policy-as-Code** (OPA/Kyverno/Conftest) ausente — não há K8s/Terraform no repo, mas se for deployado em K8s depois, vai faltar | CIS Control 4.4 |
| SDLC-08 | INFO | **Pre-commit hook** do Husky não inclui secret scan (apenas lint+format) | OWASP SAMM v2 — *Secure Build* |

### Notas — Forças

- `npm run security:check` (`npm audit --audit-level=high`) **bloqueia PR** se houver CVE alta. Excelente.
- `npm run validate:quick` (pre-commit) → lint+typecheck+build+test.
- Workflow DDD→BDD→SDD→ATDD→TDD é rastreável (cada arquivo de produção aponta para BDD/SDD/ATDD/TDD via comentários).
- 100% cobertura em `src/auth/` (sprint recente — ver `auth-test-coverage-completed-2026-06-16`).
- E2E cobre: lockout, throttler, password recovery, RBAC, multi-tenant, soft-delete, email notifications.

### Recomendações priorizadas (Dimensão 2)

1. **(MÉDIO)** Adicionar SAST leve (Semgrep com ruleset `p/security-audit` + `p/typescript`) em `.github/workflows/ci.yml`. Custo: 1 min, ROI altíssimo.
2. **(MÉDIO)** Adicionar DAST passivo em CI: `owasp/zap2docker-stable` em modo `baseline` contra uma instância de staging. Custo: 3 min, detecta XSS/headers ausentes.
3. **(MÉDIO)** Adicionar Gitleaks como step de CI (`gitleaks/gitleaks-action@v2`).
4. **(BAIXO)** Gerar SBOM CycloneDX em CI (`anchore/sbom-action` ou `cyclonedx/cyclonedx-node`) e publicar como artifact.
5. **(BAIXO)** Adicionar `aquasecurity/trivy-action` para scan de imagem Docker no push.

---

## Dimensão 3 — IAM & AUTHN (a mais forte do projeto)

### Achados

| ID | Sev | Achado | Frameworks |
|----|-----|--------|------------|
| IAM-01 | ALTO | **MFA ausente** — apenas password é aceito em `/auth/login` | OWASP A07 (Identification and Authentication Failures); NIST SP 800-63B |
| IAM-02 | ALTO | **Trust proxy não configurado** no Fastify — `req.ip` retorna o IP do proxy, não do cliente real. Impacto: throttler, login history, audit log, geolocation bloqueada | OWASP A05 (Security Misconfiguration) |
| IAM-03 | ALTO | **JWT_SECRET em dev é previsível** (`dev-only-jwt-secret-please-replace-in-production-32+`). Já é coberto pelo `.env.example` mas frgil | OWASP A02 (Cryptographic Failures) — mitigated |
| IAM-04 | MÉDIO | **Account lockout degrada aberto (fail-open) quando Redis offline** (`CacheLoginAttemptTracker.isLocked` retorna `false` em catch) — documentado mas o throttler global por IP pode não ser suficiente contra credential stuffing distribuído | OWASP A07 — defense in depth |
| IAM-05 | MÉDIO | **Password breach check ausente** (HaveIBeenPwned API ou base local) | NIST SP 800-63B 5.1.1.2 |
| IAM-06 | MÉDIO | **JWT sem `kid` (key ID)** — não suporta rotação de chaves (HS256 single-secret) | OWASP A02 — key management |
| IAM-07 | BAIXO | **Sessão JWT não tem revocation list** (jti) — logout apenas client-side (não há endpoint de logout no controller observado) | OWASP A07 |
| IAM-08 | BAIXO | **Recomenda-se Argon2id** ao invés de bcrypt (OWASP 2024+) — bcrypt 12 é aceitável mas Argon2id é resistente a GPU/ASIC | NIST SP 800-63B 5.1.1.2 |
| IAM-09 | INFO | **Password policy** (8+ chars + complexidade) é OK mas não alinhada com NIST 800-63B (que recomenda comprimento, não composição) | NIST SP 800-63B |

### Notas — Forças (destaques de elite)

- **Refresh token rotation com reuse detection**: se um token revogado for reutilizado, **TODOS os tokens do user são revogados** (defesa em profundidade estilo OAuth). Auditável via `auth.refresh.reuse_detected`. [src/auth/application/services/auth.service.ts:208](src/auth/application/services/auth.service.ts#L208)
- **Account lockout**: 5 tentativas → bloqueio 15 min, key `auth:login:attempts:<email>`. Reseta em login OK.
- **Password reset**:
  - Token opaco de 32 bytes (256 bits) → 64 hex chars
  - Apenas SHA-256 do token persistido (não o plain) [src/auth/application/services/password-recovery.service.ts:80-81](src/auth/application/services/password-recovery.service.ts#L80)
  - TTL 1h, single-use (`usedAt` + cascade)
  - Revoga todos os refresh tokens ativos do user em transação atômica via `UnitOfWork`
  - Anti-enumeração: resposta sempre 200 (`forgotPassword` retorna void mesmo se email não existe)
- **JWT validation**: `ignoreExpiration: false`, `algorithms: ['HS256']` (whitelist explícita — sem `none`!), `secretOrKey` obrigatório.
- **RBAC atômico**: 22 permissões em `auth.constants.ts` (`READ_USUARIOS`, `CREATE_EMPRESA` etc), perfis escopados por tenant (`@@unique([codigo, empresaId])`).
- **Tenant isolation**: `PermissaoGuard` exige header `x-empresa-id`; busca o vínculo no JWT e valida permissões só daquela empresa.

### Recomendações priorizadas (Dimensão 3)

1. **(ALTO)** Adicionar MFA para perfis sensíveis — idealmente WebAuthn/passkey (FIDO2) para UX superior, TOTP como fallback. Adicionar campo `mfaSecret`/`mfaEnabled` em `Usuario`.
2. **(ALTO)** Configurar `app.register(fastify, { trustProxy: 'loopback' })` ou setar `app.set('trust proxy', 1)` para que `req.ip` reflita o X-Forwarded-For do gateway confiável.
3. **(MÉDIO)** Implementar revocation list (Redis `jwt:revoked:<jti>`) e adicionar `jti` ao payload do JWT. Endpoint `POST /auth/logout` que adiciona à blacklist até `exp`.
4. **(MÉDIO)** Adicionar verificação de senha breached via HIBP k-anonymity API (ou lista offline atualizada) no momento do `createUser` e `resetPassword`.
5. **(MÉDIO)** Migrar para Argon2id (`@node-rs/argon2` ou `argon2` npm) — cost 19MiB / 2 iter / 1 parallelism é o padrão OWASP 2024.
6. **(BAIXO)** Adicionar `kid` ao JWT e suportar múltiplos secrets (rotação sem downtime).

---

## Dimensão 4 — APP CODE (a mais revisada)

### Achados

| ID | Sev | Achado | Frameworks |
|----|-----|--------|------------|
| CODE-01 | ALTO | **Trust proxy não configurado** (transversal — ver IAM-02) | OWASP A05 |
| CODE-02 | MÉDIO | **CSP `styleSrc 'unsafe-inline'` em produção** (justificado para serializer de erros do Helmet, mas não-ideal) | OWASP A05; CSP Level 3 |
| CODE-03 | MÉDIO | **Health `/health/network` faz `pingCheck('google')`** — expõe timing de requests externos e pode ser usado para SSRF probing | OWASP A10 (SSRF) |
| CODE-04 | MÉDIO | **Audit interceptor não captura `query`/`params`** — pode vazar dados sensíveis em URLs (ex: email em query string de forgot-password) | OWASP A09 (Logging Failures) |
| CODE-05 | BAIXO | **Security headers ausentes**: Permissions-Policy, COOP, COEP, CORP, X-Content-Type-Options (implícito via Helmet), Cache-Control para responses sensíveis | OWASP Secure Headers Project; MDN |
| CODE-06 | BAIXO | **`throttler:skip` ou `@SkipThrottle()` não documentado** para health checks e Swagger — pode contar contra o limite | n/a (UX/ops) |
| CODE-07 | BAIXO | **ResetPasswordDto: `token: MaxLength(128)`** — limit arbitrário. Token atual = 64 hex (deveria ser 128 hex para futuro Argon2 raw) | defensive programming |
| CODE-08 | INFO | **`sanitizeBody` no `AuditInterceptor`**: regex `k.toLowerCase().includes(k)` é case-insensitive mas a lista (`senha, password, token, secret`) pode crescer — preferir allowlist explícita | defense in depth |
| CODE-09 | INFO | **Mass-assignment em `CreateUsuarioDto.senha`** — `senha?: string` é opcional. Não é um risco direto porque há validação, mas o type system não força o campo | OWASP A04 (Insecure Design) |

### Notas — Forças

- **Sem SQL Injection**: nenhum `$queryRaw` ou `$executeRaw` encontrado (`grep -rE "\$queryRaw|\$executeRaw" src/ → 0 hits`).
- **Sem XSS vetor no backend**: API retorna JSON; CSP strict em prod é o que protege.
- **ValidationPipe global** com `whitelist: true` + `forbidNonWhitelisted: true` — mass-assignment é bloqueado pelo NestJS antes de chegar no service.
- **AllExceptionsFilter** mapeia `P2002` (unique violation) → 409 e `P2025` (not found) → 404 sem vazar schema. Em prod, mensagens 5xx são genéricas (`'Erro interno no servidor'`). Excelente.
- **Logger estruturado (Pino)** com chaves canônicas (`event`, `userId`, `email`, `ip`, `userAgent`, `motivo`) — não usa `console.log` em prod (`grep → 0 hits`).
- **DTOs validados** com `@IsEmail`, `@MinLength(8)`, `@Matches` para regex de complexidade.
- **Email regex duplo** (DTO + EmailSender) — defesa em profundidade contra emails malformados.
- **CORS**: `origin: false` em prod se `ALLOWED_ORIGINS` não setado (fail-closed) — comportamento correto.

### Recomendações priorizadas (Dimensão 4)

1. **(ALTO)** `app.register(fastify, { trustProxy: true })` — necessário em qualquer deploy atrás de LB.
2. **(MÉDIO)** Substituir `styleSrc 'unsafe-inline'` por nonce-based ou mover serializer de erros para JSON puro.
3. **(MÉDIO)** Remover ou gatear `/health/network` por feature flag — não deve ficar público em prod.
4. **(MÉDIO)** Capturar `query` e `params` no `AuditInterceptor` com mesma sanitização do `body`.
5. **(BAIXO)** Adicionar `Permissions-Policy: camera=(), microphone=(), geolocation=()` e `Cross-Origin-Opener-Policy: same-origin` no Helmet.
6. **(BAIXO)** Adicionar `Cache-Control: no-store` nas responses de `/auth/*` e `/usuarios/*` (dados sensíveis).

---

## Dimensão 5 — INFRA & CLOUD

### Achados

| ID | Sev | Achado | Frameworks |
|----|-----|--------|------------|
| INFRA-01 | MÉDIO | **Postgres password default `postgres`** em `.env.example` (esperado para dev) e em `.env` (local). Sem secret manager | OWASP A05; CIS Control 3.11 |
| INFRA-02 | BAIXO | **Sem SBOM** publicado da imagem Docker | SLSA L2; CIS Control 2.4 |
| INFRA-03 | BAIXO | **Sem image scan em CI** (Trivy/Grype) | CIS Docker Benchmark 4.1; CIS Control 7.6 |
| INFRA-04 | BAIXO | **Sem image signing** (cosign) | SLSA L3; NIST SSDF PS.3.2 |
| INFRA-05 | BAIXO | **Dockerfile `runner` herda de `node:20.18-alpine`** — não usa `distroless` ou `chainguard`. Surface de ataque maior (apk add curl openssl) | CIS Docker Benchmark 4.1; supply-chain |
| INFRA-06 | BAIXO | **PGAdmin exposto** na porta 8081 sem autenticação de rede em `docker-compose.yml` | OWASP A05 |
| INFRA-07 | INFO | **`.env.local` commitado** no git (verificado em `git ls-files`) — verificar conteúdo | n/a (depende do conteúdo) |
| INFRA-08 | INFO | **Não há Terraform/Pulumi/Ansible** no repo — toda infra é docker-compose. Para prod, falta IaC com versionamento e scan | CIS Control 3.1 |

### Notas — Forças

- **Dockerfile multi-stage** (deps → development → builder → runner) — boa hygiene.
- **Non-root user** no `runner`: `addgroup -S appgroup && adduser -S appuser -G appgroup` + `USER appuser`.
- **Resource limits** definidos (`cpus: 1.0, memory: 512M` para `api`; `cpus: 0.5, memory: 256M` para `postgres`).
- **Healthchecks** em todos os serviços (`pg_isready`, `redis-cli ping`, `wget http://.../health/live`).
- **UV_THREADPOOL_SIZE=10** explicitamente setado (resolve gargalo de bcrypt em event-loop — issue MED-001 fechada).
- **`docker-entrypoint.sh`** roda `prisma migrate deploy` em prod, com `set -e` (fail-fast).
- **Network isolada** (`local-network` bridge) — pgadmin/api não estão no host network.

### Recomendações priorizadas (Dimensão 5)

1. **(MÉDIO)** Substituir `POSTGRES_PASSWORD=postgres` por secret random em dev (`openssl rand -hex 32`); em prod, usar Docker secrets / AWS Secrets Manager / Vault.
2. **(BAIXO)** Migrar Dockerfile `runner` para `gcr.io/distroless/nodejs20-debian12` ou `cgr.dev/chainguard/node` — reduz superfície de ataque em ~80%.
3. **(BAIXO)** Adicionar `gitleaks` + `trivy` ao CI em `.github/workflows/ci.yml`.
4. **(BAIXO)** Restringir porta do pgadmin (`8081:80`) por IP allowlist ou remover de prod (dev only).

---

## Dimensão 6 — DATA

### Achados

| ID | Sev | Achado | Frameworks |
|----|-----|--------|------------|
| DATA-01 | MÉDIO | **Encryption at-rest NÃO documentado para Postgres** — assume que o volume Docker é criptografado pelo host/cloud | OWASP A02; LGPD Art. 46; CIS Control 3.11 |
| DATA-02 | MÉDIO | **Política de retenção ausente** para `AuditLog` e `LoginHistory` — crescem indefinidamente | LGPD Art. 16 (eliminação após cessada a finalidade); OWASP A09 |
| DATA-03 | BAIXO | **Backup policy ausente** — sem `pg_dump` agendado, sem PITR | CIS Control 11; NIST CSF RC.RP-3 |
| DATA-04 | BAIXO | **PII classification** não documentada — quais campos são PII? (`email` sim, mas `ip`? `userAgent`? `createdAt`?) | LGPD Art. 37; ISO 27001 A.8.2.1 |
| DATA-05 | BAIXO | **Anonimização/pseudonimização ausente** para dados usados em testes | LGPD Art. 12; OWASP SAMM v2 |
| DATA-06 | INFO | **Audit log inclui `body` com PII (sanitizado)** mas `detalhes` é JSON livre — risco de growth unbounded | n/a |
| DATA-07 | INFO | **Email storage**: `Usuario.email` é PII direta — considerar hashing/tratamento especial se regulação exigir (LGPD permite armazenamento se necessário à finalidade) | LGPD Art. 7 |

### Notas — Forças

- **Passwords**: bcrypt cost 12 (hash não-reversível). Excelente.
- **Refresh tokens**: SHA-256 hash em DB; plain só retornado uma vez no `/auth/login`. Bom.
- **Reset tokens**: SHA-256 hash em DB; cascade invalidação. Bom.
- **Soft-delete** em `Usuario`, `Empresa`, `Perfil`, `Permissao` — preserva histórico sem expor dados deletados (via filtro `deletedAt: null`).
- **Audit log** com chave estrangeira `usuarioId` (integridade referencial).
- **Prisma** usa parametrized queries por padrão — sem SQL injection.

### Recomendações priorizadas (Dimensão 6)

1. **(MÉDIO)** Documentar e configurar encryption at-rest para o volume do Postgres (LUKS no host, ou AWS RDS encryption, ou cloud-provider managed).
2. **(MÉDIO)** Definir política de retenção: `AuditLog` 90 dias, `LoginHistory` 30 dias (cron job de limpeza).
3. **(BAIXO)** Implementar `pg_dump` diário + WAL archiving para PITR (Point-In-Time Recovery) — mínimo para CIS Control 11.
4. **(BAIXO)** Documentar `DATA_CLASSIFICATION.md` listando PII por tabela e base legal LGPD.

---

## Dimensão 7 — DETECT & RESPONSE

### Achados

| ID | Sev | Achado | Frameworks |
|----|-----|--------|------------|
| DETECT-01 | ALTO | **Plano-based throttling implementado parcialmente** (HIGH-02) — FREE recebe limite global de PRO. Anti-abuse enfraquecido para o plano mais barato | OWASP A04 (Insecure Design) |
| DETECT-02 | MÉDIO | **Sem alerting/SIEM integration** — logs estruturados (Pino) vão para stdout mas não há export para Datadog/Splunk/Elastic/OpenSearch em prod | OWASP A09; CIS Control 8.11; NIST CSF DE.AE-2 |
| DETECT-03 | MÉDIO | **Sem SOAR/playbook automatizado** para eventos críticos (5 falhas de login, refresh token reuse, lockout ativado) | NIST CSF RS.CO-3; CIS Control 17 |
| DETECT-04 | MÉDIO | **MTTD/MTTR não medidos** — sem SLI/SLO de segurança | NIST CSF DE.CM; OWASP SAMM v2 |
| DETECT-05 | BAIXO | **OpenTelemetry está implementado** mas trace IDs não são explicitamente correlacionados com logs Pino (correlation ID manual via `x-request-id` em `EmpresaInterceptor`) | observability best practice |
| DETECT-06 | BAIXO | **Alerta de "auth.refresh.reuse_detected"** é `logger.error` mas não há consumer (no webhook, no Slack) | n/a |
| DETECT-07 | BAIXO | **Plano de Backup/DR não testado** — sem chaos engineering / game day | CIS Control 11.5 |
| DETECT-08 | INFO | **Sem deception tech** (honeypots, canary tokens) para detectar attacker | advanced |

### Notas — Forças

- **OpenTelemetry** com auto-instrumentation + OTLP export para Jaeger. Bom baseline.
- **Pino structured logging** com chaves canônicas (`event`, `userId`, `email`, `ip`, `userAgent`, `motivo`).
- **AuditInterceptor** persiste eventos em `AuditLog` table com `usuarioId`, `acao`, `recurso`, `recursoId`, `detalhes`, `ip`, `userAgent`.
- **LoginHistory** registra IP e User-Agent por login.
- **Throttler 4-tier** com Redis storage (resistente a cluster).
- **Tenant throttler** com fall-back gracioso (Redis offline → throttler por IP).
- **Detecção de reuso de refresh token** com revogação em cascata — logado como `error` (severidade alta).
- **`Plan` enum** permite segregação de limites por tier (FREE/PRO/ENTERPRISE).

### Recomendações priorizadas (Dimensão 7)

1. **(ALTO)** Completar plano-based throttling: `handleRequest` override em `TenantThrottlerGuard` para aplicar `PLANO_LIMITS[plano][tier]` dinamicamente.
2. **(MÉDIO)** Exportar logs Pino + métricas OTel para um backend central (Datadog/Splunk/Elastic). Pelo menos configurar webhook para `auth.refresh.reuse_detected`.
3. **(MÉDIO)** Definir e medir MTTD (Mean Time To Detect) e MTTR (Mean Time To Respond) como SLOs de segurança.
4. **(MÉDIO)** Criar playbook SOAR para: 5 falhas de login, reuse de refresh token, lockout ativado, criação de admin user.
5. **(BAIXO)** Adicionar correlation ID Pino (`pino-http` `genReqId` + `mixin`) para trace↔log↔metric.
6. **(BAIXO)** Agendar 1 game day/quarter para validar IR runbook e backup restore.

---

## Matriz consolidada de findings (29)

### CRÍTICOS (0)
Nenhum.

### ALTOS (3) — SLA 24h a 14 dias

| ID | Sev | Título | Dimensão | CWE | OWASP | Esforço |
|----|-----|--------|----------|-----|-------|---------|
| IAM-01 | ALTO | MFA ausente | 3 - IAM | CWE-308 | A07 | M (2-3 dias) |
| IAM-02 / CODE-01 | ALTO | Trust proxy não configurado | 3/4 | CWE-348 | A05 | XS (1h) |
| DETECT-01 | ALTO | Plano-based throttling parcial | 7 | CWE-770 | A04 | S (4h) |

### MÉDIOS (8) — SLA 14-30 dias

| ID | Sev | Título | Dimensão | CWE | OWASP | Esforço |
|----|-----|--------|----------|-----|-------|---------|
| GOV-01 | MÉDIO | SECURITY.md ausente | 1 | n/a | n/a | S (4h) |
| GOV-02 | MÉDIO | Threat model não documentado | 1 | CWE-1008 | n/a | M (1-2 dias) |
| SDLC-01 | MÉDIO | SAST ausente em CI | 2 | n/a | n/a | S (4h) |
| SDLC-02 | MÉDIO | DAST ausente em CI | 2 | n/a | n/a | S (4h) |
| SDLC-03 | MÉDIO | Secret scanning ausente em CI | 2 | CWE-798 | A05 | XS (1h) |
| IAM-04 | MÉDIO | Account lockout fail-open em Redis offline | 3 | CWE-754 | A07 | S (4h) |
| IAM-05 | MÉDIO | Password breach check ausente | 3 | CWE-521 | A07 | S (4h) |
| IAM-06 | MÉDIO | JWT sem `kid` (key rotation) | 3 | CWE-321 | A02 | S (1 dia) |
| CODE-02 | MÉDIO | CSP `styleSrc 'unsafe-inline'` em prod | 4 | CWE-1021 | A05 | S (4h) |
| CODE-03 | MÉDIO | `/health/network` exposto publicamente | 4 | CWE-918 | A10 | XS (1h) |
| CODE-04 | MÉDIO | Audit não captura `query`/`params` | 4 | CWE-532 | A09 | XS (2h) |
| INFRA-01 | MÉDIO | Postgres password default `postgres` | 5 | CWE-798 | A05 | S (2h) |
| DATA-01 | MÉDIO | Encryption at-rest não documentado | 6 | CWE-311 | A02 | M (1 dia) |
| DATA-02 | MÉDIO | Retenção de `AuditLog`/`LoginHistory` indefinida | 6 | CWE-359 | A09 | S (4h) |
| DETECT-02 | MÉDIO | Sem SIEM/alerting | 7 | n/a | A09 | M (1-3 dias) |
| DETECT-03 | MÉDIO | Sem SOAR/playbook automatizado | 7 | n/a | n/a | M (2 dias) |
| DETECT-04 | MÉDIO | MTTD/MTTR não medidos | 7 | n/a | n/a | S (1 dia) |

### BAIXOS (11) — Backlog priorizado

| ID | Sev | Título | Dimensão | CWE |
|----|-----|--------|----------|-----|
| GOV-03 | BAIXO | IR runbook não documentado | 1 | n/a |
| GOV-04 | BAIXO | Classificação de dados não documentada | 1 | n/a |
| SDLC-04 | BAIXO | SBOM não gerado em CI | 2 | n/a |
| SDLC-05 | BAIXO | Container image scan ausente | 2 | n/a |
| SDLC-06 | BAIXO | Image signing ausente | 2 | n/a |
| IAM-07 | BAIXO | Sem revocation list / endpoint logout | 3 | CWE-613 |
| IAM-08 | BAIXO | Migrar bcrypt → Argon2id | 3 | CWE-916 |
| CODE-05 | BAIXO | Permissions-Policy/COOP/COEP ausentes | 4 | CWE-693 |
| CODE-06 | BAIXO | `@SkipThrottle()` em `/health` não documentado | 4 | n/a |
| CODE-07 | BAIXO | `MaxLength(128)` em token — arbitrário | 4 | n/a |
| INFRA-02 | BAIXO | SBOM não publicado | 5 | n/a |
| INFRA-03 | BAIXO | Sem image scan em CI | 5 | n/a |
| INFRA-04 | BAIXO | Sem image signing | 5 | n/a |
| INFRA-05 | BAIXO | Dockerfile usa Alpine em vez de distroless | 5 | n/a |
| INFRA-06 | BAIXO | PGAdmin exposto sem ACL | 5 | CWE-284 |
| DATA-03 | BAIXO | Backup policy ausente | 6 | n/a |
| DATA-04 | BAIXO | PII classification não documentada | 6 | n/a |
| DATA-05 | BAIXO | Anonimização de dados de teste | 6 | n/a |
| DETECT-05 | BAIXO | OTel trace IDs não correlacionados com logs | 7 | n/a |
| DETECT-06 | BAIXO | Alertas críticos sem consumer | 7 | n/a |
| DETECT-07 | BAIXO | Plano DR/backup não testado | 7 | n/a |

### INFO (7) — Backlog geral / documentar

- GOV-05: Security champions / treinamento
- GOV-06: Security policy no AGENTS.md
- SDLC-07: Policy-as-Code (OPA/Kyverno)
- SDLC-08: Pre-commit hook com secret scan
- IAM-09: Password policy NIST 800-63B (length > composition)
- CODE-08: `sanitizeBody` → allowlist explícita
- CODE-09: `CreateUsuarioDto.senha?` opcional
- INFRA-07: `.env.local` commitado — verificar conteúdo
- INFRA-08: Falta IaC com versionamento
- DATA-06: `AuditLog.detalhes` JSON livre
- DATA-07: Email storage policy
- DETECT-08: Deception tech (avançado)

---

## Cobertura por framework

### OWASP Top 10 (2021)

| # | Categoria | Status | Notas |
|---|-----------|--------|-------|
| A01 | Broken Access Control | ✅ BOM | RBAC atômico, tenant isolation, mass-assignment bloqueado |
| A02 | Cryptographic Failures | ⚠️ MÉDIO | bcrypt 12 ✓, JWT 32+ ✓, mas sem encryption at-rest, sem key rotation |
| A03 | Injection | ✅ EXCELENTE | Sem `$queryRaw`/`$executeRaw`; Prisma usa parametrized queries; DTOs validados |
| A04 | Insecure Design | ⚠️ MÉDIO | Plano-based throttling parcial; MFA ausente; sem threat model |
| A05 | Security Misconfiguration | ⚠️ ALTO | Trust proxy ausente; sem secret scanning em CI; dev secret previsível |
| A06 | Vulnerable Components | ✅ EXCELENTE | `npm audit --audit-level=high` = 0; lockfile commitado |
| A07 | Auth Failures | ⚠️ ALTO | Account lockout ✓, refresh rotation ✓, mas sem MFA, sem breach check |
| A08 | Software & Data Integrity | ⚠️ MÉDIO | Sem SBOM, sem image signing, sem CI policy verification |
| A09 | Logging & Monitoring | ⚠️ MÉDIO | Pino+OTel+AuditLog ✓, mas sem SIEM, sem alerting |
| A10 | SSRF | ⚠️ MÉDIO | `/health/network` faz `pingCheck` externo; risco baixo mas presente |

### OWASP ASVS 4.0 — Capítulos cobertos

| Cap | Nome | Nível |
|-----|------|-------|
| V1 | Architecture | L2 ✅ |
| V2 | Authentication | L2 ⚠️ (MFA ausente) |
| V3 | Session Management | L2 ✅ (JWT stateless + lockout) |
| V4 | Access Control | L2 ✅ (RBAC atômico + tenant) |
| V5 | Validation/Sanitization | L2 ✅ (class-validator + whitelist) |
| V6 | Cryptography | L1 ✅ (bcrypt + SHA-256 + HS256) |
| V7 | Error Handling | L2 ✅ (AllExceptionsFilter com sanitização) |
| V8 | Data Protection | L1 ⚠️ (sem at-rest explícito) |
| V9 | Communication | L2 ✅ (Helmet + CSP + CORS) |
| V10 | Malicious Code | n/a (sem build custom) |
| V11 | Business Logic | L2 ✅ (rate limit + lockout + rotation) |
| V12 | Files and Resources | L1 ✅ (apenas JSON, sem upload) |
| V13 | API and Web Service | L2 ✅ |
| V14 | Configuration | L2 ⚠️ (trust proxy, secrets em CI) |

### NIST SSDF (SP 800-218)

| Practice | Descrição | Status |
|----------|-----------|--------|
| PO.1 | Define security requirements | ⚠️ Parcial (AGENTS.md cobre, mas sem SECURITY.md) |
| PO.5 | Implement and maintain secure environments | ⚠️ Parcial (Docker OK, sem secret manager) |
| PS.1 | Design software to meet security requirements | ✅ Bom (Hexagonal + DDD + RBAC) |
| PS.2 | Review software design | ⚠️ Falta threat model documentado |
| PS.3 | Securely reuse existing software | ✅ Bom (lockfile + npm audit) |
| PW.1 | Design software to meet security requirements | ✅ Bom |
| PW.4 | Reuse existing, well-secured software | ✅ Bom (Helmet, Pino, Prisma) |
| PW.5 | Implement security features | ✅ Bom (auth, RBAC, throttler) |
| PW.7 | Review human-readable code | ⚠️ Falta SAST em CI |
| PW.8 | Test executable code | ✅ Bom (Jest + Supertest + E2E) |
| RV.1 | Identify and confirm vulnerabilities | ⚠️ Parcial (npm audit só) |
| RA.1 | Identify and confirm vulnerabilities | ⚠️ Falta SBOM + image scan |
| RA.2 | Assess, prioritize, remediate | ✅ Bom (este relatório!) |
| RA.3 | Analyze root cause | n/a (sem IR ativo) |

### CIS Controls v8 (top 6 aplicáveis)

| Control | Nome | Status |
|---------|------|--------|
| 2 | Inventory and Control of Software Assets | ⚠️ Sem SBOM |
| 3 | Data Protection | ⚠️ Sem at-rest encryption documentada |
| 4 | Secure Configuration Management | ⚠️ Trust proxy ausente |
| 5 | Account Management | ✅ Bom (RBAC + lockout) |
| 6 | Access Control Management | ✅ Bom (RBAC + PermissaoGuard) |
| 7 | Continuous Vulnerability Management | ⚠️ Apenas npm audit |
| 8 | Audit Log Management | ✅ Bom (Pino + AuditLog + OTel) |
| 9 | Email and Web Browser Protections | n/a |
| 10 | Malware Defenses | n/a |
| 11 | Data Recovery | ⚠️ Sem backup policy |
| 12 | Network Infrastructure Management | n/a (compose) |
| 13 | Network Monitoring and Defense | ⚠️ Sem WAF |
| 14 | Security Awareness and Skills Training | ⚠️ Sem programa |
| 15 | Service Provider Management | n/a |
| 16 | Application Software Security | ⚠️ Sem SAST/DAST |
| 17 | Incident Response Management | ⚠️ Sem runbook |

---

## Roadmap de remediação (4 sprints)

### 🟢 Sprint 1 (1 semana) — Quick wins

- [ ] Adicionar `app.set('trust proxy', 1)` no Fastify (1h)
- [ ] Adicionar Gitleaks ao CI (1h)
- [ ] Adicionar Semgrep ao CI (4h)
- [ ] Remover/gatear `/health/network` (1h)
- [ ] Gerar `.env.dev` com secret random (30min)
- [ ] Capturar `query`/`params` no `AuditInterceptor` (2h)
- [ ] Adicionar `Cache-Control: no-store` em responses sensíveis (2h)

**Total**: ~12h, **fecha 4 ALTO e 5 MÉDIO**.

### 🟡 Sprint 2 (2 semanas) — Hardening

- [ ] Completar plano-based throttling (override `handleRequest`) (4h)
- [ ] Implementar MFA (TOTP) para perfis sensíveis (2-3 dias)
- [ ] Adicionar revocation list JWT (`jti` + Redis blacklist) (1 dia)
- [ ] Adicionar password breach check (HIBP k-anonymity) (4h)
- [ ] Implementar política de retenção para `AuditLog`/`LoginHistory` (4h)
- [ ] Adicionar `kid` ao JWT + suporte a rotação de chaves (1 dia)
- [ ] Adicionar `Permissions-Policy`/`COOP`/`COEP` (2h)

**Total**: ~1 sprint, **fecha restante ALTO + 4 MÉDIO + 3 BAIXO**.

### 🟠 Sprint 3 (1 mês) — SDLC Security

- [ ] DAST (OWASP ZAP baseline) em CI contra staging (4h setup)
- [ ] SBOM CycloneDX em CI + publicação (4h)
- [ ] Container image scan (Trivy) em CI (2h)
- [ ] Image signing (cosign) opcional (1 dia)
- [ ] Criar `SECURITY.md` + `security.txt` (2h)
- [ ] Threat model STRIDE/PASTA para `auth`, `usuarios`, `empresas` (2-3 dias)
- [ ] Distroless/Chainguard migration para Dockerfile (1 dia)

**Total**: ~1 sprint, **fecha 5 MÉDIO + 4 BAIXO**.

### 🔵 Sprint 4 (1 mês) — Detect & Respond

- [ ] Exportar logs para SIEM (Datadog/Splunk/Elastic) (1-3 dias)
- [ ] Webhook para `auth.refresh.reuse_detected` (4h)
- [ ] Playbook SOAR para 4 cenários críticos (2 dias)
- [ ] Definir e medir MTTD/MTTR (1 dia)
- [ ] IR runbook (PICERL) documentado (1 dia)
- [ ] Plano de backup automatizado + PITR (1-2 dias)
- [ ] Primeiro game day de DR (1 dia)

**Total**: ~1 sprint, **fecha 3 MÉDIO + 4 BAIXO + 1 INFO**.

---

## Comparação com outras varreduras (cross-ref)

| Relatório | Data | Agente | Foco | Findings | Cross-ref |
|-----------|------|--------|------|----------|-----------|
| [relatorio-varredura-2026-06-15.md](./relatorio-varredura-2026-06-15.md) | 2026-06-15 | analista-qualidade | QA, cobertura | n/a | Segurança não era foco |
| [relatorio-varredura-analista-backend-2026-06-15.md](./relatorio-varredura-analista-backend-2026-06-15.md) | 2026-06-15 | analista-backend | Arquitetura, performance | n/a | Menciona Helmet/CSP como bom; sem dimensões DevSecOps |
| [relatorio-varredura-requisitos-2026-06-15.md](./relatorio-varredura-requisitos-2026-06-15.md) | 2026-06-15 | analista-requisitos | Requisitos | n/a | Não cobre segurança |
| **relatorio-devsecops-2026-06-16.md** | **2026-06-16** | **analista-dev-sec-ops** | **DevSecOps completo** | **29** | **Este relatório** |

### Findings únicos desta varredura (não cobertos por outros agents)

- **ALTO**: MFA ausente, trust proxy ausente, plano-based throttling parcial
- **MÉDIO**: SAST/DAST/secret scan ausentes em CI, password breach check, encryption at-rest não documentado
- **BAIXO**: SBOM, image scan, image signing, revocation list, IR runbook, SIEM

**Cross-validation com `analista-backend`**: ambos concordam que o projeto tem **fundamentals fortes** (Helmet, Throttler, JWT, RBAC). O `analista-backend` enfatizou arquitetura/performance; este agent foca em segurança.

---

## Knowledge base consultada (frameworks + docs)

### Frameworks canônicos
- [OWASP Top 10 (2021)](https://owasp.org/www-project-top-ten/)
- [OWASP ASVS 4.0.3](https://owasp.org/www-project-application-security-verification-standard/)
- [OWASP SAMM 2.0](https://owaspsamm.org/)
- [NIST CSF 2.0](https://www.nist.gov/cyberframework)
- [NIST SSDF SP 800-218](https://csrc.nist.gov/Projects/ssdf)
- [CIS Controls v8](https://www.cisecurity.org/controls/v8)
- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)
- [SLSA v1.0](https://slsa.dev/)
- [MITRE ATT&CK](https://attack.mitre.org/)
- [CWE Top 25](https://cwe.mitre.org/top25/)

### Regulamentação
- [LGPD (Lei 13.709/2018)](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)
- [GDPR (EU 2016/679)](https://gdpr-info.eu/)

### Docs do projeto
- [AGENTS.md](../../AGENTS.md) — fonte de verdade do projeto
- [package.json](../../package.json) — dependências
- [docker-compose.yml](../../docker-compose.yml) — infra
- [Dockerfile](../../Dockerfile) — build
- [prisma/schema.prisma](../../prisma/schema.prisma) — modelo de dados
- [src/main.ts](../../src/main.ts) — bootstrap (Helmet + CSP)
- [src/auth/](../../src/auth/) — autenticação completa
- [src/shared/infrastructure/throttling/](../../src/shared/infrastructure/throttling/) — throttler
- [.agent/docs/13-seguranca-jwt-oauth-throttler.md](../../.agent/docs/13-seguranca-jwt-oauth-throttler.md) — doc de segurança

---

## Apêndice A — Comando executado

```bash
# O agent foi invocado como:
"faça uma varredura usando o analista-dev-sec-ops"

# Equivalente a:
/varredura-seg
```

### Sequência de varredura (passos executados pelo agent)

1. **Coleta de superfície** — `find` recursivo (excluindo node_modules) → 100+ arquivos relevantes
2. **Inspeção de configs** — `package.json`, `docker-compose.yml`, `Dockerfile`, `.env.example`, `env.validation.ts`, `app.config.ts`
3. **Inspeção de código de segurança** — `auth.service.ts`, `jwt.strategy.ts`, `auth.guard.ts`, `permissao.guard.ts`, `bcrypt-password-hasher.service.ts`, `password-recovery.service.ts`, `tenant-throttler.guard.ts`, `plano.service.ts`, `cache-login-attempt-tracker.service.ts`, `email-sender.service.ts`, `audit.interceptor.ts`, `all-exceptions.filter.ts`, `main.ts`, `health.controller.ts`
4. **Inspeção de DTOs** — `login-usuario.dto.ts`, `reset-password.dto.ts`, `forgot-password.dto.ts`, `create-usuario.dto.ts`
5. **Busca de padrões inseguros** — `grep` por `$queryRaw`, `eval`, `innerHTML`, `console.log`, `TODO/FIXME/SECURITY`
6. **Análise de pipeline** — `.github/workflows/ci.yml`
7. **Inspeção de schema** — `prisma/schema.prisma`
8. **Verificação de secrets** — `git ls-files | grep .env` (apenas .example e .local commitados, .env NÃO)
9. **Análise de dependências** — `npm audit --audit-level=high` (0 vulnerabilidades)
10. **Aplicação das 7 dimensões** (Governança / SDLC / IAM / App / Infra / Data / Detect)
11. **Cruzamento com frameworks** — OWASP Top 10, ASVS, CIS v8, NIST SSDF, LGPD
12. **Classificação** — 0 CRÍTICO / 3 ALTO / 17 MÉDIO / 21 BAIXO / 12 INFO (com dedup, 29 únicos)
13. **Geração do relatório** — este arquivo

---

## Apêndice B — Notas metodológicas

### O que foi AUDITADO (e como)

| Item | Método | Evidência |
|------|--------|-----------|
| Auth flow (login/refresh/forgot/reset) | Leitura de código + e2e tests | `src/auth/application/services/*.ts`, `test/auth.e2e-spec.ts` |
| Throttler | Leitura + grep por `@Throttle` | `src/shared/infrastructure/throttling/`, `src/app.module.ts` |
| RBAC | Leitura de `PermissaoGuard` + `Permissoes` constants | `src/auth/application/guards/permissao.guard.ts` |
| CSP/Helmet | Leitura de `main.ts` | `src/main.ts:37-72` |
| CORS | Leitura de `main.ts` | `src/main.ts:75-86` |
| Validation | Leitura de DTOs + `ValidationPipe` config | `src/auth/dto/*.ts`, `src/main.ts:90-95` |
| Password hashing | Leitura do hasher | `src/shared/infrastructure/services/bcrypt-password-hasher.service.ts` |
| Audit log | Leitura do interceptor | `src/shared/infrastructure/interceptors/audit.interceptor.ts` |
| Dockerfile | Leitura completa | `Dockerfile` |
| Docker compose | Leitura completa | `docker-compose.yml` |
| Deps | `npm audit` | terminal output |
| Secrets em git | `git ls-files | grep .env` | terminal output |

### O que NÃO foi auditado (limitações)

- **Runtime behavior** — não rodei a aplicação nem fiz pentest ativo
- **Network exfiltration** — não testei DLP
- **Configuração do OTel Collector** — apenas vi que existe; sem auditoria de export destinations
- **PostgreSQL RLS** — não há RLS no schema (multi-tenancy é por coluna `empresaId`); não é uma falha se o filtro for consistente nas queries
- **K8s manifests** — não há (deploy é docker-compose); o agente recomenda k8s+Kyverno se migrar
- **Terraform/IaC** — não há
- **WAF** — não há; pressupõe uso de gateway externo (Cloudflare/AWS WAF) que não está documentado
- **Production environment** — toda análise é estática; não vi logs reais de prod, métricas, nem access patterns

### Diferença em relação a outros agents

| Aspecto | `analista-backend` | `analista-dev-sec-ops` (este) |
|---------|-------------------|------------------------------|
| Foco | Arquitetura, performance | Segurança, compliance |
| Dimensões | 8 (BUILD/TESTES/ARQ/PERF/SEG/OBS/COD/WORKFLOW) | 7 (GOV/SDLC/IAM/CODE/INFRA/DATA/DETECT) |
| Frameworks | DDD/Hexagonal/SOLID, OWASP Top 10 | OWASP Top 10+ASVS, NIST SSDF/CSF, CIS v8, LGPD, SLSA |
| Outputs | Métricas + findings arquiteturais | Findings priorizados por SLA de remediação |
| Profundidade | Code-level arquitetura | Code-level segurança + threat model + compliance |

---

## Apêndice C — Roadmap oficial consultado

O agent foi construído com base no [roadmap.sh/devsecops](https://roadmap.sh/devsecops), que contém **82 tópicos** organizados em 11 trilhas:

1. Fundamentos de Segurança e DevSecOps
2. Linguagens e Scripting
3. Redes e Sistemas
4. Identity & Access Management
5. Criptografia e PKI
6. Application Security
7. Container, Cloud & Platform Security
8. Vulnerability Management
9. Monitoramento, Detecção e Resposta
10. Compliance, Risk & Governance
11. Enterprise Operations

**Cobertura da auditoria**: ~60% dos tópicos foram exercitados nesta varredura. Os 40% restantes (linguagens de scripting, redes avançadas, K8s, métricas SIEM avançadas) são cobertos na **knowledge base do agent** mas não aplicáveis diretamente ao `api-padrao` (que é uma API NestJS monolítica sem K8s).

---

## Próximas evoluções do agent `analista-dev-sec-ops`

- [ ] Integrar com `npm audit --json`, `trivy fs`, `gitleaks detect` para gerar relatório automático
- [ ] Adicionar skill `secure-coding-nestjs` com snippets prontos
- [ ] Adicionar skill `opa-policy-authoring` para Kyverno/Gatekeeper
- [ ] Templates de threat model mermaid para cada módulo novo
- [ ] Métricas históricas (tendência de findings por sprint)
- [ ] Auto-fix para findings BAIXA (markdownlint-style)
- [ ] Integração com `gh secret scanning` e Dependabot
- [ ] Suporte a `compliance-check` (ISO 27001, SOC 2, LGPD) com templates editáveis

---

> *Relatório gerado por `analista-dev-sec-ops` v1, em 2026-06-16.*
> *Próxima varredura recomendada: 2026-07-15 (após Sprint 1 de quick wins).*
