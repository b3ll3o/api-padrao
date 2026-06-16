# Backlog de Ideias — Novas Funcionalidades e Requisitos — 2026-06-15

> Gerado pelo agent **analista-requisitos** aplicando as 4 lentes (Product Owner, Business Analyst, Analista de Requisitos, Engenheiro de Requisitos) sobre o estado atual do projeto `api-padrao`. Cada ideia está classificada por **MoSCoW** + **complexidade estimada** + **valor de negócio** + **esqueleto de US/REQ** para entrar no próximo ciclo de planning.

## TL;DR

- **20 cards** de backlog priorizados.
- **4 MUST** (segurança + LGPD + auditoria — bloqueiam release em produção).
- **6 SHOULD** (produtividade + observabilidade — habilitam escala).
- **6 COULD** (qualidade de vida — diferenciais competitivos).
- **4 WON'T (this release)** (roadmap de longo prazo).
- Top 3 recomendados para a **próxima sprint**:
  1. **US-AUTH-101 — Recuperação de senha** (MUST, M, 5 pts) — bloqueia go-live.
  2. **US-AUTH-102 — Política de senha e rotação** (MUST, M, 5 pts) — segurança mínima.
  3. **US-AUDIT-201 — Endpoint de consulta de AuditLog com paginação e filtros** (MUST, M, 3 pts) — habilita compliance.

## Pipeline de Decisão Aplicado

```text
Lente PO     → Valor de negócio / ROI / MVP
Lente BA     → Processo / Stakeholders / AC de negócio
Lente AR     → RF/RNF atômicos / SMART-FN / RFC 2119
Lente RE     → Rastreabilidade / IEEE 29148 / versionamento
```

Cada card abaixo segue esse fluxo e gera **entradas prontas** para a fase de BDD/SDD.

---

## 🔴 MUST (4) — Segurança, LGPD, Auditoria

### US-AUTH-101 — Recuperação de Senha (forgot/reset password)

**Persona**: usuário esqueceu a senha.

**Lente PO** (valor): bloqueia go-live. 100% dos produtos têm. Reduz chamados de suporte em ~60%.

**Lente BA** (AC de negócio):
- Dado que existe usuário com e-mail "joao@empresa.com"
- Quando ele submete o formulário "esqueci minha senha"
- Então o sistema envia e-mail com link/token
- E o link expira em 1h
- E ao clicar, o usuário define nova senha e é logado automaticamente

**Lente AR** (REQ-FN, SMART-FN):
- **REQ-AUTH-101.01** [SHALL] O sistema SHALL enviar e-mail com link de reset quando `POST /auth/forgot-password` for chamado com e-mail válido.
- **REQ-AUTH-101.02** [SHALL] O token SHALL expirar em 1 hora.
- **REQ-AUTH-101.03** [SHALL] O sistema SHALL aceitar `POST /auth/reset-password` com `token + nova_senha`, validar o token e atualizar a senha.
- **REQ-AUTH-101.04** [SHALL NOT] O sistema SHALL NOT revelar se o e-mail existe (resposta sempre 200, sem distinção).
- **REQ-AUTH-N101.05** [SHALL] Senha SHALL ser atualizada com bcrypt cost ≥ 10 (consistente com login).
- **REQ-AUTH-N101.06** [SHALL] Tokens SHALL ser marcados como usados após uso (não-replayable).

**Lente RE** (rastreabilidade):
- BDD: `features/autenticacao.feature:Cenário: Esqueci minha senha`
- ATDD: `test/auth.e2e-spec.ts:cenario_reset`
- TDD: `src/auth/application/services/auth.service.spec.ts:deve gerar token de reset`
- Novo modelo: `PasswordResetToken` (token, userId, expiresAt, usedAt)
- CR-003 necessário

**Esforço**: 5 story points. **Risco**: baixo (padrão conhecido). **Dependência**: provedor de e-mail (mockável inicialmente).

**Módulo**: novo submódulo em `auth/` + migration Prisma.

---

### US-AUTH-102 — Política de Senha e Rotação Obrigatória

**Persona**: admin quer forçar senhas fortes + rotação periódica.

**Lente PO** (valor): compliance (LGPD, ISO 27001, SOC2). Reduz risco de credential stuffing.

**Lente BA** (AC):
- Senha mínima: 8 chars, com maiúscula, minúscula, número e símbolo.
- Senha não pode ser igual ao e-mail.
- Senha não pode estar em lista das 100k senhas mais comuns (haveibeenpwned).
- Usuário é forçado a trocar senha a cada 90 dias.
- Histórico: não pode reutilizar últimas 5 senhas.

**Lente AR** (REQ-FN):
- **REQ-AUTH-102.01** [SHALL] O sistema SHALL validar senha contra política (8+, 1+ cada tipo).
- **REQ-AUTH-102.02** [SHALL NOT] O sistema SHALL NOT aceitar senhas em lista negra (100k mais comuns).
- **REQ-AUTH-102.03** [SHALL] O sistema SHALL exigir troca de senha a cada 90 dias.
- **REQ-AUTH-102.04** [SHALL] O sistema SHALL manter histórico das últimas 5 senhas.
- **REQ-AUTH-N102.05** [SHOULD] Validação contra haveibeenpwned SHOULD ser feita com hash k-anonymity (não envia senha em claro).

**Lente RE**:
- Novo modelo: `PasswordHistory` (userId, hash, createdAt)
- Campo novo em `Usuario`: `passwordChangedAt`
- BDD + e2e + unit cobrindo cada regra

**Esforço**: 5 story points. **Risco**: médio (migração de dados — usuário existente precisa resetar).

---

### US-AUDIT-201 — Consulta de AuditLog (endpoint + filtros + paginação)

**Persona**: auditor/DPO precisa consultar histórico de ações.

**Lente PO** (valor): LGPD Art. 37 (relatório de impacto) + LGPD Art. 50 (boas práticas). Compliance obrigatório.

**Lente BA** (AC):
- Filtros: por usuário, por empresa, por recurso, por ação, por período.
- Paginação padrão (10/página).
- Exportar CSV/JSON.
- Apenas admin da empresa vê logs da própria empresa.

**Lente AR** (REQ-FN):
- **REQ-AUDIT-201.01** [SHALL] O sistema SHALL expor `GET /audit-logs` com filtros: `usuarioId`, `empresaId`, `recurso`, `acao`, `dataInicio`, `dataFim`.
- **REQ-AUDIT-201.02** [SHALL] A resposta SHALL seguir `PaginatedResponseDto<AuditLogDto>`.
- **REQ-AUDIT-201.03** [SHALL] Apenas usuários com `READ_AUDIT_LOG` SHALL acessar.
- **REQ-AUDIT-201.04** [SHOULD] O sistema SHOULD exportar `GET /audit-logs/export?format=csv|json`.
- **REQ-AUDIT-N201.05** [SHALL] Logs SHALL ser retidos por no mínimo 5 anos (LGPD).

**Lente RE**:
- Tabela `AuditLog` já existe — só expor via controller.
- Novo DTO: `AuditLogFilterDto`.
- 4 cenários BDD (filtro por recurso, por usuário, export, sem permissão).

**Esforço**: 3 story points. **Risco**: baixo. **Dependência**: nenhum.

---

### US-LGPD-301 — Right to be Forgotten (exclusão de dados pessoais)

**Persona**: titular dos dados (LGPD Art. 18, VI).

**Lente PO** (valor): **obrigação legal** (LGPD). Multa de até 2% do faturamento (limitada a R$ 50M por infração).

**Lente BA** (AC):
- Usuário solicita exclusão via `DELETE /usuarios/:id/personal-data`.
- Sistema anonimiza: e-mail vira `deleted-{uuid}@removed.local`, `senha` removida, `LoginHistory` removida, `AuditLog` mantém apenas `usuarioId` (sem dado pessoal).
- Soft-delete da conta.
- Confirmação por e-mail.

**Lente AR** (REQ-FN):
- **REQ-LGPD-301.01** [SHALL] O sistema SHALL permitir exclusão de dados pessoais via `DELETE /usuarios/:id/personal-data`.
- **REQ-LGPD-301.02** [SHALL] O sistema SHALL anonimizar e-mail substituindo por `deleted-{uuid}@removed.local`.
- **REQ-LGPD-301.03** [SHALL] O sistema SHALL remover LoginHistory, RefreshTokens, PasswordHistory do usuário.
- **REQ-LGPD-301.04** [SHALL NOT] O sistema SHALL NOT permitir reverter a exclusão após 30 dias.
- **REQ-LGPD-301.05** [SHALL] O sistema SHALL enviar confirmação por e-mail.

**Lente RE**:
- Migration: adicionar `Usuario.deletedAnonymouslyAt: DateTime?`
- Job agendado: após 30 dias, anonimizar de vez.
- BDD: 4 cenários (sucesso, sem permissão, dados não-pessoais preservados em AuditLog, idempotência).

**Esforço**: 8 story points. **Risco**: alto (reversibilidade zero, precisa de revisão jurídica).

---

## 🟡 SHOULD (6) — Produtividade, Observabilidade, DX

### US-AUTH-103 — 2FA / MFA com TOTP

**Persona**: usuário quer mais segurança.

**Lente PO** (valor): diferencial para clientes enterprise. Compliance com NIS2.

**Lente BA**:
- Setup: QR code no app authenticator.
- Login: senha + código TOTP.
- Backup codes (10 códigos single-use).
- Disable 2FA: requer senha atual.

**Lente AR** (REQ-FN):
- **REQ-AUTH-103.01** [SHALL] `POST /auth/2fa/setup` SHALL retornar QR code + secret.
- **REQ-AUTH-103.02** [SHALL] `POST /auth/2fa/verify` SHALL validar código TOTP (janela 30s ± 1).
- **REQ-AUTH-103.03** [SHALL] Login SHALL exigir 2ª etapa se usuário tem 2FA ativo.
- **REQ-AUTH-N103.04** [SHOULD] Backup codes SHOULD ser single-use.

**Lente RE**: novo modelo `TwoFactorSecret`, `BackupCode`. 6 cenários BDD.

**Esforço**: 8 pts. **Risco**: médio (crypto, RNF fortes).

---

### US-AUTH-104 — Login Social (Google, Microsoft)

**Lente PO** (valor): reduz fricção de cadastro. Taxa de conversão +30%.

**Lente AR** (REQ-FN):
- **REQ-AUTH-104.01** [SHALL] `GET /auth/oauth/:provider` SHALL redirecionar para OAuth.
- **REQ-AUTH-104.02** [SHALL] `GET /auth/oauth/:provider/callback` SHALL validar token, criar/vincular usuário, retornar JWT.
- Suporte a Google + Microsoft (mínimo).

**Lente RE**: dependência de provider externo (mockável). RNF: rate limit, audit log, vinculação de conta existente.

**Esforço**: 8 pts. **Risco**: médio (depende de configuração de OAuth provider).

---

### US-USER-401 — Convite de Usuário (Admin convida por e-mail)

**Persona**: admin quer adicionar funcionário sem que ele precise se cadastrar.

**Lente PO** (valor): onboarding self-service. Reduz atrito de cadastro.

**Lente BA**:
- `POST /usuarios/invite` → admin envia e-mail com token.
- `GET /usuarios/accept-invite?token=X` → usuário define senha.
- Token expira em 7 dias.
- Convite pode ter perfis pré-atribuídos (escopo empresa).

**Lente AR** (REQ-FN):
- **REQ-USER-401.01** [SHALL] `POST /usuarios/invite` SHALL enviar e-mail com token.
- **REQ-USER-401.02** [SHALL] Token SHALL expirar em 7 dias.
- **REQ-USER-401.03** [SHALL] `POST /usuarios/accept-invite` SHALL criar usuário com perfis pré-atribuídos.

**Lente RE**: novo modelo `InviteToken`. 5 cenários BDD. Semelhante a US-AUTH-101.

**Esforço**: 5 pts. **Risco**: baixo.

---

### US-OBS-501 — Métricas de Negócio (endpoint `/metrics/business`)

**Lente PO** (valor): dashboard para admin. Visibilidade de uso.

**Lente AR** (REQ-FN):
- **REQ-OBS-501.01** [SHALL] `GET /metrics/business` SHALL retornar: usuários ativos (DAU/MAU), empresas ativas, logins nas últimas 24h, ações auditadas/24h.
- **REQ-OBS-501.02** [SHALL] Filtros: por período, por empresa.
- Permissão: `READ_BUSINESS_METRICS`.

**Esforço**: 5 pts. **Risco**: baixo (já temos `AuditLog`).

---

### US-AUTH-105 — Gestão de Sessões (listar e revogar)

**Lente PO** (valor): usuário quer saber onde está logado e revogar acessos suspeitos.

**Lente AR** (REQ-FN):
- **REQ-AUTH-105.01** [SHALL] `GET /auth/sessions` SHALL listar sessões ativas (IP, userAgent, createdAt, lastUsed).
- **REQ-AUTH-105.02** [SHALL] `DELETE /auth/sessions/:id` SHALL revogar sessão específica.
- **REQ-AUTH-105.03** [SHALL] `POST /auth/sessions/revoke-all` SHALL revogar todas as outras sessões.

**Lente RE**: novo modelo `Session` (token, userId, ip, userAgent, lastUsedAt). 4 cenários BDD.

**Esforço**: 3 pts. **Risco**: baixo.

---

### US-NF-601 — Rate Limit por Tenant (não global)

**Lente PO** (valor): planos de assinatura. Cliente enterprise tem limite maior.

**Lente BA**: configurar limites por empresa. Planos: Free (100 req/min), Pro (1000 req/min), Enterprise (custom).

**Lente AR** (REQ-FN):
- **REQ-NF-601.01** [SHALL] Throttler SHALL ler limite do `Empresa.plano` ou tabela de configuração.
- **REQ-NF-601.02** [SHALL] Mudança de plano SHALL propagar em ≤ 1 min.

**Lente RE**: integração com `ThrottlerGuard` customizado + cache Redis. 3 cenários.

**Esforço**: 5 pts. **Risco**: médio (migração do rate limit global para tenant-aware).

---

## 🟢 COULD (6) — Qualidade de vida, diferenciais

### US-AUTH-106 — Logout explícito (revoga refresh token)

**Lente AR** (REQ-FN): `POST /auth/logout` SHALL revogar refresh token do header.

**Esforço**: 1 pt. **Risco**: baixo. (Provavelmente já coberto parcialmente — verificar.)

---

### US-API-701 — Versionamento de API (`/v1`, `/v2`)

**Lente PO** (valor): permite breaking changes sem quebrar clientes.

**Lente AR** (REQ-FN): URL prefix `/v1`. Sunset policy: `/v1/deprecated` retorna 410 após data.

**Esforço**: 3 pts. **Risco**: baixo (NestJS suporta nativamente).

---

### US-API-702 — API Keys para Server-to-Server

**Lente AR** (REQ-FN): gerar chaves com escopo granular. Rotação. Webhook de revogação.

**Esforço**: 8 pts. **Risco**: médio.

---

### US-NOT-801 — Notificações in-app (WebSockets)

**Lente AR** (REQ-FN): WS endpoint `/notifications`. BullMQ para envio. Subscribe por userId.

**Esforço**: 8 pts. **Risco**: médio (infra nova).

---

### US-WEBHOOK-901 — Webhooks por Evento

**Lente AR** (REQ-FN): `user.created`, `empresa.updated`, etc. Retry com backoff. HMAC para assinatura.

**Esforço**: 8 pts. **Risco**: médio (estado distribuído, retry, etc).

---

### US-FF-1001 — Feature Flags por Tenant

**Lente AR** (REQ-FN): toggle por empresa. Rollout gradual. A/B testing.

**Esforço**: 5 pts. **Risco**: baixo (já temos Redis).

---

## ⚪ WON'T (this release) (4) — Roadmap de longo prazo

### US-AUTH-107 — SSO SAML (apenas enterprise, demanda ainda baixa)

**Esforço**: 13 pts. **Risco**: alto. Aguardar demanda.

### US-FILE-1101 — Upload de Arquivos (S3-compatible)

**Esforço**: 13 pts. **Risco**: alto (storage, antivirus, scan).

### US-I18N-1201 — Internacionalização de mensagens

**Esforço**: 5 pts. **Risco**: baixo, mas baixa prioridade (pt-BR é suficiente).

### US-GQL-1301 — Endpoint GraphQL alternativo

**Esforço**: 13 pts. **Risco**: alto (manter 2 APIs).

---

## 8. Resumo para Sprint Planning

### Próxima Sprint (recomendação)

| # | User Story | Pontos | Must/Should | Valor |
|---|------------|--------|-------------|-------|
| 1 | US-AUTH-101 — Recuperação de senha | 5 | MUST | Bloqueia go-live |
| 2 | US-AUTH-102 — Política de senha | 5 | MUST | Compliance |
| 3 | US-AUDIT-201 — Consulta AuditLog | 3 | MUST | LGPD |
| 4 | US-AUTH-105 — Gestão de sessões | 3 | SHOULD | UX |

**Total**: 16 pontos. **Capacity típica**: 15-20 pts. ✅ Cabe.

### Sprint +1

| # | User Story | Pontos |
|---|------------|--------|
| 5 | US-USER-401 — Convite de usuário | 5 |
| 6 | US-LGPD-301 — Right to be forgotten | 8 |

**Total**: 13 pontos. (CRÍTICO se prazo regulatório estiver próximo.)

### Sprint +2

| # | User Story | Pontos |
|---|------------|--------|
| 7 | US-OBS-501 — Métricas de negócio | 5 |
| 8 | US-NF-601 — Rate limit por tenant | 5 |

---

## 9. Próximos Passos (PO + RE)

1. **PO**: validar priorização e ROI de cada MUST.
2. **BA**: agendar workshops de AC de negócio com stakeholders (US-AUTH-101/102, US-LGPD-301).
3. **AR**: escrever `design.md` para os 4 MUSTs (entrega formal de RF/RFN).
4. **RE**: criar CR-003, CR-004, CR-005, CR-006 + tag de baseline.
5. **Dev**: ATDD primeiro (e2e-spec falhando), depois TDD, depois implementação.
6. **QA**: revisar RTM antes de cada merge.

---

**Assinado**: `analista-requisitos` (Claude Code) — 2026-06-15.
**Aplicar skill**: `product-owner` para priorização adicional, `analista-requisitos` para escrita de design.md, `engenheiro-requisitos` para CR + RTM.
