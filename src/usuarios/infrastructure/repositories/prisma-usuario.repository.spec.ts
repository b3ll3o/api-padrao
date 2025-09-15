import { Test, TestingModule } from '@nestjs/testing';
import { PrismaUsuarioRepository } from './prisma-usuario.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { Usuario } from '../../domain/entities/usuario.entity';
import { Perfil } from 'src/perfis/domain/entities/perfil.entity';
import { Permissao } from 'src/permissoes/domain/entities/permissao.entity';

describe('PrismaUsuarioRepository', () => {
  let repository: PrismaUsuarioRepository;

  const mockPrismaService = {
    usuario: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
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
    it('should create a new user with profiles', async () => {
      const createData: Partial<Usuario> = {
        email: 'test@example.com',
        senha: 'hashedPassword',
        perfis: [
          {
            id: 1,
            codigo: 'ADMIN',
            nome: 'Admin',
            descricao: 'Admin Profile',
          } as Perfil,
        ],
      };
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
      mockPrismaService.usuario.create.mockResolvedValue(prismaResult);

      const result = await repository.create(createData);

      expect(result).toBeInstanceOf(Usuario);
      expect(result.id).toBe(prismaResult.id);
      expect(result.email).toBe(prismaResult.email);
      expect(result.senha).toBe(prismaResult.senha);
      expect(result.createdAt).toEqual(prismaResult.createdAt);
      expect(result.updatedAt).toEqual(prismaResult.updatedAt);
      expect(result.deletedAt).toBeNull();
      expect(result.perfis).toHaveLength(1);
      expect(result.perfis![0]).toBeInstanceOf(Perfil);
      expect(result.perfis![0].codigo).toBe('ADMIN');
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
        senha: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        perfis: [],
      };
      mockPrismaService.usuario.create.mockResolvedValue(prismaResult);

      const result = await repository.create(createData);

      expect(result).toBeInstanceOf(Usuario);
      expect(result.senha).toBeUndefined();
      expect(result.deletedAt).toBeNull();
      expect(result.perfis).toHaveLength(0);
      expect(mockPrismaService.usuario.create).toHaveBeenCalledWith({
        data: {
          email: createData.email,
          senha: undefined,
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
      expect(result!.perfis).toHaveLength(1);
      expect(result!.perfis![0]).toBeInstanceOf(Perfil);
      expect(mockPrismaService.usuario.findUnique).toHaveBeenCalledWith({
        where: { id: 1, deletedAt: null },
        include: { perfis: true },
      });
    });

    it('should return a user by ID including deleted', async () => {
      const deletedPrismaResult = { ...prismaResult, deletedAt: new Date() };
      mockPrismaService.usuario.findUnique.mockResolvedValue(
        deletedPrismaResult,
      );

      const result = await repository.findOne(1, true);

      expect(result!).toBeInstanceOf(Usuario);
      expect(result!.id).toBe(deletedPrismaResult.id);
      expect(result!.deletedAt).toEqual(deletedPrismaResult.deletedAt);
      expect(result!.perfis).toHaveLength(1);
      expect(result!.perfis![0]).toBeInstanceOf(Perfil);
      expect(mockPrismaService.usuario.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
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

      const result = await repository.findOne(1, false);
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
        perfis: [
          { id: 1, codigo: 'USER', nome: 'User', descricao: 'User Profile' },
        ],
      },
      {
        id: 2,
        email: 'test2@example.com',
        senha: 'hashedPassword2',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
        perfis: [],
      },
    ];

    it('should return all non-deleted users by default', async () => {
      mockPrismaService.usuario.findMany.mockResolvedValue([prismaResults[0]]);

      const result = await repository.findAll();

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(Usuario);
      expect(result[0].id).toBe(prismaResults[0].id);
      expect(result[0].deletedAt).toBeNull();
      expect(result[0].perfis).toHaveLength(1);
      expect(result[0].perfis![0]).toBeInstanceOf(Perfil);
      expect(mockPrismaService.usuario.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        include: { perfis: true },
      });
    });

    it('should return all users including deleted when specified', async () => {
      mockPrismaService.usuario.findMany.mockResolvedValue(prismaResults);

      const result = await repository.findAll(true);

      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Usuario);
      expect(result[1]).toBeInstanceOf(Usuario);
      expect(result[0].id).toBe(prismaResults[0].id);
      expect(result[1].id).toBe(prismaResults[1].id);
      expect(result[1].deletedAt).not.toBeNull();
      expect(mockPrismaService.usuario.findMany).toHaveBeenCalledWith({
        where: {},
        include: { perfis: true },
      });
    });
  });

  describe('findByEmail', () => {
    const prismaResult = {
      id: 1,
      email: 'test@example.com',
      senha: 'hashedPassword',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    it('should return a user by email', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(prismaResult);

      const result = await repository.findByEmail('test@example.com');

      expect(result).toBeInstanceOf(Usuario);
      expect(result!.email).toBe('test@example.com');
      expect(mockPrismaService.usuario.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com', deletedAt: null },
      });
    });

    it('should return null if user not found by email', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);

      const result = await repository.findByEmail('nonexistent@example.com');
      expect(result).toBeNull();
    });

    it('should return null if user is soft-deleted', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);

      const result = await repository.findByEmail('test@example.com');
      expect(result).toBeNull();
    });
  });

  describe('findByEmailWithPerfisAndPermissoes', () => {
    const prismaResult = {
      id: 1,
      email: 'test@example.com',
      senha: 'hashedPassword',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      perfis: [
        {
          id: 1,
          codigo: 'ADMIN',
          nome: 'Admin',
          descricao: 'Admin Profile',
          permissoes: [
            {
              id: 1,
              codigo: 'CREATE_USER',
              nome: 'Create User',
              descricao: 'Create User Permission',
            },
          ],
        },
      ],
    };

    it('should return a user with profiles and permissions', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(prismaResult);

      const result =
        await repository.findByEmailWithPerfisAndPermissoes('test@example.com');

      expect(result).toBeInstanceOf(Usuario);
      expect(result!.email).toBe('test@example.com');
      expect(result!.perfis).toHaveLength(1);
      expect(result!.perfis![0]).toBeInstanceOf(Perfil);
      expect(result!.perfis![0].codigo).toBe('ADMIN');
      expect(result!.perfis![0].permissoes).toHaveLength(1);
      expect(result!.perfis![0].permissoes![0]).toBeInstanceOf(Permissao);
      expect(result!.perfis![0].permissoes![0].codigo).toBe('CREATE_USER');
      expect(mockPrismaService.usuario.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com', deletedAt: null },
        include: {
          perfis: {
            include: {
              permissoes: true,
            },
          },
        },
      });
    });

    it('should return a user with no profiles or permissions', async () => {
      const prismaResultNoPerfis = { ...prismaResult, perfis: [] };
      mockPrismaService.usuario.findUnique.mockResolvedValue(
        prismaResultNoPerfis,
      );

      const result =
        await repository.findByEmailWithPerfisAndPermissoes('test@example.com');

      expect(result).toBeInstanceOf(Usuario);
      expect(result!.email).toBe('test@example.com');
      expect(result!.perfis).toHaveLength(0);
    });

    it('should return null if user not found by email', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);

      const result = await repository.findByEmailWithPerfisAndPermissoes(
        'nonexistent@example.com',
      );
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update a user email', async () => {
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
          perfis: undefined,
        },
        include: { perfis: true },
      });
    });

    it('should update a user with new profiles', async () => {
      const updateData: Partial<Usuario> = {
        perfis: [
          {
            id: 2,
            codigo: 'USER',
            nome: 'User',
            descricao: 'User Profile',
          } as Perfil,
        ],
      };
      const prismaResult = {
        id: 1,
        email: 'test@example.com',
        senha: 'hashedPassword',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        perfis: [
          { id: 2, codigo: 'USER', nome: 'User', descricao: 'User Profile' },
        ],
      };
      mockPrismaService.usuario.update.mockResolvedValue(prismaResult);

      const result = await repository.update(1, updateData);

      expect(result).toBeInstanceOf(Usuario);
      expect(result.perfis).toHaveLength(1);
      expect(result.perfis![0].codigo).toBe('USER');
      expect(mockPrismaService.usuario.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          perfis: {
            set: [{ id: 2 }],
          },
        },
        include: { perfis: true },
      });
    });

    it('should update a user with no profiles', async () => {
      const updateData: Partial<Usuario> = {
        perfis: [],
      };
      const prismaResult = {
        id: 1,
        email: 'test@example.com',
        senha: 'hashedPassword',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        perfis: [],
      };
      mockPrismaService.usuario.update.mockResolvedValue(prismaResult);

      const result = await repository.update(1, updateData);

      expect(result).toBeInstanceOf(Usuario);
      expect(result.perfis).toHaveLength(0);
      expect(mockPrismaService.usuario.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          perfis: {
            set: [],
          },
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
        deletedAt: new Date(),
        perfis: [],
      };
      mockPrismaService.usuario.update.mockResolvedValue(prismaResult);

      const result = await repository.remove(1);

      expect(result).toBeInstanceOf(Usuario);
      expect(result.id).toBe(prismaResult.id);
      expect(result.deletedAt).not.toBeNull();
      expect(mockPrismaService.usuario.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deletedAt: expect.any(Date) },
        include: { perfis: true },
      });
    });

    it('should throw error if user not found during soft delete', async () => {
      mockPrismaService.usuario.update.mockRejectedValue({ code: 'P2025' });

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
        deletedAt: null,
        perfis: [],
      };
      mockPrismaService.usuario.update.mockResolvedValue(prismaResult);

      const result = await repository.restore(1);

      expect(result).toBeInstanceOf(Usuario);
      expect(result.id).toBe(prismaResult.id);
      expect(result.deletedAt).toBeNull();
      expect(mockPrismaService.usuario.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deletedAt: null },
        include: { perfis: true },
      });
    });

    it('should throw error if user not found during restore', async () => {
      mockPrismaService.usuario.update.mockRejectedValue({ code: 'P2025' });

      await expect(repository.restore(999)).rejects.toThrow(
        'Usuário com ID 999 não encontrado.',
      );
    });
  });
});
