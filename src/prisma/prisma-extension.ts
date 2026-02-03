import { Prisma } from '@prisma/client';

export const softDeleteExtension = Prisma.defineExtension({
  name: 'softDelete',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const softDeleteModels = ['Usuario', 'Perfil', 'Permissao', 'Empresa'];

        if (softDeleteModels.includes(model)) {
          if (
            operation === 'findUnique' ||
            operation === 'findFirst' ||
            operation === 'findMany' ||
            operation === 'count' ||
            operation === 'findFirstOrThrow' ||
            operation === 'findUniqueOrThrow'
          ) {
            const where = (args.where as any) || {};
            // Only apply if deletedAt is not explicitly provided in the query
            if (where.deletedAt === undefined) {
              args.where = { ...where, deletedAt: null };
            }
          }

          if (operation === 'delete') {
            return (Prisma as any)[model].update({
              ...args,
              data: { deletedAt: new Date(), ativo: false },
            });
          }

          if (operation === 'deleteMany') {
            return (Prisma as any)[model].updateMany({
              ...args,
              data: { deletedAt: new Date(), ativo: false },
            });
          }
        }

        return query(args);
      },
    },
  },
});
