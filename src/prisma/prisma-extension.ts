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
 *
 * ## Por que `any` é justificado aqui
 *
 * O tipo do parâmetro `(this, { model, operation, args, query })` na API
 * do Prisma Client extensions é `any` por design — o tipo exato de
 * `args`/`query` é gerado dinamicamente por modelo/operação e o
 * `@prisma/client` não exporta um tipo genérico que cubra todos os
 * modelos. Tentar parametrizar isso exigiria generics distribuídos em
 * 7+ call sites sem ganho real de segurança de tipo (a checagem real
 * acontece em runtime, via Zod/DTOs na camada de entrada).
 *
 * Os `any` foram intencionalmente mantidos aqui (após [BAI-005]) com
 * `// eslint-disable` explícito por motivo de auditoria. Migrar para
 * tipos do Prisma quebraria a assinatura dos callbacks sem benefício
 * de type-safety (a inferência do Prisma também retorna `any` quando
 * o modelo é dinâmico).
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
      const where = args.where || {};
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
      if (!args.data?.empresaId) {
        args.data = { ...args.data, empresaId };
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
export function makeSoftDeleteHandlers() {
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
export function makeMultiTenantHandlers() {
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
