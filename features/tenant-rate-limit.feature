# ============================================================
# BDD: src/shared/infrastructure/throttling/tenant-throttler.guard.ts
# SDD: .openspec/changes/tenant-rate-limit/design.md (REQ-TR-001..008)
# ATDD: test/tenant-rate-limit.e2e-spec.ts
# TDD: src/shared/infrastructure/throttling/tenant-throttler.guard.spec.ts
# Feature: tenant-rate-limit (US-NF-001)
# Source: .openspec/changes/tenant-rate-limit/{proposal,design,tasks}.md
# ============================================================

Funcionalidade: Rate Limit por Tenant baseado em Plano de Assinatura

Eu como plataforma multi-tenant
Quero limitar requests por empresa baseado no plano (FREE/PRO/ENTERPRISE)
Para proteger o sistema contra abuso e garantir SLA por tier

Contexto:
  Dado que o ThrottlerGuard padrão aplica limites por IP
  E o mapa PLANO_LIMITS define os tetos por plano × tier (short/medium/long/sensitive)
    | Plano      | short | medium | long  | sensitive |
    | FREE       | 3     | 20     | 100   | 10        |
    | PRO        | 10    | 50     | 1000  | 20        |
    | ENTERPRISE | 30    | 200    | 10000 | 100       |

# ============================================================
# AC-TR-01 / AC-TR-02 / AC-TR-03 — Limites por plano (FREE/PRO/ENTERPRISE)
# ============================================================

Cenário: FREE bloqueia ao exceder 100 req no tier long
  Dado que existe uma empresa com plano "FREE" cadastrada
  E o usuário dessa empresa está autenticado via JWT
  Quando o usuário fizer 100 requisições GET para "/usuarios" no intervalo de 1 minuto
  Então todas as 100 respostas devem ter status 200
  Quando o usuário fizer a 101ª requisição GET para "/usuarios"
  Então o status da resposta deve ser 429
  E o header "X-RateLimit-Limit" deve ser "100"
  E o header "X-RateLimit-Remaining" deve ser "0"
  E o header "Retry-After" deve estar presente

Cenário: PRO permite 1000 req no tier long (sem 429)
  Dado que existe uma empresa com plano "PRO" cadastrada
  E o usuário dessa empresa está autenticado via JWT
  Quando o usuário fizer 1000 requisições GET para "/usuarios" no intervalo de 1 minuto
  Então todas as 1000 respostas devem ter status 200
  Quando o usuário fizer a 1001ª requisição GET para "/usuarios"
  Então o status da resposta deve ser 429
  E o header "X-RateLimit-Limit" deve ser "1000"

Cenário: ENTERPRISE permite 10000 req no tier long (sem 429)
  Dado que existe uma empresa com plano "ENTERPRISE" cadastrada
  E o usuário dessa empresa está autenticado via JWT
  Quando o usuário fizer 10000 requisições GET para "/usuarios" no intervalo de 1 minuto
  Então todas as 10000 respostas devem ter status 200
  Quando o usuário fizer a 10001ª requisição GET para "/usuarios"
  Então o status da resposta deve ser 429
  E o header "X-RateLimit-Limit" deve ser "10000"

# ============================================================
# AC-TR-03 — Plano lido do JWT é respeitado
# ============================================================

Cenário: Plano lido do JWT do tenant é respeitado
  Dado que existe uma empresa com plano "ENTERPRISE" cadastrada
  E o usuário dessa empresa possui um JWT válido contendo o empresaId dessa empresa
  Quando o usuário fizer uma requisição GET para "/usuarios" com Authorization Bearer
  Então o status da resposta deve ser 200
  E o throttler deve ter usado o limite do plano "ENTERPRISE" (long = 10000)

# ============================================================
# AC-TR-04 — Rota pública sem JWT / x-empresa-id cai em FREE
# ============================================================

Cenário: Rota pública sem JWT nem x-empresa-id aplica limite FREE
  Dado que o sistema está configurado com o TenantThrottlerGuard
  Quando uma requisição sem Authorization e sem header "x-empresa-id" chegar em "/perfis"
  Então o guard deve executar sem retornar 500
  E o tracker de throttling deve ser derivado do IP (fallback FREE)

Cenário: Header x-empresa-id é aceito como tracker quando JWT está vazio
  Dado que existe uma empresa com plano "FREE" cadastrada
  Quando uma requisição sem Authorization mas com header "x-empresa-id" válido chegar em "/usuarios"
  Então o guard deve executar sem retornar 500
  E a resposta não deve ser 429 com 1 requisição

# ============================================================
# AC-TR-05 — Empresa inativa / soft-deletada cai em FREE (fail-open)
# ============================================================

Cenário: Tenant soft-deletado recebe tratamento de FREE (fail-open)
  Dado que existe uma empresa com plano "PRO" no DB mas com "ativo = false"
  E o usuário dessa empresa está autenticado via JWT
  Quando o usuário fizer uma requisição GET para "/usuarios"
  Então o guard deve aplicar o limite do plano "FREE" (100 req no tier long)
  E deve logar warn com evento "throttler.tenant_invalid" motivo "inactive"

# ============================================================
# REQ-TR-002 — Limites por tier (short/medium/long/sensitive)
# ============================================================

Esquema do Cenário: Plano aplica limites distintos por tier
  Dado que existe uma empresa com plano "<plano>" cadastrada
  Quando o guard resolver o tier "<tier>" para essa empresa
  Então o limite efetivo deve ser "<limite>"

  Exemplos:
    | plano      | tier      | limite |
    | FREE       | short     | 3      |
    | FREE       | medium    | 20     |
    | FREE       | long      | 100    |
    | FREE       | sensitive | 10     |
    | PRO        | short     | 10     |
    | PRO        | medium    | 50     |
    | PRO        | long      | 1000   |
    | PRO        | sensitive | 20     |
    | ENTERPRISE | short     | 30     |
    | ENTERPRISE | medium    | 200    |
    | ENTERPRISE | long      | 10000  |
    | ENTERPRISE | sensitive | 100    |

# ============================================================
# AC-TR-isolamento — Contadores por tenant são independentes
# ============================================================

Cenário: Empresa A e Empresa B têm contadores de throttling independentes
  Dado que existem duas empresas com plano "FREE" cadastradas (empresa-A e empresa-B)
  E cada empresa tem um administrador autenticado
  Quando o admin da empresa-A fizer 3 requisições GET para "/usuarios"
  E o admin da empresa-B fizer 3 requisições GET para "/usuarios"
  Então todas as 6 respostas devem ter status 200
  E nenhum dos dois contadores deve afetar o outro

# ============================================================
# REQ-TR-004 — Cache Redis do plano (60s TTL)
# ============================================================

Cenário: Cache hit do plano não consulta Prisma
  Dado que existe uma empresa com plano "PRO" cadastrada
  E a chave "tenant:plano:<empresaId>" está populada no Redis com o valor "PRO"
  Quando o guard resolver o plano dessa empresa
  Então o Prisma não deve ser consultado
  E o plano retornado deve ser "PRO"

Cenário: Cache miss do plano consulta Prisma e popula cache com TTL 60s
  Dado que existe uma empresa com plano "PRO" cadastrada
  E a chave "tenant:plano:<empresaId>" NÃO está populada no Redis
  Quando o guard resolver o plano dessa empresa
  Então o Prisma deve ser consultado com findUnique
  E o cache deve ser populado com o valor "PRO" e TTL de 60000 ms

# ============================================================
# NFR-TR-002 — Degradação graciosa quando Redis está offline
# ============================================================

Cenário: Redis offline degrada para query Prisma direta sem 500
  Dado que existe uma empresa com plano "PRO" cadastrada
  E o cacheManager lança ConnectionError ao tentar ler "tenant:plano:<empresaId>"
  Quando o guard resolver o plano dessa empresa
  Então o Prisma deve ser consultado como fallback
  E a requisição NÃO deve retornar 500
  E deve logar error com evento "throttler.cache_offline"

# ============================================================
# NFR-TR-004 — Plano NUNCA lido de header client-controlled
# ============================================================

Cenário: Tentativa de spoofing de plano via header é ignorada
  Dado que existe uma empresa com plano "FREE" cadastrada
  E o usuário dessa empresa está autenticado via JWT
  Quando o usuário fizer uma requisição GET para "/usuarios" com header "x-plano: ENTERPRISE"
  Então o guard deve aplicar o limite do plano "FREE" (do DB)
  E o header "x-plano" deve ser completamente ignorado
