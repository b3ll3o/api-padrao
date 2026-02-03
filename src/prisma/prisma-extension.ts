import { Prisma } from '@prisma/client';
import { contextStorage } from '../shared/infrastructure/services/context.storage';

export const handleSoftDeleteAndMultiTenant = async function (
  this: any,
  {
    model,
    operation,
    args,
    query,
  }: {
    model: string;
    operation: string;
    args: any;
    query: (args: any) => Promise<any>;
  },
) {
  const softDeleteModels = ['Usuario', 'Perfil', 'Permissao', 'Empresa'];
  const multiTenantModels = ['Perfil', 'UsuarioEmpresa'];

  const context = contextStorage.getStore();
  const empresaId = context?.empresaId;

  // --- Multi-tenant Handling ---
  if (multiTenantModels.includes(model) && empresaId) {
    if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
      const newOperation =
        operation === 'findUnique' ? 'findFirst' : 'findFirstOrThrow';
      return this[newOperation]({
        ...args,
        where: { ...args.where, empresaId },
      });
    }

    if (
      operation === 'findFirst' ||
      operation === 'findMany' ||
      operation === 'count' ||
      operation === 'findFirstOrThrow'
    ) {
      args.where = { ...args.where, empresaId };
    }

    if (operation === 'update' || operation === 'updateMany') {
      args.where = { ...args.where, empresaId };
    }

    if (operation === 'delete' || operation === 'deleteMany') {
      args.where = { ...args.where, empresaId };
    }

    if (operation === 'create') {
      args.data = { ...(args.data as any), empresaId };
    }
  }

  // --- Soft Delete Handling ---
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
      return this.update({
        ...args,
        data: { deletedAt: new Date(), ativo: false },
      });
    }

    if (operation === 'deleteMany') {
      return this.updateMany({
        ...args,
        data: { deletedAt: new Date(), ativo: false },
      });
    }
  }

  return query(args);
};

export const softDeleteExtension = Prisma.defineExtension({
  name: 'softDeleteAndMultiTenant',
  query: {
    $allModels: {
      $allOperations: handleSoftDeleteAndMultiTenant,
    },
  },
});
