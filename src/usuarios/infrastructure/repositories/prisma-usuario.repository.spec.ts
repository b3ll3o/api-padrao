import { Test, TestingModule } from '@nestjs/testing';
import { PrismaUsuarioRepository } from './prisma-usuario.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { Usuario } from '../../domain/entities/usuario.entity';

describe('PrismaUsuarioRepository', () => {
  let repository: PrismaUsuarioRepository;

  const mockPrismaService = {
    usuario: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
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

  it('deve ser definido', () => {
    expect(repository).toBeDefined();
  });

  describe('criação', () => {
    it('deve criar um novo usuário', async () => {
      const createData: Partial<Usuario> = {
        email: 'test@example.com',
        senha: 'hashedPassword',
      };
      const prismaResult = {
        id: 1,
        email: 'test@example.com',
        senha: 'hashedPassword',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
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
      expect(mockPrismaService.usuario.create).toHaveBeenCalledWith({
        data: {
          email: createData.email,
          senha: createData.senha,
        },
      });
    });
  });

  describe('busca por um', () => {
    const prismaResult = {
      id: 1,
      email: 'test@example.com',
      senha: 'hashedPassword',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    it('deve retornar um usuário por ID (não excluído)', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(prismaResult);

      const result = await repository.findOne(1);

      expect(result!).toBeInstanceOf(Usuario);
      expect(result!.id).toBe(prismaResult.id);
      expect(result!.deletedAt).toBeNull();
      expect(mockPrismaService.usuario.findUnique).toHaveBeenCalledWith({
        where: { id: 1, deletedAt: null },
      });
    });

    it('deve retornar um usuário por ID, incluindo os excluídos', async () => {
      const deletedPrismaResult = { ...prismaResult, deletedAt: new Date() };
      mockPrismaService.usuario.findUnique.mockResolvedValue(
        deletedPrismaResult,
      );

      const result = await repository.findOne(1, true);

      expect(result!).toBeInstanceOf(Usuario);
      expect(result!.id).toBe(deletedPrismaResult.id);
      expect(result!.deletedAt).toEqual(deletedPrismaResult.deletedAt);
      expect(mockPrismaService.usuario.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('deve retornar undefined se o usuário não for encontrado', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);

      const result = await repository.findOne(999);
      expect(result).toBeUndefined();
    });
  });

  describe('busca de todos', () => {
    const prismaResults = [
      {
        id: 1,
        email: 'test1@example.com',
        senha: 'hashedPassword1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      {
        id: 2,
        email: 'test2@example.com',
        senha: 'hashedPassword2',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
      },
    ];

    it('deve retornar todos os usuários não excluídos por padrão', async () => {
      mockPrismaService.usuario.findMany.mockResolvedValue([prismaResults[0]]);
      mockPrismaService.usuario.count.mockResolvedValue(1);

      const paginationDto = { page: 1, limit: 10 };
      const result = await repository.findAll(paginationDto);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toBeInstanceOf(Usuario);
      expect(result.data[0].id).toBe(prismaResults[0].id);
      expect(result.total).toBe(1);
      expect(mockPrismaService.usuario.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('deve retornar todos os usuários, incluindo os excluídos, quando especificado', async () => {
      mockPrismaService.usuario.findMany.mockResolvedValue(prismaResults);
      mockPrismaService.usuario.count.mockResolvedValue(2);

      const paginationDto = { page: 1, limit: 10 };
      const result = await repository.findAll(paginationDto, true);

      expect(result.data).toHaveLength(2);
      expect(result.data[1].deletedAt).not.toBeNull();
      expect(mockPrismaService.usuario.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('busca por email', () => {
    const prismaResult = {
      id: 1,
      email: 'test@example.com',
      senha: 'hashedPassword',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    it('deve retornar um usuário por email', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(prismaResult);

      const result = await repository.findByEmail('test@example.com');

      expect(result).toBeInstanceOf(Usuario);
      expect(result!.email).toBe('test@example.com');
      expect(mockPrismaService.usuario.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com', deletedAt: null },
      });
    });

    it('deve retornar null se o usuário não for encontrado por email', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);

      const result = await repository.findByEmail('nonexistent@example.com');
      expect(result).toBeNull();
    });
  });

  describe('atualização', () => {
    it('deve atualizar o email de um usuário', async () => {
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
      };
      mockPrismaService.usuario.update.mockResolvedValue(prismaResult);

      const result = await repository.update(1, updateData);

      expect(result).toBeInstanceOf(Usuario);
      expect(result.email).toBe(updateData.email);
      expect(mockPrismaService.usuario.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          email: updateData.email,
        },
      });
    });
  });

  describe('remoção', () => {
    it('deve realizar soft delete de um usuário', async () => {
      const prismaResult = {
        id: 1,
        email: 'test@example.com',
        senha: 'hashedPassword',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
      };
      mockPrismaService.usuario.update.mockResolvedValue(prismaResult);

      const result = await repository.remove(1);

      expect(result).toBeInstanceOf(Usuario);
      expect(result.id).toBe(prismaResult.id);
      expect(result.deletedAt).not.toBeNull();
      expect(mockPrismaService.usuario.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deletedAt: expect.any(Date), ativo: false },
      });
    });

    it('deve lançar um erro se o usuário não for encontrado durante o soft delete', async () => {
      mockPrismaService.usuario.update.mockRejectedValue({ code: 'P2025' });

      await expect(repository.remove(999)).rejects.toThrow(
        'Usuário com ID 999 não encontrado.',
      );
    });
  });

  describe('restauração', () => {
    it('deve restaurar um usuário com soft delete', async () => {
      const prismaResult = {
        id: 1,
        email: 'test@example.com',
        senha: 'hashedPassword',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      mockPrismaService.usuario.update.mockResolvedValue(prismaResult);

      const result = await repository.restore(1);

      expect(result).toBeInstanceOf(Usuario);
      expect(result.id).toBe(prismaResult.id);
      expect(result.deletedAt).toBeNull();
      expect(mockPrismaService.usuario.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deletedAt: null, ativo: true },
      });
    });

    it('deve lançar um erro se o usuário não for encontrado durante a restauração', async () => {
      mockPrismaService.usuario.update.mockRejectedValue({ code: 'P2025' });

      await expect(repository.restore(999)).rejects.toThrow(
        'Usuário com ID 999 não encontrado.',
      );
    });
  });
});
