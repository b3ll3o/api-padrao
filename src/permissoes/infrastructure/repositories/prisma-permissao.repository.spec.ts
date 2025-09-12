import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPermissaoRepository } from './prisma-permissao.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreatePermissaoDto } from '../../dto/create-permissao.dto';
import { UpdatePermissaoDto } from '../../dto/update-permissao.dto';
import { Permissao } from '../../domain/entities/permissao.entity';

describe('PrismaPermissaoRepository', () => {
  let repository: PrismaPermissaoRepository;
  let prismaService: PrismaService;

  const mockPrismaService = {
    permissao: {
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
        PrismaPermissaoRepository,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    repository = module.get<PrismaPermissaoRepository>(PrismaPermissaoRepository);
    prismaService = module.get<PrismaService>(PrismaService);
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
      const expectedPermissao = { id: 1, ...createPermissaoDto } as Permissao;

      mockPrismaService.permissao.create.mockResolvedValue(expectedPermissao);

      const result = await repository.create(createPermissaoDto);
      expect(result).toEqual(expectedPermissao);
      expect(mockPrismaService.permissao.create).toHaveBeenCalledWith({
        data: createPermissaoDto,
      });
    });
  });

  describe('findAll', () => {
    it('should return a list of permissoes and total count', async () => {
      const expectedPermissoes = [{ id: 1, nome: 'Permissao 1' }] as Permissao[];
      mockPrismaService.permissao.findMany.mockResolvedValue(expectedPermissoes);
      mockPrismaService.permissao.count.mockResolvedValue(1);

      const [data, total] = await repository.findAll(0, 10);
      expect(data).toEqual(expectedPermissoes);
      expect(total).toBe(1);
      expect(mockPrismaService.permissao.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
      });
      expect(mockPrismaService.permissao.count).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single permissao by ID', async () => {
      const expectedPermissao = { id: 1, nome: 'Permissao 1' } as Permissao;
      mockPrismaService.permissao.findUnique.mockResolvedValue(expectedPermissao);

      const result = await repository.findOne(1);
      expect(result).toEqual(expectedPermissao);
      expect(mockPrismaService.permissao.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should return undefined if permissao not found', async () => {
      mockPrismaService.permissao.findUnique.mockResolvedValue(null);

      const result = await repository.findOne(999);
      expect(result).toBeUndefined();
      expect(mockPrismaService.permissao.findUnique).toHaveBeenCalledWith({
        where: { id: 999 },
      });
    });
  });

  describe('update', () => {
    it('should update an existing permissao', async () => {
      const updatePermissaoDto: UpdatePermissaoDto = { nome: 'Updated Permissao' };
      const expectedPermissao = { id: 1, ...updatePermissaoDto } as Permissao;
      mockPrismaService.permissao.update.mockResolvedValue(expectedPermissao);

      const result = await repository.update(1, updatePermissaoDto);
      expect(result).toEqual(expectedPermissao);
      expect(mockPrismaService.permissao.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: updatePermissaoDto,
      });
    });

    it('should return undefined if permissao to update not found (P2025 error)', async () => {
      const updatePermissaoDto: UpdatePermissaoDto = { nome: 'Non Existent' };
      const prismaError = new Error('Record not found');
      (prismaError as any).code = 'P2025';
      mockPrismaService.permissao.update.mockRejectedValue(prismaError);

      const result = await repository.update(999, updatePermissaoDto);
      expect(result).toBeUndefined();
    });

    it('should rethrow other errors during update', async () => {
      const updatePermissaoDto: UpdatePermissaoDto = { nome: 'Error Permissao' };
      const prismaError = new Error('Database error');
      (prismaError as any).code = 'P1000'; // Some other Prisma error
      mockPrismaService.permissao.update.mockRejectedValue(prismaError);

      await expect(repository.update(1, updatePermissaoDto)).rejects.toThrow(prismaError);
    });
  });

  describe('remove', () => {
    it('should remove a permissao', async () => {
      mockPrismaService.permissao.delete.mockResolvedValue(undefined);

      await expect(repository.remove(1)).resolves.toBeUndefined();
      expect(mockPrismaService.permissao.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('should not throw error if permissao to remove not found (P2025 error)', async () => {
      const prismaError = new Error('Record not found');
      (prismaError as any).code = 'P2025';
      mockPrismaService.permissao.delete.mockRejectedValue(prismaError);

      await expect(repository.remove(999)).resolves.toBeUndefined();
    });

    it('should rethrow other errors during remove', async () => {
      const prismaError = new Error('Database error');
      (prismaError as any).code = 'P1000'; // Some other Prisma error
      mockPrismaService.permissao.delete.mockRejectedValue(prismaError);

      await expect(repository.remove(1)).rejects.toThrow(prismaError);
    });
  });

  describe('findByNome', () => {
    it('should return a permissao by name', async () => {
      const expectedPermissao = { id: 1, nome: 'Test Permissao' } as Permissao;
      mockPrismaService.permissao.findUnique.mockResolvedValue(expectedPermissao);

      const result = await repository.findByNome('Test Permissao');
      expect(result).toEqual(expectedPermissao);
      expect(mockPrismaService.permissao.findUnique).toHaveBeenCalledWith({
        where: { nome: 'Test Permissao' },
      });
    });

    it('should return null if permissao not found by name', async () => {
      mockPrismaService.permissao.findUnique.mockResolvedValue(null);

      const result = await repository.findByNome('Non Existent');
      expect(result).toBeNull();
      expect(mockPrismaService.permissao.findUnique).toHaveBeenCalledWith({
        where: { nome: 'Non Existent' },
      });
    });
  });

  describe('findByNomeContaining', () => {
    it('should return a list of permissoes containing the name and total count', async () => {
      const expectedPermissoes = [{ id: 1, nome: 'Test Permissao' }] as Permissao[];
      mockPrismaService.permissao.findMany.mockResolvedValue(expectedPermissoes);
      mockPrismaService.permissao.count.mockResolvedValue(1);

      const [data, total] = await repository.findByNomeContaining('Test', 0, 10);
      expect(data).toEqual(expectedPermissoes);
      expect(total).toBe(1);
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

      const [data, total] = await repository.findByNomeContaining('Non Existent', 0, 10);
      expect(data).toEqual([]);
      expect(total).toBe(0);
    });
  });
});
