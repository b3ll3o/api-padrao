-- [SEC-001] Renomeia coluna `token` → `tokenHash` em `RefreshToken`.
-- Refresh tokens **nunca** devem ser persistidos em plaintext: um dump
-- da tabela expõe todos os tokens ativos e permite hijack de sessão
-- sem precisar da senha do usuário.
--
-- Como NÃO é seguro converter os tokens plaintext existentes em hash
-- (o hash de uma string que já vazou é vazamento), esta migração:
--   1. Adiciona `tokenHash` como coluna nova (NOT NULL com default
--      temporário em string vazia para satisfazer a constraint).
--   2. Revoga todos os refresh tokens existentes (`revokedAt = now()`).
--      Tokens plaintext antigos são tratados como queimados — usuários
--      ativos precisarão logar de novo. Aceitável porque SHA-256(token)
--      ≠ token, ou seja, mesmo se tivéssemos o hash antigo ele seria
--      inútil para autenticação (a coluna `token` antiga armazenava
--      o token bruto, não o hash).
--   3. Remove a coluna `token` antiga.
--   4. Renomeia `tokenHash` para o estado final, com constraint UNIQUE.
--
-- Migração equivalente a:
--   ALTER TABLE "RefreshToken" ADD COLUMN "tokenHash" TEXT NOT NULL DEFAULT '';
--   UPDATE "RefreshToken" SET "revokedAt" = NOW() WHERE "revokedAt" IS NULL;
--   ALTER TABLE "RefreshToken" DROP COLUMN "token";
--   ALTER TABLE "RefreshToken" DROP DEFAULT;
--   ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_tokenHash_key" UNIQUE ("tokenHash");

-- Step 1: add new column with temporary default to allow backfill
ALTER TABLE "RefreshToken" ADD COLUMN "tokenHash" TEXT NOT NULL DEFAULT '';

-- Step 2: invalidate all existing plaintext tokens (they are considered leaked)
UPDATE "RefreshToken" SET "revokedAt" = NOW() WHERE "revokedAt" IS NULL;

-- Step 3: drop the plaintext column
ALTER TABLE "RefreshToken" DROP COLUMN "token";

-- Step 4: drop the temporary default
ALTER TABLE "RefreshToken" ALTER COLUMN "tokenHash" DROP DEFAULT;

-- Step 5: enforce uniqueness on the new column
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
