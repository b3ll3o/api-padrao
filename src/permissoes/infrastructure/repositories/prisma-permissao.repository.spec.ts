import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPermissaoRepository } from './prisma-permissao.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreatePermissaoDto } from '../../dto/create-permissao.dto';
import { UpdatePermissaoDto } from '../../dto/update-permissao.dto';
import { Permissao } from '../../domain/entities/permissao.entity';

describe('PrismaPermissaoRepository', () => {
  let repository: PrismaPermissaoRepository;

  const mockPermissaoModel = {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };

  const mockPrismaService = {
    permissao: mockPermissaoModel,
    extended: {
      permissao: mockPermissaoModel,
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks(); // Clear all mocks before each test
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaPermissaoRepository,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    repository = module.get<PrismaPermissaoRepository>(
      PrismaPermissaoRepository,
    );
  });

  it('deve ser definido', () => {
    expect(repository).toBeInstanceOf(PrismaPermissaoRepository);
  });

  describe('criação', () => {
    // REQ-PERM-005: Permissao é entidade global (sem empresaId)
    // REQ-PERM-010: POST /permissoes
    it('deve criar uma nova permissão', async () => {
      const createPermissaoDto: CreatePermissaoDto = {
        nome: 'Test Permissao',
        codigo: 'TEST_PERMISSAO',
        descricao: 'Description',
      };
      const expectedPermissao = new Permissao();
      Object.assign(expectedPermissao, {
        id: 1,
        ...createPermissaoDto,
        deletedAt: null, // Added
      });

      mockPermissaoModel.create.mockResolvedValue(expectedPermissao);

      const result = await repository.create(createPermissaoDto);
      expect(result).toEqual(expectedPermissao);
      expect(result.deletedAt).toBeNull(); // Assert deletedAt
      expect(mockPermissaoModel.create).toHaveBeenCalledWith({
        data: createPermissaoDto,
        select: {
          id: true,
          nome: true,
          codigo: true,
          descricao: true,
          ativo: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      });
    });
  });

  describe('busca de todos', () => {
    const prismaResults = [
      {
        id: 1,
        nome: 'Permissao 1',
        codigo: 'PERMISSAO_1',
        descricao: 'Desc 1',
        deletedAt: null,
      },
      {
        id: 2,
        nome: 'Permissao 2',
        codigo: 'PERMISSAO_2',
        descricao: 'Desc 2',
        deletedAt: new Date(), // Soft deleted
      },
    ];

    // REQ-PERM-011: GET /permissoes paginado
    // REQ-PERM-030: default exclui soft-deletadas
    it('deve retornar uma lista de permissões não excluídas e a contagem total por padrão', async () => {
      mockPermissaoModel.findMany.mockResolvedValue([prismaResults[0]]); // Only return non-deleted
      mockPermissaoModel.count.mockResolvedValue(1);

      const [data, total] = await repository.findAll(0, 10);
      expect(data).toHaveLength(1);
      expect(data[0]).toBeInstanceOf(Permissao);
      expect(data[0].deletedAt).toBeNull();
      expect(total).toBe(1);
      expect(mockPermissaoModel.findMany).toHaveBeenCalled();
      expect(mockPermissaoModel.count).toHaveBeenCalled();
    });

    it('deve retornar todas as permissões, incluindo as excluídas, quando especificado', async () => {
      mockPermissaoModel.findMany.mockResolvedValue(prismaResults);
      mockPermissaoModel.count.mockResolvedValue(2);

      const [data, total] = await repository.findAll(0, 10, true); // Pass true for includeDeleted
      expect(data).toHaveLength(2);
      expect(data[0]).toBeInstanceOf(Permissao);
      expect(data[1]).toBeInstanceOf(Permissao);
      expect(data[1].deletedAt).not.toBeNull();
      expect(total).toBe(2);
      expect(mockPermissaoModel.findMany).toHaveBeenCalled();
      expect(mockPermissaoModel.count).toHaveBeenCalled();
    });
  });

  describe('busca por um', () => {
    const prismaResult = {
      id: 1,
      nome: 'Permissao 1',
      codigo: 'PERMISSAO_1',
      descricao: 'Desc 1',
      deletedAt: null,
    };

    // REQ-PERM-012: GET /permissoes/:id (404 se não encontrada)
    it('deve retornar uma única permissão por ID (não excluída)', async () => {
      mockPermissaoModel.findFirst.mockResolvedValue(prismaResult);

      const result = await repository.findOne(1);
      expect(result).toEqual(prismaResult);
      expect(result!.deletedAt).toBeNull();
      // [ALT-006] Verifica `select` específico adicionado.
      expect(mockPermissaoModel.findFirst).toHaveBeenCalledWith({
        where: { id: 1 },
        select: {
          id: true,
          nome: true,
          codigo: true,
          descricao: true,
          deletedAt: true,
          ativo: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    it('deve retornar uma única permissão por ID, incluindo as excluídas', async () => {
      const deletedPrismaResult = { ...prismaResult, deletedAt: new Date() };
      mockPermissaoModel.findFirst.mockResolvedValue(deletedPrismaResult);

      const result = await repository.findOne(1, true); // Pass true for includeDeleted
      expect(result).toEqual(deletedPrismaResult);
      expect(result!.deletedAt).toEqual(deletedPrismaResult.deletedAt);
      // [ALT-006] Verifica `select` específico adicionado.
      expect(mockPermissaoModel.findFirst).toHaveBeenCalledWith({
        where: { id: 1 }, // No deletedAt filter
        select: {
          id: true,
          nome: true,
          codigo: true,
          descricao: true,
          deletedAt: true,
          ativo: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    it('deve retornar undefined se a permissão não for encontrada', async () => {
      mockPermissaoModel.findFirst.mockResolvedValue(null);

      const result = await repository.findOne(999);
      expect(result).toBeUndefined();
    });
  });

  describe('atualização', () => {
    // REQ-PERM-014: PATCH /permissoes/:id
    it('deve atualizar uma permissão existente', async () => {
      const updatePermissaoDto: UpdatePermissaoDto = {
        nome: 'Updated Permissao',
        codigo: 'UPDATED_PERMISSAO',
        descricao: 'Updated Description',
      };
      const expectedPermissao = {
        id: 1,
        nome: 'Updated Permissao',
        codigo: 'TEST_CODE',
        descricao: 'Updated Description',
        deletedAt: null,
      } as Permissao;
      mockPermissaoModel.update.mockResolvedValue(expectedPermissao);
      mockPermissaoModel.findFirst.mockResolvedValue({ id: 1 }); // Mock existingPermissao for update method

      const result = await repository.update(1, updatePermissaoDto);
      expect(result).toEqual(expectedPermissao);
      // [ALT-006] Verifica `select` específico.
      expect(mockPermissaoModel.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: updatePermissaoDto,
        select: {
          ativo: true,
          codigo: true,
          createdAt: true,
          deletedAt: true,
          descricao: true,
          id: true,
          nome: true,
          updatedAt: true,
        },
      });
    });

    it('deve retornar undefined se a permissão a ser atualizada não for encontrada (erro P2025)', async () => {
      const updatePermissaoDto: UpdatePermissaoDto = {
        nome: 'Non Existent',
        codigo: 'NON_EXISTENT',
        descricao: 'Non Existent',
      };
      const prismaError = new Error('Record not found');
      (prismaError as any).code = 'P2025';
      mockPermissaoModel.update.mockRejectedValue(prismaError);
      mockPermissaoModel.findFirst.mockResolvedValue(null); // Mock existingPermissao for update method

      const result = await repository.update(999, updatePermissaoDto);
      expect(result).toBeUndefined();
    });

    it('deve retornar undefined quando findFirst encontra mas update lança P2025 (race condition)', async () => {
      const prismaError = new Error('Record not found');
      (prismaError as any).code = 'P2025';
      mockPermissaoModel.findFirst.mockResolvedValue({ id: 1 });
      mockPermissaoModel.update.mockRejectedValue(prismaError);

      const result = await repository.update(1, { nome: 'X' });
      expect(result).toBeUndefined();
    });

    it('deve retornar undefined sem chamar update quando findFirst não encontra registro', async () => {
      mockPermissaoModel.findFirst.mockResolvedValue(null);

      const result = await repository.update(999, { nome: 'X' });

      expect(result).toBeUndefined();
      expect(mockPermissaoModel.update).not.toHaveBeenCalled();
    });

    it('deve propagar erro não-P2025 no update', async () => {
      const otherError = new Error('Connection refused');
      mockPermissaoModel.findFirst.mockResolvedValue({ id: 1 });
      mockPermissaoModel.update.mockRejectedValue(otherError);

      await expect(repository.update(1, { nome: 'X' })).rejects.toThrow(
        'Connection refused',
      );
    });
  });

  describe('remoção', () => {
    // REQ-PERM-020: soft delete via client estendido (deletedAt=NOW, ativo=false)
    it('deve realizar soft delete de uma permissão chamando delete do extended client', async () => {
      const prismaResult = {
        id: 1,
        nome: 'Test Permissao',
        codigo: 'TEST_PERMISSAO',
        descricao: 'Description',
        deletedAt: new Date(), // Expected to be set
        ativo: false,
      };
      mockPermissaoModel.delete.mockResolvedValue(prismaResult);

      const result = await repository.remove(1);

      expect(result).toEqual(prismaResult);
      expect(result.deletedAt).not.toBeNull(); // Assert deletedAt is set
      // [ALT-006] Verifica `select` específico.
      expect(mockPermissaoModel.delete).toHaveBeenCalledWith({
        where: { id: 1 },
        select: {
          id: true,
          nome: true,
          codigo: true,
          descricao: true,
          deletedAt: true,
          ativo: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    it('deve lançar um erro se a permissão não for encontrada durante o soft delete', async () => {
      mockPermissaoModel.delete.mockRejectedValue({ code: 'P2025' }); // Simulate not found

      await expect(repository.remove(999)).rejects.toThrow(
        'Permissão com ID 999 não encontrada.',
      );
    });

    it('deve propagar erro não-P2025 no remove', async () => {
      const otherError = new Error('Connection refused');
      mockPermissaoModel.delete.mockRejectedValue(otherError);

      await expect(repository.remove(1)).rejects.toThrow('Connection refused');
    });
  });

  describe('restauração', () => {
    // REQ-PERM-021: restore (deletedAt=null, ativo=true)
    it('deve restaurar uma permissão com soft delete', async () => {
      const prismaResult = {
        id: 1,
        nome: 'Test Permissao',
        codigo: 'TEST_PERMISSAO',
        descricao: 'Description',
        deletedAt: null, // Expected to be null after restore
        ativo: true,
      };
      mockPermissaoModel.update.mockResolvedValue(prismaResult);

      const result = await repository.restore(1);

      expect(result).toEqual(prismaResult);
      expect(result.deletedAt).toBeNull(); // Assert deletedAt is null
      // [ALT-006] Verifica `select` específico.
      expect(mockPermissaoModel.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deletedAt: null, ativo: true },
        select: {
          id: true,
          nome: true,
          codigo: true,
          descricao: true,
          deletedAt: true,
          ativo: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    it('deve lançar um erro se a permissão não for encontrada durante a restauração', async () => {
      mockPermissaoModel.update.mockRejectedValue({ code: 'P2025' }); // Simulate not found

      await expect(repository.restore(999)).rejects.toThrow(
        'Permissão com ID 999 não encontrada.',
      );
    });

    it('deve propagar erro não-P2025 no restore', async () => {
      const otherError = new Error('Connection refused');
      mockPermissaoModel.update.mockRejectedValue(otherError);

      await expect(repository.restore(1)).rejects.toThrow('Connection refused');
    });
  });

  describe('busca por nome', () => {
    const prismaResult = {
      id: 1,
      nome: 'Test Permissao',
      codigo: 'TEST_PERMISSAO',
      descricao: 'Description',
      deletedAt: null,
    };

    // REQ-PERM-001: findByNome global (sem empresaId)
    it('deve retornar uma permissão por nome (não excluída)', async () => {
      mockPermissaoModel.findFirst.mockResolvedValue(prismaResult);

      const result = await repository.findByNome('Test Permissao');
      expect(result).toEqual(prismaResult);
      expect(result!.deletedAt).toBeNull();
      // [ALT-006] Verifica `select` específico.
      expect(mockPermissaoModel.findFirst).toHaveBeenCalledWith({
        where: { nome: 'Test Permissao' },
        select: {
          id: true,
          nome: true,
          codigo: true,
          descricao: true,
          deletedAt: true,
          ativo: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    it('deve retornar uma permissão por nome, incluindo as excluídas', async () => {
      const deletedPrismaResult = { ...prismaResult, deletedAt: new Date() };
      mockPermissaoModel.findFirst.mockResolvedValue(deletedPrismaResult);

      const result = await repository.findByNome('Test Permissao', true); // Pass true for includeDeleted
      expect(result).toEqual(deletedPrismaResult);
      expect(result!.deletedAt).toEqual(deletedPrismaResult.deletedAt);
      // [ALT-006] Verifica `select` específico.
      expect(mockPermissaoModel.findFirst).toHaveBeenCalledWith({
        where: { nome: 'Test Permissao' }, // No deletedAt filter
        select: {
          id: true,
          nome: true,
          codigo: true,
          descricao: true,
          deletedAt: true,
          ativo: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    it('deve retornar null quando a permissão por nome não é encontrada', async () => {
      mockPermissaoModel.findFirst.mockResolvedValue(null);

      const result = await repository.findByNome('Inexistente');

      expect(result).toBeNull();
    });
  });

  describe('busca por nome contendo', () => {
    // REQ-PERM-013: GET /permissoes/nome/:nome (contains)
    const prismaResults = [
      {
        id: 1,
        nome: 'Test Permissao 1',
        codigo: 'TEST_PERMISSAO_1',
        descricao: 'Desc 1',
        deletedAt: null,
      },
      {
        id: 2,
        nome: 'Another Test Permissao',
        codigo: 'ANOTHER_TEST_PERMISSAO',
        descricao: 'Desc 2',
        deletedAt: new Date(), // Soft deleted
      },
    ];

    it('deve retornar uma lista de permissões não excluídas contendo o nome e a contagem total por padrão', async () => {
      mockPermissaoModel.findMany.mockResolvedValue([prismaResults[0]]); // Only return non-deleted
      mockPermissaoModel.count.mockResolvedValue(1);

      const [data, total] = await repository.findByNomeContaining(
        'Test',
        0,
        10,
      );
      expect(data).toHaveLength(1);
      expect(data[0]).toBeInstanceOf(Permissao);
      expect(data[0].deletedAt).toBeNull();
      expect(total).toBe(1);
      expect(mockPermissaoModel.findMany).toHaveBeenCalled();
      expect(mockPermissaoModel.count).toHaveBeenCalled();
    });

    it('deve retornar todas as permissões contendo o nome, incluindo excluídas, quando includeDeleted=true', async () => {
      mockPermissaoModel.findMany.mockResolvedValue(prismaResults);
      mockPermissaoModel.count.mockResolvedValue(2);

      const [data, total] = await repository.findByNomeContaining(
        'Test',
        0,
        10,
        true,
      );
      expect(data).toHaveLength(2);
      expect(total).toBe(2);
    });
  });
});
