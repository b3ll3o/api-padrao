# DevSecOps Sprint 1 — HTTP Hardening — Tasks

> **Change ID**: `devsecops-sprint-1`
> **Data**: 2026-06-21

Checklist de tarefas para implementar este change.

---

## 1. Helmet (FR-HTTP-01)

- [x] Verificar `@fastify/helmet` instalado em `package.json`
- [x] Verificar registro em `src/main.ts` com CSP strict em prod,
      permissiva em dev/test
- [x] Adicionar testes e2e para headers em `test/security-headers.e2e-spec.ts`

## 2. CORS (FR-HTTP-02)

- [x] Verificar `app.enableCors(...)` em `src/main.ts` com
      `origin: isProduction ? ALLOWED_ORIGINS.split(',') : true`
- [x] Verificar `ALLOWED_ORIGINS: Joi.string().optional()` em
      `env.validation.ts`
- [x] Adicionar testes e2e para CORS preflight + Origin arbitrário em dev

## 3. Trust Proxy (FR-HTTP-03)

- [x] Verificar `new FastifyAdapter({ trustProxy })` em `src/main.ts`
- [x] Verificar `TRUST_PROXY: Joi.string().default('loopback')` em
      `env.validation.ts`
- [x] Verificar getter `trustProxy` em `app.config.ts`
- [x] Adicionar teste e2e (request com X-Forwarded-For não quebra)

## 4. Body Size Limit (FR-HTTP-04) — **NOVO**

- [x] Adicionar `bodyLimit = 1024 * 1024` (1MB) em `src/main.ts`
- [x] Adicionar `BODY_LIMIT_BYTES: Joi.number().integer().min(1024)`
      em `env.validation.ts`
- [x] Adicionar teste e2e (body normal passa; 413 path coberto por
      Fastify nativo — não duplicamos teste)
- [ ] (Futuro) Adicionar teste e2e com body 2MB → 413 (a fazer quando
      houver infra para gerar payload gigante sem flakiness)

## 5. CSRF Guard (FR-HTTP-05) — Decisão formal

- [x] Confirmar ausência de `setCookie` / `res.cookie` em `src/`
- [x] Confirmar autenticação JWT-only via `Authorization: Bearer`
- [x] Documentar decisão em `.openspec/changes/devsecops-sprint-1/design.md`
      (NFR-SEC-CSRF-001)
- [x] Definir NFR-SEC-CSRF-002 (futuro: cookie httpOnly → registrar
      `@fastify/csrf-protection`)

## 6. Testes (ATDD)

- [x] Criar `test/security-headers.e2e-spec.ts` com 9 testes:
  - Helmet: X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
    X-DNS-Prefetch-Control, CSP, HSTS indireto
  - CORS: Origin arbitrário reflete, OPTIONS preflight 204
  - Trust proxy: X-Forwarded-For não quebra
  - Body limit: body normal passa
- [ ] (Opcional) Criar `src/main.spec.ts` (unit test do bootstrap) —
      considerar como follow-up

## 7. Documentação

- [x] Criar `.openspec/changes/devsecops-sprint-1/proposal.md`
- [x] Criar `.openspec/changes/devsecops-sprint-1/design.md`
- [x] Criar `.openspec/changes/devsecops-sprint-1/tasks.md` (este arquivo)
- [ ] (Opcional) Criar `features/devsecops-sprint-1.feature` —
      considerar como follow-up (BDD já existe em
      `devsecops-sprint1-quick-wins.feature`)

## 8. Validação

- [ ] `npm run typecheck` passa
- [ ] `npm run lint` passa
- [ ] `npm run test` (unit) passa
- [ ] `npm run test:e2e` (incluindo security-headers) passa
- [ ] `curl -I http://localhost:3001/health/live` retorna headers
      esperados

## 9. Não-objetivos (NÃO fazer)

- [x] NÃO commitar (somente implementar e validar)
- [x] NÃO alterar outras changes (`perfis/`, `permissoes/`, etc.)
- [x] NÃO mexer em `src/auth/`
- [x] NÃO trocar autenticação de JWT
- [x] NÃO desabilitar funcionalidades existentes para passar testes

---

## Status

- [x] Tasks definidos (este arquivo)
- [ ] Implementação completa (código + testes)
- [ ] Validação passa
- [ ] Aprovado para merge
- [ ] Archived
