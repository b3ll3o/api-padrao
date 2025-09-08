/*
  Warnings:

  - A unique constraint covering the columns `[codigo]` on the table `Perfil` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[codigo]` on the table `Permissao` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `codigo` to the `Perfil` table without a default value. This is not possible if the table is not empty.
  - Added the required column `descricao` to the `Perfil` table without a default value. This is not possible if the table is not empty.
  - Added the required column `codigo` to the `Permissao` table without a default value. This is not possible if the table is not empty.
  - Added the required column `descricao` to the `Permissao` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Perfil" ADD COLUMN     "codigo" TEXT NOT NULL,
ADD COLUMN     "descricao" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."Permissao" ADD COLUMN     "codigo" TEXT NOT NULL,
ADD COLUMN     "descricao" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Perfil_codigo_key" ON "public"."Perfil"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Permissao_codigo_key" ON "public"."Permissao"("codigo");
