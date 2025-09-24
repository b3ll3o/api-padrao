-- AlterTable
ALTER TABLE "public"."Perfil" ADD COLUMN     "ativo" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "public"."Permissao" ADD COLUMN     "ativo" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "public"."Usuario" ADD COLUMN     "ativo" BOOLEAN NOT NULL DEFAULT true;
