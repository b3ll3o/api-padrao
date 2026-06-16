import { contextStorage } from '../shared/infrastructure/services/context.storage';
import {
  handleSoftDeleteAndMultiTenant,
  makeSoftDeleteHandlers,
  makeMultiTenantHandlers,
} from './prisma-extension';

describe('Prisma Extension - Multi-tenant & Soft Delete', () => {
  let mockQuery: jest.Mock;

  beforeEach(() => {
    mockQuery = jest.fn().mockResolvedValue({ id: 1 });
  });

  it('deve adicionar empresaId em modelos multi-tenant quando houver contexto', async () => {
    const args = { where: { id: 1 } };
    const context = { empresaId: 'company-123' };

    await contextStorage.run(context, async () => {
      await handleSoftDeleteAndMultiTenant({
        model: 'Perfil',
        operation: 'findMany',
        args,
        query: mockQuery,
      });
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, empresaId: 'company-123', deletedAt: null },
      }),
    );
  });

  it('NÃO deve adicionar empresaId se o modelo não for multi-tenant', async () => {
    const args = { where: { id: 1 } };
    const context = { empresaId: 'company-123' };

    await contextStorage.run(context, async () => {
      await handleSoftDeleteAndMultiTenant({
        model: 'Usuario',
        operation: 'findMany',
        args,
        query: mockQuery,
      });
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, deletedAt: null },
      }),
    );
    expect(mockQuery.mock.calls[0][0].where.empresaId).toBeUndefined();
  });

  it('deve injetar empresaId na criação de modelos multi-tenant', async () => {
    const args = { data: { nome: 'Admin' } };
    const context = { empresaId: 'company-123' };

    await contextStorage.run(context, async () => {
      await handleSoftDeleteAndMultiTenant({
        model: 'Perfil',
        operation: 'create',
        args,
        query: mockQuery,
      });
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { nome: 'Admin', empresaId: 'company-123' },
      }),
    );
  });

  it('deve respeitar filtro deletedAt explícito', async () => {
    const args = { where: { id: 1, deletedAt: { not: null } } };

    await handleSoftDeleteAndMultiTenant({
      model: 'Usuario',
      operation: 'findMany',
      args,
      query: mockQuery,
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, deletedAt: { not: null } },
      }),
    );
  });

  it('deve transformar findUnique em findFirst quando adicionar empresaId em modelos multi-tenant', async () => {
    const args = { where: { id: 1 } };
    const context = { empresaId: 'company-123' };

    // Verify query layer: deixa passar com query(args) após injetar deletedAt
    await contextStorage.run(context, async () => {
      await handleSoftDeleteAndMultiTenant({
        model: 'Perfil',
        operation: 'findUnique',
        args,
        query: mockQuery,
      });
    });

    // O query extension agora delega para o model extension (que faz o
    // findUnique→findFirst); o query extension apenas injeta `deletedAt: null`
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, deletedAt: null },
      }),
    );
  });

  it('NÃO injeta empresaId no create quando o caller já o fornece', async () => {
    const args = { data: { nome: 'Visitante', empresaId: 'outra-empresa' } };
    const context = { empresaId: 'company-123' };

    await contextStorage.run(context, async () => {
      await handleSoftDeleteAndMultiTenant({
        model: 'Perfil',
        operation: 'create',
        args,
        query: mockQuery,
      });
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { nome: 'Visitante', empresaId: 'outra-empresa' },
      }),
    );
  });

  it('injeta empresaId em update/updateMany de modelos multi-tenant', async () => {
    const args = { where: { id: 1 }, data: { nome: 'Novo' } };
    const context = { empresaId: 'company-123' };

    await contextStorage.run(context, async () => {
      await handleSoftDeleteAndMultiTenant({
        model: 'Perfil',
        operation: 'update',
        args,
        query: mockQuery,
      });
    });

    expect(mockQuery.mock.calls[0][0].where.empresaId).toBe('company-123');
  });

  it('injeta empresaId em delete/deleteMany de modelos multi-tenant', async () => {
    const args = { where: { id: 1 } };
    const context = { empresaId: 'company-123' };

    await contextStorage.run(context, async () => {
      await handleSoftDeleteAndMultiTenant({
        model: 'Perfil',
        operation: 'delete',
        args,
        query: mockQuery,
      });
    });

    expect(mockQuery.mock.calls[0][0].where.empresaId).toBe('company-123');
  });

  it('NÃO injeta empresaId em Perfil sem contexto (request sem tenant)', async () => {
    const args = { where: { id: 1 } };
    await handleSoftDeleteAndMultiTenant({
      model: 'Perfil',
      operation: 'findMany',
      args,
      query: mockQuery,
    });

    expect(mockQuery.mock.calls[0][0].where.empresaId).toBeUndefined();
    // Mas deletedAt: null ainda é aplicado
    expect(mockQuery.mock.calls[0][0].where.deletedAt).toBeNull();
  });

  it('injeta deletedAt: null em count/findFirstOrThrow/findUniqueOrThrow para soft-delete models', async () => {
    const context = { empresaId: 'company-123' };
    const ops = ['count', 'findFirstOrThrow', 'findUniqueOrThrow'] as const;

    for (const op of ops) {
      mockQuery.mockClear();
      const args = { where: { id: 1 } };
      await contextStorage.run(context, async () => {
        await handleSoftDeleteAndMultiTenant({
          model: 'Usuario',
          operation: op,
          args,
          query: mockQuery,
        });
      });
      expect(mockQuery.mock.calls[0][0].where.deletedAt).toBeNull();
    }
  });

  it('NÃO injeta deletedAt em modelos fora da lista (ex: LoginHistory)', async () => {
    const args = { where: { id: 1 } };
    await handleSoftDeleteAndMultiTenant({
      model: 'LoginHistory',
      operation: 'findMany',
      args,
      query: mockQuery,
    });
    expect(mockQuery.mock.calls[0][0].where.deletedAt).toBeUndefined();
  });

  it('deve injetar deletedAt: null mesmo quando args.where é undefined', async () => {
    const args = {} as any;
    await handleSoftDeleteAndMultiTenant({
      model: 'Usuario',
      operation: 'findMany',
      args,
      query: mockQuery,
    });
    expect(mockQuery.mock.calls[0][0].where.deletedAt).toBeNull();
  });
});

describe('makeSoftDeleteHandlers (model extension)', () => {
  it('deve transformar delete em update com deletedAt e ativo=false', async () => {
    const updateMock = jest.fn().mockResolvedValue({ id: 1 });
    const ctx: any = { update: updateMock };
    const handlers = makeSoftDeleteHandlers();

    await handlers.delete.call(ctx, { where: { id: 1 } });

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { deletedAt: expect.any(Date), ativo: false },
    });
  });

  it('deve transformar deleteMany em updateMany com deletedAt e ativo=false', async () => {
    const updateManyMock = jest.fn().mockResolvedValue({ count: 3 });
    const ctx: any = { updateMany: updateManyMock };
    const handlers = makeSoftDeleteHandlers();

    await handlers.deleteMany.call(ctx, { where: { ativo: true } });

    expect(updateManyMock).toHaveBeenCalledWith({
      where: { ativo: true },
      data: { deletedAt: expect.any(Date), ativo: false },
    });
  });

  it('deve preservar data existente do caller em delete', async () => {
    const updateMock = jest.fn().mockResolvedValue({ id: 1 });
    const ctx: any = { update: updateMock };
    const handlers = makeSoftDeleteHandlers();

    await handlers.delete.call(ctx, {
      where: { id: 1 },
      data: { custom: 'value' },
    });

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { custom: 'value', deletedAt: expect.any(Date), ativo: false },
    });
  });
});

describe('makeMultiTenantHandlers (model extension)', () => {
  it('deve transformar findUnique em findFirst com empresaId do contexto', async () => {
    const findFirstMock = jest.fn().mockResolvedValue({ id: 1 });
    const ctx: any = { findFirst: findFirstMock };
    const handlers = makeMultiTenantHandlers();

    await contextStorage.run({ empresaId: 'empresa-123' }, async () => {
      await handlers.findUnique.call(ctx, { where: { id: 1 } });
    });

    expect(findFirstMock).toHaveBeenCalledWith({
      where: { id: 1, empresaId: 'empresa-123' },
    });
  });

  it('deve transformar findUniqueOrThrow em findFirstOrThrow com empresaId', async () => {
    const findFirstOrThrowMock = jest.fn().mockResolvedValue({ id: 1 });
    const ctx: any = { findFirstOrThrow: findFirstOrThrowMock };
    const handlers = makeMultiTenantHandlers();

    await contextStorage.run({ empresaId: 'empresa-123' }, async () => {
      await handlers.findUniqueOrThrow.call(ctx, { where: { id: 1 } });
    });

    expect(findFirstOrThrowMock).toHaveBeenCalledWith({
      where: { id: 1, empresaId: 'empresa-123' },
    });
  });

  it('deve desconstruir composite key (usuarioId_empresaId) em where flat', async () => {
    const findFirstMock = jest.fn().mockResolvedValue({ id: 1 });
    const ctx: any = { findFirst: findFirstMock };
    const handlers = makeMultiTenantHandlers();

    await contextStorage.run({ empresaId: 'empresa-override' }, async () => {
      await handlers.findUnique.call(ctx, {
        where: {
          usuarioId_empresaId: {
            usuarioId: 5,
            empresaId: 'empresa-original',
          },
        },
      });
    });

    expect(findFirstMock).toHaveBeenCalledWith({
      where: {
        usuarioId: 5,
        empresaId: 'empresa-override',
      },
    });
  });

  it('deve omitir empresaId quando não houver contexto', async () => {
    const findFirstMock = jest.fn().mockResolvedValue({ id: 1 });
    const ctx: any = { findFirst: findFirstMock };
    const handlers = makeMultiTenantHandlers();

    await handlers.findUnique.call(ctx, { where: { id: 1 } });

    expect(findFirstMock).toHaveBeenCalledWith({
      where: { id: 1 },
    });
    expect(findFirstMock.mock.calls[0][0].where.empresaId).toBeUndefined();
  });

  it('deve desconstruir composite key mesmo sem contexto (sem injetar empresaId)', async () => {
    const findFirstMock = jest.fn().mockResolvedValue({ id: 1 });
    const ctx: any = { findFirst: findFirstMock };
    const handlers = makeMultiTenantHandlers();

    await handlers.findUnique.call(ctx, {
      where: {
        usuarioId_empresaId: { usuarioId: 5, empresaId: 'empresa-original' },
      },
    });

    expect(findFirstMock).toHaveBeenCalledWith({
      where: { usuarioId: 5, empresaId: 'empresa-original' },
    });
  });

  it('deve aceitar args undefined e usar where default', async () => {
    const findFirstMock = jest.fn().mockResolvedValue({ id: 1 });
    const ctx: any = { findFirst: findFirstMock };
    const handlers = makeMultiTenantHandlers();

    await handlers.findUnique.call(ctx, undefined);

    expect(findFirstMock).toHaveBeenCalledWith({
      where: { empresaId: undefined },
    });
    expect(findFirstMock.mock.calls[0][0].where.empresaId).toBeUndefined();
  });
});
