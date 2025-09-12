import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPermissaoRepository } from './prisma-permissao.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreatePermissaoDto } from '../../dto/create-permissao.dto';
import { UpdatePermissaoDto } from '../../dto/update-permissao.dto';
import { Permissao } from '../../domain/entities/permissao.entity';

describe('PrismaPermissaoRepository', () => {
  let repository: PrismaPermissaoRepository;

  const mockPrismaService = {
    permissao: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(), // Modified for soft delete and restore
      delete: jest.fn(), // Original delete, now replaced by update for soft delete
      count: jest.fn(),
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

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('create', () => {
    it('should create a new permissao', async () => {
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

      mockPrismaService.permissao.create.mockResolvedValue(expectedPermissao);

      const result = await repository.create(createPermissaoDto);
      expect(result).toEqual(expectedPermissao);
      expect(result.deletedAt).toBeNull(); // Assert deletedAt
      expect(mockPrismaService.permissao.create).toHaveBeenCalledWith({
        data: createPermissaoDto,
      });
    });
  });

  describe('findAll', () => {
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

    it('should return a list of non-deleted permissoes and total count by default', async () => {
      mockPrismaService.permissao.findMany.mockResolvedValue([
        prismaResults[0],
      ]); // Only return non-deleted
      mockPrismaService.permissao.count.mockResolvedValue(1);

      const [data, total] = await repository.findAll(0, 10);
      expect(data).toHaveLength(1);
      expect(data[0]).toBeInstanceOf(Permissao);
      expect(data[0].deletedAt).toBeNull();
      expect(total).toBe(1);
      expect(mockPrismaService.permissao.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        where: { deletedAt: null }, // Assert filter
      });
      expect(mockPrismaService.permissao.count).toHaveBeenCalledWith({
        where: { deletedAt: null },
      });
    });

    it('should return all permissoes including deleted when specified', async () => {
      mockPrismaService.permissao.findMany.mockResolvedValue(prismaResults);
      mockPrismaService.permissao.count.mockResolvedValue(2);

      const [data, total] = await repository.findAll(0, 10, true); // Pass true for includeDeleted
      expect(data).toHaveLength(2);
      expect(data[0]).toBeInstanceOf(Permissao);
      expect(data[1]).toBeInstanceOf(Permissao);
      expect(data[1].deletedAt).not.toBeNull();
      expect(total).toBe(2);
      expect(mockPrismaService.permissao.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        where: {}, // No deletedAt filter
      });
      expect(mockPrismaService.permissao.count).toHaveBeenCalledWith({
        where: {},
      });
    });
  });

  describe('findOne', () => {
    const prismaResult = {
      id: 1,
      nome: 'Permissao 1',
      codigo: 'PERMISSAO_1',
      descricao: 'Desc 1',
      deletedAt: null,
    };

    it('should return a single permissao by ID (not deleted)', async () => {
      mockPrismaService.permissao.findUnique.mockResolvedValue(prismaResult);

      const result = await repository.findOne(1);
      expect(result).toEqual(prismaResult);
      expect(result!.deletedAt).toBeNull();
      expect(mockPrismaService.permissao.findUnique).toHaveBeenCalledWith({
        where: { id: 1, deletedAt: null }, // Assert filter
      });
    });

    it('should return a single permissao by ID including deleted', async () => {
      const deletedPrismaResult = { ...prismaResult, deletedAt: new Date() };
      mockPrismaService.permissao.findUnique.mockResolvedValue(
        deletedPrismaResult,
      );

      const result = await repository.findOne(1, true); // Pass true for includeDeleted
      expect(result).toEqual(deletedPrismaResult);
      expect(result!.deletedAt).toEqual(deletedPrismaResult.deletedAt);
      expect(mockPrismaService.permissao.findUnique).toHaveBeenCalledWith({
        where: { id: 1 }, // No deletedAt filter
      });
    });

    it('should return undefined if permissao not found', async () => {
      mockPrismaService.permissao.findUnique.mockResolvedValue(null);

      const result = await repository.findOne(999);
      expect(result).toBeUndefined();
    });

    it('should return undefined if permissao is soft-deleted and not included', async () => {
      mockPrismaService.permissao.findUnique.mockResolvedValue(null);

      const result = await repository.findOne(1, false); // Explicitly not include deleted
      expect(result).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should update an existing permissao', async () => {
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
      mockPrismaService.permissao.update.mockResolvedValue(expectedPermissao);
      mockPrismaService.permissao.findUnique.mockResolvedValue({ id: 1 }); // Mock existingPermissao for update method

      const result = await repository.update(1, updatePermissaoDto);
      expect(result).toEqual(expectedPermissao);
      expect(mockPrismaService.permissao.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: updatePermissaoDto,
      });
    });

    it('should return undefined if permissao to update not found (P2025 error)', async () => {
      const updatePermissaoDto: UpdatePermissaoDto = {
        nome: 'Non Existent',
        codigo: 'NON_EXISTENT',
        descricao: 'Non Existent',
      };
      const prismaError = new Error('Record not found');
      (prismaError as any).code = 'P2025';
      mockPrismaService.permissao.update.mockRejectedValue(prismaError);
      mockPrismaService.permissao.findUnique.mockResolvedValue(null); // Mock existingPermissao for update method

      const result = await repository.update(999, updatePermissaoDto);
      expect(result).toBeUndefined();
    });

    it('should rethrow other errors during update', async () => {
      const updatePermissaoDto: UpdatePermissaoDto = {
        nome: 'Error Permissao',
        codigo: 'ERROR_PERMISSAO',
        descricao: 'Error Description',
      };
      const prismaError = new Error('Database error');
      (prismaError as any).code = 'P1000'; // Some other Prisma error
      mockPrismaService.permissao.update.mockRejectedValue(prismaError);
      mockPrismaService.permissao.findUnique.mockResolvedValue({ id: 1 }); // Mock existingPermissao for update method

      await expect(repository.update(1, updatePermissaoDto)).rejects.toThrow(
        prismaError,
      );
    });
  });

  describe('remove', () => {
    it('should soft delete a permissao', async () => {
      const prismaResult = {
        id: 1,
        nome: 'Test Permissao',
        codigo: 'TEST_PERMISSAO',
        descricao: 'Description',
        deletedAt: new Date(), // Expected to be set
      };
      mockPrismaService.permissao.update.mockResolvedValue(prismaResult);

      const result = await repository.remove(1);

      expect(result).toEqual(prismaResult);
      expect(result.deletedAt).not.toBeNull(); // Assert deletedAt is set
      expect(mockPrismaService.permissao.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('should throw error if permissao not found during soft delete', async () => {
      mockPrismaService.permissao.update.mockRejectedValue({ code: 'P2025' }); // Simulate not found

      await expect(repository.remove(999)).rejects.toThrow(
        'Permissão com ID 999 não encontrada.',
      );
    });
  });

  describe('restore', () => {
    it('should restore a soft-deleted permissao', async () => {
      const prismaResult = {
        id: 1,
        nome: 'Test Permissao',
        codigo: 'TEST_PERMISSAO',
        descricao: 'Description',
        deletedAt: null, // Expected to be null after restore
      };
      mockPrismaService.permissao.update.mockResolvedValue(prismaResult);

      const result = await repository.restore(1);

      expect(result).toEqual(prismaResult);
      expect(result.deletedAt).toBeNull(); // Assert deletedAt is null
      expect(mockPrismaService.permissao.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deletedAt: null },
      });
    });

    it('should throw error if permissao not found during restore', async () => {
      mockPrismaService.permissao.update.mockRejectedValue({ code: 'P2025' }); // Simulate not found

      await expect(repository.restore(999)).rejects.toThrow(
        'Permissão com ID 999 não encontrada.',
      );
    });
  });

  describe('findByNome', () => {
    const prismaResult = {
      id: 1,
      nome: 'Test Permissao',
      codigo: 'TEST_PERMISSAO',
      descricao: 'Description',
      deletedAt: null,
    };

    it('should return a permissao by name (not deleted)', async () => {
      mockPrismaService.permissao.findUnique.mockResolvedValue(prismaResult);

      const result = await repository.findByNome('Test Permissao');
      expect(result).toEqual(prismaResult);
      expect(result!.deletedAt).toBeNull();
      expect(mockPrismaService.permissao.findUnique).toHaveBeenCalledWith({
        where: { nome: 'Test Permissao', deletedAt: null }, // Assert filter
      });
    });

    it('should return a permissao by name including deleted', async () => {
      const deletedPrismaResult = { ...prismaResult, deletedAt: new Date() };
      mockPrismaService.permissao.findUnique.mockResolvedValue(
        deletedPrismaResult,
      );

      const result = await repository.findByNome('Test Permissao', true); // Pass true for includeDeleted
      expect(result).toEqual(deletedPrismaResult);
      expect(result!.deletedAt).toEqual(deletedPrismaResult.deletedAt);
      expect(mockPrismaService.permissao.findUnique).toHaveBeenCalledWith({
        where: { nome: 'Test Permissao' }, // No deletedAt filter
      });
    });

    it('should return null if permissao not found by name', async () => {
      mockPrismaService.permissao.findUnique.mockResolvedValue(null);

      const result = await repository.findByNome('Non Existent');
      expect(result).toBeNull();
    });

    it('should return null if permissao is soft-deleted and not included', async () => {
      mockPrismaService.permissao.findUnique.mockResolvedValue(null);

      const result = await repository.findByNome('Test Permissao', false); // Explicitly not include deleted
      expect(result).toBeNull();
    });
  });

  describe('findByNomeContaining', () => {
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

    it('should return a list of non-deleted permissoes containing the name and total count by default', async () => {
      mockPrismaService.permissao.findMany.mockResolvedValue([
        prismaResults[0],
      ]); // Only return non-deleted
      mockPrismaService.permissao.count.mockResolvedValue(1);

      const [data, total] = await repository.findByNomeContaining(
        'Test',
        0,
        10,
      );
      expect(data).toHaveLength(1);
      expect(data[0]).toBeInstanceOf(Permissao);
      expect(data[0].deletedAt).toBeNull();
      expect(total).toBe(1);
      expect(mockPrismaService.permissao.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        where: {
          nome: {
            contains: 'Test',
            mode: 'insensitive',
          },
          deletedAt: null, // Assert filter
        },
      });
      expect(mockPrismaService.permissao.count).toHaveBeenCalledWith({
        where: {
          nome: {
            contains: 'Test',
            mode: 'insensitive',
          },
          deletedAt: null,
        },
      });
    });

    it('should return all permissoes containing the name including deleted when specified', async () => {
      mockPrismaService.permissao.findMany.mockResolvedValue(prismaResults);
      mockPrismaService.permissao.count.mockResolvedValue(2);

      const [data, total] = await repository.findByNomeContaining(
        'Test',
        0,
        10,
        true, // Pass true for includeDeleted
      );
      expect(data).toHaveLength(2);
      expect(data[0]).toBeInstanceOf(Permissao);
      expect(data[1]).toBeInstanceOf(Permissao);
      expect(data[1].deletedAt).not.toBeNull();
      expect(total).toBe(2);
      expect(mockPrismaService.permissao.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        where: {
          nome: {
            contains: 'Test',
            mode: 'insensitive',
          },
        },
      });
      expect(mockPrismaService.permissao.count).toHaveBeenCalledWith({
        where: {
          nome: {
            contains: 'Test',
            mode: 'insensitive',
          },
        },
      });
    });

    it('should return an empty list and zero count if no permissoes found by name', async () => {
      mockPrismaService.permissao.findMany.mockResolvedValue([]);
      mockPrismaService.permissao.count.mockResolvedValue(0);

      const [data, total] = await repository.findByNomeContaining(
        'Non Existent',
        0,
        10,
      );
      expect(data).toEqual([]);
      expect(total).toBe(0);
    });
  });
});
