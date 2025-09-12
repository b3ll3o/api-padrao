-- AlterTable
ALTER TABLE "public"."Perfil" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."Permissao" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."Usuario" ADD COLUMN     "deletedAt" TIMESTAMP(3);
