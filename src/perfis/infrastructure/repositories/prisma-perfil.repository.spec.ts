import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPerfilRepository } from './prisma-perfil.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreatePerfilDto } from '../../dto/create-perfil.dto';
import { UpdatePerfilDto } from '../../dto/update-perfil.dto';
import { Perfil } from '../../domain/entities/perfil.entity';
import { Permissao } from '../../../permissoes/domain/entities/permissao.entity';

describe('PrismaPerfilRepository', () => {
  let repository: PrismaPerfilRepository;

  const mockPrismaService = {
    perfil: {
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
        PrismaPerfilRepository,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    repository = module.get<PrismaPerfilRepository>(PrismaPerfilRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('create', () => {
    it('should create a new perfil', async () => {
      const createPerfilDto: CreatePerfilDto = {
        nome: 'Test Perfil',
        codigo: 'TEST_PERFIL',
        descricao: 'Description',
        permissoesIds: [1, 2],
      };
      const expectedPerfil = new Perfil();
      Object.assign(expectedPerfil, {
        id: 1,
        nome: createPerfilDto.nome,
        codigo: createPerfilDto.codigo,
        descricao: createPerfilDto.descricao,
        permissoes: createPerfilDto.permissoesIds?.map((id) => {
          const p = new Permissao();
          p.id = id;
          return p;
        }),
        deletedAt: null, // Added
      });

      mockPrismaService.perfil.create.mockResolvedValue({
        id: 1,
        nome: createPerfilDto.nome,
        codigo: createPerfilDto.codigo,
        descricao: createPerfilDto.descricao,
        permissoes: createPerfilDto.permissoesIds?.map((id) => ({ id })),
        deletedAt: null,
      });

      const result = await repository.create(createPerfilDto);
      expect(result).toEqual(expectedPerfil);
      expect(result.deletedAt).toBeNull(); // Assert deletedAt
      expect(mockPrismaService.perfil.create).toHaveBeenCalledWith({
        data: {
          nome: createPerfilDto.nome,
          codigo: createPerfilDto.codigo,
          descricao: createPerfilDto.descricao,
          permissoes: {
            connect: [{ id: 1 }, { id: 2 }],
          },
        },
        include: { permissoes: true },
      });
    });

    it('should create a new perfil without permissions', async () => {
      const createPerfilDto: CreatePerfilDto = {
        nome: 'Test Perfil',
        codigo: 'TEST_PERFIL',
        descricao: 'Description',
      };
      const expectedPerfil = new Perfil();
      Object.assign(expectedPerfil, {
        id: 1,
        ...createPerfilDto,
        permissoes: [],
        deletedAt: null, // Added
      });

      mockPrismaService.perfil.create.mockResolvedValue(expectedPerfil);

      const result = await repository.create(createPerfilDto);
      expect(result).toEqual(expectedPerfil);
      expect(result.deletedAt).toBeNull(); // Assert deletedAt
      expect(mockPrismaService.perfil.create).toHaveBeenCalledWith({
        data: {
          nome: createPerfilDto.nome,
          codigo: createPerfilDto.codigo,
          descricao: createPerfilDto.descricao,
          permissoes: {
            connect: undefined, // Should be undefined if permissoesIds is not provided
          },
        },
        include: { permissoes: true },
      });
    });
  });

  describe('findAll', () => {
    const prismaResults = [
      {
        id: 1,
        nome: 'Perfil 1',
        codigo: 'PERFIL_1',
        descricao: 'Desc 1',
        deletedAt: null,
        permissoes: [],
      },
      {
        id: 2,
        nome: 'Perfil 2',
        codigo: 'PERFIL_2',
        descricao: 'Desc 2',
        deletedAt: new Date(), // Soft deleted
        permissoes: [],
      },
    ];

    it('should return a list of non-deleted perfis and total count by default', async () => {
      mockPrismaService.perfil.findMany.mockResolvedValue([prismaResults[0]]); // Only return non-deleted
      mockPrismaService.perfil.count.mockResolvedValue(1);

      const [data, total] = await repository.findAll(0, 10);
      expect(data).toHaveLength(1);
      expect(data[0]).toBeInstanceOf(Perfil);
      expect(data[0].deletedAt).toBeNull();
      expect(total).toBe(1);
      expect(mockPrismaService.perfil.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        where: { deletedAt: null }, // Assert filter
        include: { permissoes: true },
      });
      expect(mockPrismaService.perfil.count).toHaveBeenCalledWith({
        where: { deletedAt: null },
      });
    });

    it('should return all perfis including deleted when specified', async () => {
      mockPrismaService.perfil.findMany.mockResolvedValue(prismaResults); // Return all
      mockPrismaService.perfil.count.mockResolvedValue(2);

      const [data, total] = await repository.findAll(0, 10, true); // Pass true for includeDeleted
      expect(data).toHaveLength(2);
      expect(data[0]).toBeInstanceOf(Perfil);
      expect(data[1]).toBeInstanceOf(Perfil);
      expect(data[1].deletedAt).not.toBeNull();
      expect(total).toBe(2);
      expect(mockPrismaService.perfil.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        where: {}, // No deletedAt filter
        include: { permissoes: true },
      });
      expect(mockPrismaService.perfil.count).toHaveBeenCalledWith({
        where: {},
      });
    });
  });

  describe('findOne', () => {
    const prismaResult = {
      id: 1,
      nome: 'Perfil 1',
      codigo: 'PERFIL_1',
      descricao: 'Desc 1',
      deletedAt: null,
      permissoes: [],
    };

    it('should return a single perfil by ID (not deleted)', async () => {
      mockPrismaService.perfil.findUnique.mockResolvedValue(prismaResult);

      const result = await repository.findOne(1);
      expect(result).toEqual(prismaResult);
      expect(result!.deletedAt).toBeNull();
      expect(mockPrismaService.perfil.findUnique).toHaveBeenCalledWith({
        where: { id: 1, deletedAt: null }, // Assert filter
        include: { permissoes: true },
      });
    });

    it('should return a single perfil by ID including deleted', async () => {
      const deletedPrismaResult = { ...prismaResult, deletedAt: new Date() };
      mockPrismaService.perfil.findUnique.mockResolvedValue(
        deletedPrismaResult,
      );

      const result = await repository.findOne(1, true); // Pass true for includeDeleted
      expect(result).toEqual(deletedPrismaResult);
      expect(result!.deletedAt).toEqual(deletedPrismaResult.deletedAt);
      expect(mockPrismaService.perfil.findUnique).toHaveBeenCalledWith({
        where: { id: 1 }, // No deletedAt filter
        include: { permissoes: true },
      });
    });

    it('should return undefined if perfil not found', async () => {
      mockPrismaService.perfil.findUnique.mockResolvedValue(null);

      const result = await repository.findOne(999);
      expect(result).toBeUndefined();
    });

    it('should return undefined if perfil is soft-deleted and not included', async () => {
      mockPrismaService.perfil.findUnique.mockResolvedValue(null);

      const result = await repository.findOne(1, false); // Explicitly not include deleted
      expect(result).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should update an existing perfil', async () => {
      const updatePerfilDto: UpdatePerfilDto = {
        nome: 'Updated Perfil',
        permissoesIds: [3],
      };
      const expectedPerfil = new Perfil();
      Object.assign(expectedPerfil, {
        id: 1,
        nome: 'Updated Perfil',
        codigo: 'TEST_PERFIL',
        descricao: 'Description',
        deletedAt: null,
        permissoes: updatePerfilDto.permissoesIds?.map((id) => {
          const p = new Permissao();
          p.id = id;
          return p;
        }),
      });
      mockPrismaService.perfil.update.mockResolvedValue(expectedPerfil);
      mockPrismaService.perfil.findUnique.mockResolvedValue({ id: 1 }); // Mock existingPerfil for update method

      const result = await repository.update(1, updatePerfilDto);
      expect(result).toEqual(expectedPerfil);
      expect(mockPrismaService.perfil.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          nome: updatePerfilDto.nome,
          permissoes: {
            set: [{ id: 3 }],
          },
        },
        include: { permissoes: true },
      });
    });

    it('should update an existing perfil without changing permissions', async () => {
      const updatePerfilDto: UpdatePerfilDto = { nome: 'Updated Perfil' };
      const expectedPerfil = new Perfil();
      Object.assign(expectedPerfil, {
        id: 1,
        nome: 'Updated Perfil',
        codigo: 'TEST_PERFIL',
        descricao: 'Description',
        deletedAt: null,
        permissoes: [],
      });
      mockPrismaService.perfil.update.mockResolvedValue(expectedPerfil);
      mockPrismaService.perfil.findUnique.mockResolvedValue({ id: 1 }); // Mock existingPerfil for update method

      const result = await repository.update(1, updatePerfilDto);
      expect(result).toEqual(expectedPerfil);
      expect(mockPrismaService.perfil.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          nome: updatePerfilDto.nome,
          permissoes: {
            set: undefined, // Should be undefined if permissoesIds is not provided
          },
        },
        include: { permissoes: true },
      });
    });

    it('should return undefined if perfil to update not found (P2025 error)', async () => {
      const updatePerfilDto: UpdatePerfilDto = { nome: 'Non Existent' };
      const prismaError = new Error('Record not found');
      (prismaError as any).code = 'P2025';
      mockPrismaService.perfil.update.mockRejectedValue(prismaError);
      mockPrismaService.perfil.findUnique.mockResolvedValue(null); // Mock existingPerfil for update method

      const result = await repository.update(999, updatePerfilDto);
      expect(result).toBeUndefined();
    });

    it('should rethrow other errors during update', async () => {
      const updatePerfilDto: UpdatePerfilDto = { nome: 'Error Perfil' };
      const prismaError = new Error('Database error');
      (prismaError as any).code = 'P1000'; // Some other Prisma error
      mockPrismaService.perfil.update.mockRejectedValue(prismaError);
      mockPrismaService.perfil.findUnique.mockResolvedValue({ id: 1 }); // Mock existingPerfil for update method

      await expect(repository.update(1, updatePerfilDto)).rejects.toThrow(
        prismaError,
      );
    });
  });

  describe('remove', () => {
    it('should soft delete a perfil', async () => {
      const prismaResult = {
        id: 1,
        nome: 'Test Perfil',
        codigo: 'TEST_PERFIL',
        descricao: 'Description',
        deletedAt: new Date(), // Expected to be set
        permissoes: [],
      };
      mockPrismaService.perfil.update.mockResolvedValue(prismaResult);

      const result = await repository.remove(1);

      expect(result).toEqual(prismaResult);
      expect(result.deletedAt).not.toBeNull(); // Assert deletedAt is set
      expect(mockPrismaService.perfil.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deletedAt: expect.any(Date) },
        include: { permissoes: true }, // Added include expectation
      });
    });

    it('should throw error if perfil not found during soft delete', async () => {
      mockPrismaService.perfil.update.mockRejectedValue({ code: 'P2025' }); // Simulate not found

      await expect(repository.remove(999)).rejects.toThrow(
        'Perfil com ID 999 não encontrado.',
      );
    });
  });

  describe('restore', () => {
    it('should restore a soft-deleted perfil', async () => {
      const prismaResult = {
        id: 1,
        nome: 'Test Perfil',
        codigo: 'TEST_PERFIL',
        descricao: 'Description',
        deletedAt: null, // Expected to be null after restore
        permissoes: [],
      };
      mockPrismaService.perfil.update.mockResolvedValue(prismaResult);

      const result = await repository.restore(1);

      expect(result).toEqual(prismaResult);
      expect(result.deletedAt).toBeNull(); // Assert deletedAt is null
      expect(mockPrismaService.perfil.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deletedAt: null },
        include: { permissoes: true }, // Added include expectation
      });
    });

    it('should throw error if perfil not found during restore', async () => {
      mockPrismaService.perfil.update.mockRejectedValue({ code: 'P2025' }); // Simulate not found

      await expect(repository.restore(999)).rejects.toThrow(
        'Perfil com ID 999 não encontrado.',
      );
    });
  });

  describe('findByNome', () => {
    const prismaResult = {
      id: 1,
      nome: 'Test Perfil',
      codigo: 'TEST_PERFIL',
      descricao: 'Description',
      deletedAt: null,
      permissoes: [],
    };

    it('should return a perfil by name (not deleted)', async () => {
      mockPrismaService.perfil.findUnique.mockResolvedValue(prismaResult);

      const result = await repository.findByNome('Test Perfil');
      expect(result).toEqual(prismaResult);
      expect(result!.deletedAt).toBeNull();
      expect(mockPrismaService.perfil.findUnique).toHaveBeenCalledWith({
        where: { nome: 'Test Perfil', deletedAt: null }, // Assert filter
        include: { permissoes: true },
      });
    });

    it('should return a perfil by name including deleted', async () => {
      const deletedPrismaResult = { ...prismaResult, deletedAt: new Date() };
      mockPrismaService.perfil.findUnique.mockResolvedValue(
        deletedPrismaResult,
      );

      const result = await repository.findByNome('Test Perfil', true); // Pass true for includeDeleted
      expect(result).toEqual(deletedPrismaResult);
      expect(result!.deletedAt).toEqual(deletedPrismaResult.deletedAt);
      expect(mockPrismaService.perfil.findUnique).toHaveBeenCalledWith({
        where: { nome: 'Test Perfil' }, // No deletedAt filter
        include: { permissoes: true },
      });
    });

    it('should return null if perfil not found by name', async () => {
      mockPrismaService.perfil.findUnique.mockResolvedValue(null);

      const result = await repository.findByNome('Non Existent');
      expect(result).toBeNull();
    });

    it('should return null if perfil is soft-deleted and not included', async () => {
      mockPrismaService.perfil.findUnique.mockResolvedValue(null);

      const result = await repository.findByNome('Test Perfil', false); // Explicitly not include deleted
      expect(result).toBeNull();
    });
  });

  describe('findByNomeContaining', () => {
    const prismaResults = [
      {
        id: 1,
        nome: 'Test Perfil 1',
        codigo: 'TEST_PERFIL_1',
        descricao: 'Desc 1',
        deletedAt: null,
        permissoes: [],
      },
      {
        id: 2,
        nome: 'Another Test Perfil',
        codigo: 'ANOTHER_TEST_PERFIL',
        descricao: 'Desc 2',
        deletedAt: new Date(), // Soft deleted
        permissoes: [],
      },
    ];

    it('should return a list of non-deleted perfis containing the name and total count by default', async () => {
      mockPrismaService.perfil.findMany.mockResolvedValue([prismaResults[0]]); // Only return non-deleted
      mockPrismaService.perfil.count.mockResolvedValue(1);

      const [data, total] = await repository.findByNomeContaining(
        'Test',
        0,
        10,
      );
      expect(data).toHaveLength(1);
      expect(data[0]).toBeInstanceOf(Perfil);
      expect(data[0].deletedAt).toBeNull();
      expect(total).toBe(1);
      expect(mockPrismaService.perfil.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        where: {
          nome: {
            contains: 'Test',
            mode: 'insensitive',
          },
          deletedAt: null, // Assert filter
        },
        include: { permissoes: true },
      });
      expect(mockPrismaService.perfil.count).toHaveBeenCalledWith({
        where: {
          nome: {
            contains: 'Test',
            mode: 'insensitive',
          },
          deletedAt: null,
        },
      });
    });

    it('should return all perfis containing the name including deleted when specified', async () => {
      mockPrismaService.perfil.findMany.mockResolvedValue(prismaResults); // Return all
      mockPrismaService.perfil.count.mockResolvedValue(2);

      const [data, total] = await repository.findByNomeContaining(
        'Test',
        0,
        10,
        true, // Pass true for includeDeleted
      );
      expect(data).toHaveLength(2);
      expect(data[0]).toBeInstanceOf(Perfil);
      expect(data[1]).toBeInstanceOf(Perfil);
      expect(data[1].deletedAt).not.toBeNull();
      expect(total).toBe(2);
      expect(mockPrismaService.perfil.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        where: {
          nome: {
            contains: 'Test',
            mode: 'insensitive',
          },
        },
        include: { permissoes: true },
      });
      expect(mockPrismaService.perfil.count).toHaveBeenCalledWith({
        where: {
          nome: {
            contains: 'Test',
            mode: 'insensitive',
          },
        },
      });
    });

    it('should return an empty list and zero count if no perfis found by name', async () => {
      mockPrismaService.perfil.findMany.mockResolvedValue([]);
      mockPrismaService.perfil.count.mockResolvedValue(0);

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
