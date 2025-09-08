/*
  Warnings:

  - You are about to drop the column `perfilId` on the `Usuario` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Usuario" DROP CONSTRAINT "Usuario_perfilId_fkey";

-- AlterTable
ALTER TABLE "public"."Usuario" DROP COLUMN "perfilId";

-- CreateTable
CREATE TABLE "public"."_PerfilToUsuario" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_PerfilToUsuario_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_PerfilToUsuario_B_index" ON "public"."_PerfilToUsuario"("B");

-- AddForeignKey
ALTER TABLE "public"."_PerfilToUsuario" ADD CONSTRAINT "_PerfilToUsuario_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Perfil"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_PerfilToUsuario" ADD CONSTRAINT "_PerfilToUsuario_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
