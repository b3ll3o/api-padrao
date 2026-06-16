# language: pt
# BDD: features/devsecops-sprint1-quick-wins.feature
# SDD: .openspec/changes/devsecops-sprint1-quick-wins/design.md
# Sprint 1 — Quick wins de segurança (relatório DevSecOps 2026-06-16)

Funcionalidade: HTTP Hardening
  Eu como operador de produção
  Quero que o Fastify confie no header X-Forwarded-For do proxy reverso
  E que responses de rotas sensíveis tragam Cache-Control: no-store
  Para que o IP real do cliente seja auditável e responses sensíveis não sejam cacheadas

  Cenário: Trust proxy reflete X-Forwarded-For
    Dado que a API está atrás de um proxy reverso
    Quando eu enviar uma requisição com header "X-Forwarded-For: 203.0.113.42"
    Então o `req.ip` lido pela aplicação deve ser "203.0.113.42"
    E o `AuditLog.ip` deve ser "203.0.113.42"
    E o `LoginHistory.ip` deve ser "203.0.113.42"

  Cenário: Trust proxy rejeita X-Forwarded-For forjado sem proxy
    Dado que a API está rodando em modo dev (trustProxy=loopback)
    Quando eu enviar uma requisição direta (sem passar por proxy) com header "X-Forwarded-For: 1.2.3.4"
    Então o `req.ip` lido pela aplicação deve ser o IP da conexão TCP (não "1.2.3.4")

  Cenário: Cache-Control: no-store em /auth/login
    Quando eu enviar uma requisição POST para "/auth/login" com credenciais válidas
    Então o status da resposta deve ser 201
    E o header "Cache-Control" deve ser "no-store"

  Cenário: Cache-Control: no-store em /usuarios/*
    Dado que estou autenticado com permissões administrativas
    Quando eu enviar uma requisição GET para "/usuarios"
    Então o status da resposta deve ser 200
    E o header "Cache-Control" deve ser "no-store"

  Cenário: Cache-Control AUSENTE em /health/live
    Quando eu enviar uma requisição GET para "/health/live"
    Então o status da resposta deve ser 200
    E o header "Cache-Control" NÃO deve estar presente (ou ser "no-cache" aceitável para health)

Funcionalidade: SDLC Scanning
  Eu como mantenedor do projeto
  Quero que Semgrep (SAST) e Gitleaks (secret scan) rodem em todo PR
  Para que vulnerabilidades em código próprio e vazamento de credenciais sejam detectados antes do merge

  Cenário: Semgrep detecta SQL injection em src/
    Dado que existe um arquivo em src/ com concatenação insegura de SQL:
      """
      const userId = req.params.id;
      await prisma.$queryRawUnsafe(`SELECT * FROM "Usuario" WHERE id = ${userId}`);
      """
    Quando o CI rodar
    Então o job "semgrep" deve falhar
    E a mensagem de erro deve referenciar "CWE-89" ou "sql-injection"

  Cenário: Gitleaks detecta JWT_SECRET hardcoded
    Dado que existe um commit adicionando:
      """
      const JWT_SECRET = "minha-senha-secreta-12345";
      """
    Quando o CI rodar
    Então o job "gitleaks" deve falhar
    E a mensagem de erro deve indicar a linha do segredo

  Cenário: Allowlist evita F+ em .env.example
    Dado que o .env.example contém "POSTGRES_PASSWORD=postgres" (placeholder)
    Quando o CI rodar Gitleaks
    Então o job "gitleaks" NÃO deve falhar

  Cenário: Allowlist evita F+ em *.spec.ts
    Dado que existe um arquivo `*.spec.ts` com tokens de teste:
      """
      const mockToken = "eyJhbGciOiJIUzI1NiJ9.test.signature";
      """
    Quando o CI rodar Gitleaks
    Então o job "gitleaks" NÃO deve falhar

Funcionalidade: App Hardening
  Eu como auditor de segurança
  Quero que o AuditLog capture query e params (além de body)
  E que .env exija senha forte com warning de default
  E que /health/network não seja exposto em produção
  Para que a trilha de auditoria seja completa, e a postura de segurança seja explícita

  Cenário: Audit log captura query sanitizado
    Dado que estou autenticado como admin
    Quando eu enviar uma requisição GET para "/usuarios?email=admin@empresa.com"
    Então deve existir um AuditLog com `detalhes.query.email = "********"` (sanitizado)
    E o `detalhes.query` NÃO deve conter o email em texto plano

  Cenário: Audit log captura params
    Dado que estou autenticado como admin
    Quando eu enviar uma requisição DELETE para "/usuarios/123"
    Então deve existir um AuditLog com `detalhes.params.id = "123"`
    E o `detalhes.method` deve ser "DELETE"

  Cenário: .env com default password emite warning
    Dado que .env contém "POSTGRES_PASSWORD=postgres"
    Quando a aplicação iniciar
    Então o log de boot deve conter `event: 'env.default_password.warning'`
    E a aplicação NÃO deve falhar o boot (apenas warning)

  Cenário: /health/network 200 em dev
    Dado que NODE_ENV é "development"
    Quando eu enviar uma requisição GET para "/health/network"
    Então o status da resposta deve ser 200
    E o corpo deve indicar que o ping para "google" foi bem-sucedido

  Cenário: /health/network 404 em prod
    Dado que NODE_ENV é "production"
    Quando eu enviar uma requisição GET para "/health/network"
    Então o status da resposta deve ser 404
    E a resposta NÃO deve indicar que o endpoint existe (mensagem genérica)

  Cenário: /health/live 200 sempre
    Quando eu enviar uma requisição GET para "/health/live" (em qualquer ambiente)
    Então o status da resposta deve ser 200
    E o corpo deve indicar que o processo está vivo
