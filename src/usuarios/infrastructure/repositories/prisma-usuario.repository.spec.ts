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

  const mockPrismaUser = {
    id: 1,
    email: 'test@test.com',
    senha: 'hashedPassword',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ativo: true,
  };

  describe('criação', () => {
    it('deve criar um novo usuário', async () => {
      const createData: Partial<Usuario> = {
        email: 'test@example.com',
        senha: 'hashedPassword',
      };
      mockPrismaService.usuario.create.mockResolvedValue(mockPrismaUser);

      const result = await repository.create(createData);

      expect(result).toBeInstanceOf(Usuario);
      expect(result.id).toBe(mockPrismaUser.id);
      expect(mockPrismaService.usuario.create).toHaveBeenCalled();
    });

    it('deve lançar erro original se o Prisma falhar por outro motivo', async () => {
      mockPrismaService.usuario.create.mockRejectedValue(new Error('DB Error'));
      await expect(
        repository.create({ email: 'test@test.com' }),
      ).rejects.toThrow('DB Error');
    });
  });

  describe('busca por um', () => {
    it('deve retornar um usuário por ID', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(mockPrismaUser);
      const result = await repository.findOne(1);
      expect(result?.id).toBe(1);
    });

    it('deve retornar undefined se o usuário não for encontrado', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);
      const result = await repository.findOne(999);
      expect(result).toBeUndefined();
    });
  });

  describe('busca de todos', () => {
    it('deve retornar usuários paginados', async () => {
      mockPrismaService.usuario.findMany.mockResolvedValue([mockPrismaUser]);
      mockPrismaService.usuario.count.mockResolvedValue(1);

      const result = await repository.findAll({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockPrismaService.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null },
        }),
      );
    });

    it('deve retornar inclusive deletados se includeDeleted for true', async () => {
      mockPrismaService.usuario.findMany.mockResolvedValue([mockPrismaUser]);
      mockPrismaService.usuario.count.mockResolvedValue(1);

      await repository.findAll({ page: 1, limit: 10 }, true);

      expect(mockPrismaService.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );
    });
  });

  describe('findByEmailWithPerfisAndPermissoes', () => {
    it('deve retornar usuário com relações carregadas', async () => {
      const userWithRelations = {
        ...mockPrismaUser,
        empresas: [
          {
            id: 1,
            empresaId: 'emp-1',
            perfis: [
              {
                id: 1,
                nome: 'Admin',
                permissoes: [{ id: 1, codigo: 'READ' }],
              },
            ],
          },
        ],
      };
      mockPrismaService.usuario.findUnique.mockResolvedValue(userWithRelations);

      const result =
        await repository.findByEmailWithPerfisAndPermissoes('test@test.com');

      expect(result?.empresas).toHaveLength(1);
      const empresa = result?.empresas?.[0];
      if (empresa && empresa.perfis) {
        expect(empresa.perfis[0].nome).toBe('Admin');
      }
    });

    it('deve retornar null se o usuário não for encontrado', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);
      const result =
        await repository.findByEmailWithPerfisAndPermissoes('ghost@test.com');
      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('deve retornar um usuário por email', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(mockPrismaUser);
      const result = await repository.findByEmail('test@test.com');
      expect(result?.email).toBe('test@test.com');
    });

    it('deve retornar null se email não for encontrado', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);
      const result = await repository.findByEmail('ghost@test.com');
      expect(result).toBeNull();
    });
  });

  describe('atualização e remoção', () => {
    it('deve atualizar um usuário', async () => {
      mockPrismaService.usuario.update.mockResolvedValue(mockPrismaUser);
      const result = await repository.update(1, { email: 'new@test.com' });
      expect(result.email).toBe(mockPrismaUser.email);
    });

    it('remove deve lançar erro formatado quando ID não existe (P2025)', async () => {
      const error = new Error('Record not found');
      (error as any).code = 'P2025';
      mockPrismaService.usuario.update.mockRejectedValue(error);

      await expect(repository.remove(999)).rejects.toThrow(
        'Usuário com ID 999 não encontrado.',
      );
    });

    it('restore deve lançar erro formatado quando ID não existe (P2025)', async () => {
      const error = new Error('Record not found');
      (error as any).code = 'P2025';
      mockPrismaService.usuario.update.mockRejectedValue(error);

      await expect(repository.restore(999)).rejects.toThrow(
        'Usuário com ID 999 não encontrado.',
      );
    });

    it('remove deve disparar erro genérico se falha do Prisma não for P2025', async () => {
      const error = new Error('Generic DB Error');
      mockPrismaService.usuario.update.mockRejectedValue(error);

      await expect(repository.remove(1)).rejects.toThrow('Generic DB Error');
    });

    it('restore deve disparar erro genérico se falha do Prisma não for P2025', async () => {
      const error = new Error('Generic DB Error');
      mockPrismaService.usuario.update.mockRejectedValue(error);

      await expect(repository.restore(1)).rejects.toThrow('Generic DB Error');
    });
  });
});
