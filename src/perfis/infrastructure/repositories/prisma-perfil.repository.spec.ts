import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPerfilRepository } from './prisma-perfil.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreatePerfilDto } from '../../dto/create-perfil.dto';
import { UpdatePerfilDto } from '../../dto/update-perfil.dto';
import { Perfil } from '../../domain/entities/perfil.entity';

describe('PrismaPerfilRepository', () => {
  let repository: PrismaPerfilRepository;
  // let prismaService: PrismaService; // Removed unused variable

  const mockPrismaService = {
    perfil: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
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
    // prismaService = module.get<PrismaService>(PrismaService); // Removed unused assignment
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
      const expectedPerfil = {
        id: 1,
        ...createPerfilDto,
        permissoes: [{ id: 1 }, { id: 2 }],
      } as Perfil;

      mockPrismaService.perfil.create.mockResolvedValue(expectedPerfil);

      const result = await repository.create(createPerfilDto);
      expect(result).toEqual(expectedPerfil);
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
      const expectedPerfil = {
        id: 1,
        ...createPerfilDto,
        permissoes: [],
      } as Perfil;

      mockPrismaService.perfil.create.mockResolvedValue(expectedPerfil);

      const result = await repository.create(createPerfilDto);
      expect(result).toEqual(expectedPerfil);
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
    it('should return a list of perfis and total count', async () => {
      const expectedPerfis = [{ id: 1, nome: 'Perfil 1' }] as Perfil[];
      mockPrismaService.perfil.findMany.mockResolvedValue(expectedPerfis);
      mockPrismaService.perfil.count.mockResolvedValue(1);

      const [data, total] = await repository.findAll(0, 10);
      expect(data).toEqual(expectedPerfis);
      expect(total).toBe(1);
      expect(mockPrismaService.perfil.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        include: { permissoes: true },
      });
      expect(mockPrismaService.perfil.count).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single perfil by ID', async () => {
      const expectedPerfil = { id: 1, nome: 'Perfil 1' } as Perfil;
      mockPrismaService.perfil.findUnique.mockResolvedValue(expectedPerfil);

      const result = await repository.findOne(1);
      expect(result).toEqual(expectedPerfil);
      expect(mockPrismaService.perfil.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: { permissoes: true },
      });
    });

    it('should return undefined if perfil not found', async () => {
      mockPrismaService.perfil.findUnique.mockResolvedValue(null);

      const result = await repository.findOne(999);
      expect(result).toBeUndefined();
      expect(mockPrismaService.perfil.findUnique).toHaveBeenCalledWith({
        where: { id: 999 },
        include: { permissoes: true },
      });
    });
  });

  describe('update', () => {
    it('should update an existing perfil', async () => {
      const updatePerfilDto: UpdatePerfilDto = {
        nome: 'Updated Perfil',
        permissoesIds: [3],
      };
      const expectedPerfil = { id: 1, ...updatePerfilDto } as Perfil;
      mockPrismaService.perfil.update.mockResolvedValue(expectedPerfil);

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
      const expectedPerfil = { id: 1, ...updatePerfilDto } as Perfil;
      mockPrismaService.perfil.update.mockResolvedValue(expectedPerfil);

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

      const result = await repository.update(999, updatePerfilDto);
      expect(result).toBeUndefined();
    });

    it('should rethrow other errors during update', async () => {
      const updatePerfilDto: UpdatePerfilDto = { nome: 'Error Perfil' };
      const prismaError = new Error('Database error');
      (prismaError as any).code = 'P1000'; // Some other Prisma error
      mockPrismaService.perfil.update.mockRejectedValue(prismaError);

      await expect(repository.update(1, updatePerfilDto)).rejects.toThrow(
        prismaError,
      );
    });
  });

  describe('remove', () => {
    it('should remove a perfil', async () => {
      mockPrismaService.perfil.delete.mockResolvedValue(undefined);

      await expect(repository.remove(1)).resolves.toBeUndefined();
      expect(mockPrismaService.perfil.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should not throw error if perfil to remove not found (P2025 error)', async () => {
      const prismaError = new Error('Record not found');
      (prismaError as any).code = 'P2025';
      mockPrismaService.perfil.delete.mockRejectedValue(prismaError);

      await expect(repository.remove(999)).resolves.toBeUndefined();
    });

    it('should rethrow other errors during remove', async () => {
      const prismaError = new Error('Database error');
      (prismaError as any).code = 'P1000'; // Some other Prisma error
      mockPrismaService.perfil.delete.mockRejectedValue(prismaError);

      await expect(repository.remove(1)).rejects.toThrow(prismaError);
    });
  });

  describe('findByNome', () => {
    it('should return a perfil by name', async () => {
      const expectedPerfil = { id: 1, nome: 'Test Perfil' } as Perfil;
      mockPrismaService.perfil.findUnique.mockResolvedValue(expectedPerfil);

      const result = await repository.findByNome('Test Perfil');
      expect(result).toEqual(expectedPerfil);
      expect(mockPrismaService.perfil.findUnique).toHaveBeenCalledWith({
        where: { nome: 'Test Perfil' },
        include: { permissoes: true },
      });
    });

    it('should return null if perfil not found by name', async () => {
      mockPrismaService.perfil.findUnique.mockResolvedValue(null);

      const result = await repository.findByNome('Non Existent');
      expect(result).toBeNull();
      expect(mockPrismaService.perfil.findUnique).toHaveBeenCalledWith({
        where: { nome: 'Non Existent' },
        include: { permissoes: true },
      });
    });
  });

  describe('findByNomeContaining', () => {
    it('should return a list of perfis containing the name and total count', async () => {
      const expectedPerfis = [{ id: 1, nome: 'Test Perfil' }] as Perfil[];
      mockPrismaService.perfil.findMany.mockResolvedValue(expectedPerfis);
      mockPrismaService.perfil.count.mockResolvedValue(1);

      const [data, total] = await repository.findByNomeContaining(
        'Test',
        0,
        10,
      );
      expect(data).toEqual(expectedPerfis);
      expect(total).toBe(1);
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
