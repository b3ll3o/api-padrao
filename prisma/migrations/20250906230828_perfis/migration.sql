-- AlterTable
ALTER TABLE "public"."Usuario" ADD COLUMN     "perfilId" INTEGER;

-- CreateTable
CREATE TABLE "public"."Perfil" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "Perfil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Permissao" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "Permissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."_PerfilToPermissao" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_PerfilToPermissao_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Perfil_nome_key" ON "public"."Perfil"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Permissao_nome_key" ON "public"."Permissao"("nome");

-- CreateIndex
CREATE INDEX "_PerfilToPermissao_B_index" ON "public"."_PerfilToPermissao"("B");

-- AddForeignKey
ALTER TABLE "public"."Usuario" ADD CONSTRAINT "Usuario_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "public"."Perfil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_PerfilToPermissao" ADD CONSTRAINT "_PerfilToPermissao_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Perfil"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_PerfilToPermissao" ADD CONSTRAINT "_PerfilToPermissao_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."Permissao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
