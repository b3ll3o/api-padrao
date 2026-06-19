-- [PERF-003] Índice composto `(plano, deletedAt, ativo)` em `Empresa`.
-- Suporta a query mais comum: listagem filtrada por plano, excluindo
-- soft-deleted e inativos, sem varredura sequencial.
--
-- Mantemos os índices simples existentes (`@@index([plano])`,
-- `@@index([deletedAt, ativo])`) — o índice composto é aditivo, não
-- substituição. O planner do Postgres escolhe o melhor para cada query.
CREATE INDEX IF NOT EXISTS "Empresa_plano_deletedAt_ativo_idx"
  ON "Empresa"("plano", "deletedAt", "ativo");
