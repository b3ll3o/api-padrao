import { Prisma } from '@prisma/client';
import { contextStorage } from '../shared/infrastructure/services/context.storage';

const softDeleteModels = ['Usuario', 'Perfil', 'Permissao', 'Empresa'];
const multiTenantModels = ['Perfil', 'UsuarioEmpresa'];

/**
 * Query extension: aplica filtros (multi-tenant scoping + soft-delete
 * `deletedAt: null`) e converte `findUnique` em `findFirst` para modelos
 * multi-tenant (que precisam de `empresaId` na cláusula `where` composta).
 *
 * Operações que exigem troca de método (`delete` → `update`,
 * `findUnique` → `findFirst`) são tratadas na camada `model` abaixo, onde
 * `this` é o proxy do modelo e `this.update(...)` etc. funcionam de fato.
 */
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
  const context = contextStorage.getStore();
  const empresaId = context?.empresaId;

  // --- Soft-delete: injeta `deletedAt: null` em leituras ---
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
      if (where.deletedAt === undefined) {
        args.where = { ...where, deletedAt: null };
      }
    }
  }

  // --- Multi-tenant: injeta empresaId nas demais operações ---
  if (multiTenantModels.includes(model) && empresaId) {
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
      // Se o caller já passou empresaId no data, não sobrescrevemos
      // (permite criar registros em outras empresas, ex: admin adicionando
      // usuário a uma empresa diferente da sua)
      if (!(args.data as any)?.empresaId) {
        args.data = { ...(args.data as any), empresaId };
      }
    }
  }

  return query(args);
};

/**
 * Soft-delete via model extension. No Prisma 5+ a única forma de trocar
 * de operação (delete → update) é via `model.<name>.<op>`, porque no
 * `query.$allOperations` o `this` é o array de operações e não tem
 * `.update`/`.updateMany`. Aqui `this` é o proxy do modelo (com
 * `this.update` etc.) e os args chegam diretamente, não wrapped em
 * `{ args, query }` como no query extension.
 */
function makeSoftDeleteHandlers() {
  return {
    async delete(args: any) {
      return (this as any).update({
        ...args,
        data: { ...(args?.data || {}), deletedAt: new Date(), ativo: false },
      });
    },
    async deleteMany(args: any) {
      return (this as any).updateMany({
        ...args,
        data: { ...(args?.data || {}), deletedAt: new Date(), ativo: false },
      });
    },
  };
}

/**
 * Multi-tenant: transforma `findUnique` em `findFirst` para modelos
 * cuja unique key inclui empresaId. Sem essa transformação o Prisma
 * falharia porque `findUnique({ where: { id } })` exige um where que
 * case com a unique key composta. Aqui `this` é o proxy do modelo.
 *
 * Para where com composite key (ex: `usuarioId_empresaId`), precisamos
 * desconstruir para os campos individuais antes de chamar `findFirst`,
 * já que `findFirst` aceita filtros simples (não unique key composta).
 */
function makeMultiTenantHandlers() {
  const transformWhere = (args: any, extraEmpresaId?: string) => {
    const where = args?.where || {};
    // Se for um composite key (ex: { usuarioId_empresaId: { ... } }),
    // desconstruímos para os campos individuais
    const compositeKey = Object.keys(where).find((k) => k.includes('_'));
    if (compositeKey && typeof where[compositeKey] === 'object') {
      return {
        ...where[compositeKey],
        ...(extraEmpresaId ? { empresaId: extraEmpresaId } : {}),
      };
    }
    return {
      ...where,
      ...(extraEmpresaId ? { empresaId: extraEmpresaId } : {}),
    };
  };

  return {
    async findUnique(args: any) {
      const context = contextStorage.getStore();
      const empresaId = context?.empresaId;
      return (this as any).findFirst({
        ...args,
        where: transformWhere(args, empresaId),
      });
    },
    async findUniqueOrThrow(args: any) {
      const context = contextStorage.getStore();
      const empresaId = context?.empresaId;
      return (this as any).findFirstOrThrow({
        ...args,
        where: transformWhere(args, empresaId),
      });
    },
  };
}

export const softDeleteExtension = Prisma.defineExtension({
  name: 'softDeleteAndMultiTenant',
  query: {
    $allModels: {
      $allOperations: handleSoftDeleteAndMultiTenant,
    },
  },
  model: {
    usuario: makeSoftDeleteHandlers(),
    perfil: { ...makeMultiTenantHandlers(), ...makeSoftDeleteHandlers() },
    permissao: makeSoftDeleteHandlers(),
    empresa: makeSoftDeleteHandlers(),
    usuarioEmpresa: makeMultiTenantHandlers(),
  },
});
