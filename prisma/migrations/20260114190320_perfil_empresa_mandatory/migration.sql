/*
  Refatoração segura: a migration original quebrava porque a seed
  (20250909233321_add_default_profiles_and_permissions) já havia inserido
  Perfis sem empresaId, e esta migration tentava ADD COLUMN ... NOT NULL
  sobre uma tabela não vazia. Estratégia:
    1. Drop das unique keys antigas (precisam sair antes da nova estrutura)
    2. ADD COLUMN nullable
    3. Backfill: cria Usuario "system" + Empresa "Sistema" e atribui
       os Perfis legados a ela
    4. SET NOT NULL
    5. Recria unique keys como (nome, empresaId) e (codigo, empresaId)
    6. FK para Empresa
*/

-- 1
DROP INDEX "Perfil_codigo_key";
DROP INDEX "Perfil_nome_key";

-- 2
ALTER TABLE "Perfil" ADD COLUMN "empresaId" TEXT;

-- 3: Usuario "system" — email em .invalid (RFC 2606) para nunca resolver
INSERT INTO "Usuario" ("email", "senha", "createdAt", "updatedAt", "ativo")
VALUES (
  '__system__@internal.invalid',
  NULL,                                    -- sem senha: conta não-autenticável
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  true
);

INSERT INTO "Empresa" (
  "id", "nome", "descricao", "ativo", "responsavelId", "createdAt", "updatedAt"
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'Sistema',
  'Empresa de sistema para perfis legados seedados antes do multi-tenant. Use Empresas reais para dados de produção.',
  true,
  (SELECT id FROM "Usuario" WHERE email = '__system__@internal.invalid'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- 4
UPDATE "Perfil"
SET "empresaId" = '00000000-0000-0000-0000-000000000000'
WHERE "empresaId" IS NULL;

-- 5
ALTER TABLE "Perfil" ALTER COLUMN "empresaId" SET NOT NULL;

-- 6
CREATE UNIQUE INDEX "Perfil_nome_empresaId_key" ON "Perfil"("nome", "empresaId");
CREATE UNIQUE INDEX "Perfil_codigo_empresaId_key" ON "Perfil"("codigo", "empresaId");

-- 7
ALTER TABLE "Perfil" ADD CONSTRAINT "Perfil_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
