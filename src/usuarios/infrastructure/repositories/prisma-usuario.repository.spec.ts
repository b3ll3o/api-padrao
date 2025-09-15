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

  it('deve ser definido', () => {
    expect(repository).toBeDefined();
  });

  describe('criação', () => {
    it('deve criar um novo usuário com perfis', async () => {
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

    it('deve criar um novo usuário sem senha e perfis', async () => {
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

  describe('busca por um', () => {
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

    it('deve retornar um usuário por ID (não excluído)', async () => {
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

    it('deve retornar um usuário por ID, incluindo os excluídos', async () => {
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

    it('deve retornar undefined se o usuário não for encontrado', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);

      const result = await repository.findOne(999);
      expect(result).toBeUndefined();
    });

    it('deve retornar undefined se o usuário estiver com soft delete e não for incluído', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);

      const result = await repository.findOne(1, false);
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

    it('deve retornar todos os usuários não excluídos por padrão', async () => {
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

    it('deve retornar todos os usuários, incluindo os excluídos, quando especificado', async () => {
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

    it('deve retornar null se o usuário estiver com soft delete', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);

      const result = await repository.findByEmail('test@example.com');
      expect(result).toBeNull();
    });
  });

  describe('busca por email com perfis e permissões', () => {
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

    it('deve retornar um usuário com perfis e permissões', async () => {
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

    it('deve retornar um usuário sem perfis ou permissões', async () => {
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

    it('deve retornar null se o usuário não for encontrado por email', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);

      const result = await repository.findByEmailWithPerfisAndPermissoes(
        'nonexistent@example.com',
      );
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

    it('deve atualizar um usuário com novos perfis', async () => {
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

    it('deve atualizar um usuário sem perfis', async () => {
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

  describe('remoção', () => {
    it('deve realizar soft delete de um usuário', async () => {
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

    it('deve lançar um erro se o usuário não for encontrado durante a restauração', async () => {
      mockPrismaService.usuario.update.mockRejectedValue({ code: 'P2025' });

      await expect(repository.restore(999)).rejects.toThrow(
        'Usuário com ID 999 não encontrado.',
      );
    });
  });
});
