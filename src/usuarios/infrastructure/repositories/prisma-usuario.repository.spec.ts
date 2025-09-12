import { Test, TestingModule } from '@nestjs/testing';
import { PrismaUsuarioRepository } from './prisma-usuario.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { Usuario } from '../../domain/entities/usuario.entity';
import { Perfil } from 'src/perfis/domain/entities/perfil.entity';

describe('PrismaUsuarioRepository', () => {
  let repository: PrismaUsuarioRepository;

  const mockPrismaService = {
    usuario: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(), // Added for findAll
      update: jest.fn(), // Added for update, remove, restore
      delete: jest.fn(), // Original delete, now replaced by update for soft delete
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks(); // Clear all mocks before each test
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaUsuarioRepository,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    repository = module.get<PrismaUsuarioRepository>(PrismaUsuarioRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('create', () => {
    it('should create a new user', async () => {
      const createData: Partial<Usuario> = {
        email: 'test@example.com',
        senha: 'hashedPassword',
        perfis: [{ id: 1 } as Perfil],
      };
      const prismaResult = {
        id: 1,
        email: 'test@example.com',
        senha: 'hashedPassword',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null, // Added
      };
      mockPrismaService.usuario.create.mockResolvedValue(prismaResult);

      const result = await repository.create(createData);

      expect(result).toBeInstanceOf(Usuario);
      expect(result.id).toBe(prismaResult.id);
      expect(result.email).toBe(prismaResult.email);
      expect(result.senha).toBe(prismaResult.senha);
      expect(result.createdAt).toEqual(prismaResult.createdAt);
      expect(result.updatedAt).toEqual(prismaResult.updatedAt);
      expect(result.deletedAt).toBeNull(); // Assert deletedAt
      expect(mockPrismaService.usuario.create).toHaveBeenCalledWith({
        data: {
          email: createData.email,
          senha: createData.senha,
          perfis: {
            connect: [{ id: 1 }],
          },
        },
        include: { perfis: true },
      });
    });

    it('should create a new user without password and profiles', async () => {
      const createData: Partial<Usuario> = {
        email: 'test@example.com',
      };
      const prismaResult = {
        id: 1,
        email: 'test@example.com',
        senha: null, // Prisma returns null for optional fields not set
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null, // Added
      };
      mockPrismaService.usuario.create.mockResolvedValue(prismaResult);

      const result = await repository.create(createData);

      expect(result).toBeInstanceOf(Usuario);
      expect(result.senha).toBeUndefined(); // Should be undefined if null from Prisma
      expect(result.deletedAt).toBeNull(); // Assert deletedAt
      expect(mockPrismaService.usuario.create).toHaveBeenCalledWith({
        data: {
          email: createData.email,
          senha: undefined, // Should be undefined if not provided
          perfis: {
            connect: undefined,
          },
        },
        include: { perfis: true },
      });
    });
  });

  describe('findOne', () => {
    const prismaResult = {
      id: 1,
      email: 'test@example.com',
      senha: 'hashedPassword',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      perfis: [
        { id: 1, codigo: 'ADMIN', nome: 'Admin', descricao: 'Admin Profile' },
      ],
    };

    it('should return a user by ID (not deleted)', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(prismaResult);

      const result = await repository.findOne(1);

      expect(result!).toBeInstanceOf(Usuario);
      expect(result!.id).toBe(prismaResult.id);
      expect(result!.deletedAt).toBeNull();
      expect(mockPrismaService.usuario.findUnique).toHaveBeenCalledWith({
        where: { id: 1, deletedAt: null }, // Assert filter
        include: { perfis: true },
      });
    });

    it('should return a user by ID including deleted', async () => {
      const deletedPrismaResult = { ...prismaResult, deletedAt: new Date() };
      mockPrismaService.usuario.findUnique.mockResolvedValue(
        deletedPrismaResult,
      );

      const result = await repository.findOne(1, true); // Pass true for includeDeleted

      expect(result!).toBeInstanceOf(Usuario);
      expect(result!.id).toBe(deletedPrismaResult.id);
      expect(result!.deletedAt).toEqual(deletedPrismaResult.deletedAt);
      expect(mockPrismaService.usuario.findUnique).toHaveBeenCalledWith({
        where: { id: 1 }, // No deletedAt filter
        include: { perfis: true },
      });
    });

    it('should return undefined if user not found', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);

      const result = await repository.findOne(999);
      expect(result).toBeUndefined();
    });

    it('should return undefined if user is soft-deleted and not included', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);

      const result = await repository.findOne(1, false); // Explicitly not include deleted
      expect(result).toBeUndefined();
    });
  });

  describe('findAll', () => {
    const prismaResults = [
      {
        id: 1,
        email: 'test1@example.com',
        senha: 'hashedPassword1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        perfis: [],
      },
      {
        id: 2,
        email: 'test2@example.com',
        senha: 'hashedPassword2',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(), // Soft deleted
        perfis: [],
      },
    ];

    it('should return all non-deleted users by default', async () => {
      mockPrismaService.usuario.findMany.mockResolvedValue([prismaResults[0]]); // Only return non-deleted

      const result = await repository.findAll();

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(Usuario);
      expect(result[0].id).toBe(prismaResults[0].id);
      expect(result[0].deletedAt).toBeNull();
      expect(mockPrismaService.usuario.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null }, // Assert filter
        include: { perfis: true },
      });
    });

    it('should return all users including deleted when specified', async () => {
      mockPrismaService.usuario.findMany.mockResolvedValue(prismaResults); // Return all

      const result = await repository.findAll(true); // Pass true for includeDeleted

      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Usuario);
      expect(result[1]).toBeInstanceOf(Usuario);
      expect(result[0].id).toBe(prismaResults[0].id);
      expect(result[1].id).toBe(prismaResults[1].id);
      expect(result[1].deletedAt).not.toBeNull();
      expect(mockPrismaService.usuario.findMany).toHaveBeenCalledWith({
        where: {}, // No deletedAt filter
        include: { perfis: true },
      });
    });
  });

  describe('update', () => {
    it('should update a user', async () => {
      const updateData: Partial<Usuario> = {
        email: 'updated@example.com',
      };
      const prismaResult = {
        id: 1,
        email: 'updated@example.com',
        senha: 'hashedPassword',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        perfis: [],
      };
      mockPrismaService.usuario.update.mockResolvedValue(prismaResult);

      const result = await repository.update(1, updateData);

      expect(result).toBeInstanceOf(Usuario);
      expect(result.email).toBe(updateData.email);
      expect(mockPrismaService.usuario.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          email: updateData.email,
          perfis: undefined, // No perfis in updateData
        },
        include: { perfis: true },
      });
    });
  });

  describe('remove', () => {
    it('should soft delete a user', async () => {
      const prismaResult = {
        id: 1,
        email: 'test@example.com',
        senha: 'hashedPassword',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(), // Expected to be set
        perfis: [],
      };
      mockPrismaService.usuario.update.mockResolvedValue(prismaResult);

      const result = await repository.remove(1);

      expect(result).toBeInstanceOf(Usuario);
      expect(result.id).toBe(prismaResult.id);
      expect(result.deletedAt).not.toBeNull(); // Assert deletedAt is set
      expect(mockPrismaService.usuario.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deletedAt: expect.any(Date) },
        include: { perfis: true },
      });
    });

    it('should throw error if user not found during soft delete', async () => {
      mockPrismaService.usuario.update.mockRejectedValue({ code: 'P2025' }); // Simulate not found

      await expect(repository.remove(999)).rejects.toThrow(
        'Usuário com ID 999 não encontrado.',
      );
    });
  });

  describe('restore', () => {
    it('should restore a soft-deleted user', async () => {
      const prismaResult = {
        id: 1,
        email: 'test@example.com',
        senha: 'hashedPassword',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null, // Expected to be null after restore
        perfis: [],
      };
      mockPrismaService.usuario.update.mockResolvedValue(prismaResult);

      const result = await repository.restore(1);

      expect(result).toBeInstanceOf(Usuario);
      expect(result.id).toBe(prismaResult.id);
      expect(result.deletedAt).toBeNull(); // Assert deletedAt is null
      expect(mockPrismaService.usuario.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deletedAt: null },
        include: { perfis: true },
      });
    });

    it('should throw error if user not found during restore', async () => {
      mockPrismaService.usuario.update.mockRejectedValue({ code: 'P2025' }); // Simulate not found

      await expect(repository.restore(999)).rejects.toThrow(
        'Usuário com ID 999 não encontrado.',
      );
    });
  });
});
