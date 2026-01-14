/*
  Warnings:

  - A unique constraint covering the columns `[nome,empresaId]` on the table `Perfil` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[codigo,empresaId]` on the table `Perfil` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `empresaId` to the `Perfil` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Perfil_codigo_key";

-- DropIndex
DROP INDEX "Perfil_nome_key";

-- AlterTable
ALTER TABLE "Perfil" ADD COLUMN     "empresaId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Perfil_nome_empresaId_key" ON "Perfil"("nome", "empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Perfil_codigo_empresaId_key" ON "Perfil"("codigo", "empresaId");

-- AddForeignKey
ALTER TABLE "Perfil" ADD CONSTRAINT "Perfil_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
