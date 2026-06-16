-- CreateEnum
CREATE TYPE "Plano" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN "plano" "Plano" NOT NULL DEFAULT 'FREE';

-- CreateIndex
CREATE INDEX "Empresa_plano_idx" ON "Empresa"("plano");
