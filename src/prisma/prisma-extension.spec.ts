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

    // Mock models
    const mockFindFirst = jest.fn().mockResolvedValue({ id: 1 });
    const mockThis = {
      findFirst: mockFindFirst,
    };

    await contextStorage.run(context, async () => {
      const result = await handleSoftDeleteAndMultiTenant.call(mockThis, {
        model: 'Perfil',
        operation: 'findUnique',
        args,
        query: mockQuery,
      });

      expect(result).toEqual({ id: 1 });
    });

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, empresaId: 'company-123' },
      }),
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
