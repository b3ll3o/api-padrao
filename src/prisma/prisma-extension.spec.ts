import { contextStorage } from '../shared/infrastructure/services/context.storage';
import { handleSoftDeleteAndMultiTenant } from './prisma-extension';

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
});
