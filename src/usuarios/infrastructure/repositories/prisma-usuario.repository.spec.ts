import { Test, TestingModule } from '@nestjs/testing';
import { PrismaUsuarioRepository } from './prisma-usuario.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { Usuario } from '../../domain/entities/usuario.entity';

describe('PrismaUsuarioRepository', () => {
  let repository: PrismaUsuarioRepository;

  const mockUsuarioModel = {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  };

  const mockPrismaService = {
    usuario: mockUsuarioModel,
    extended: {
      usuario: mockUsuarioModel,
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
      mockUsuarioModel.create.mockResolvedValue(mockPrismaUser);

      const result = await repository.create(createData);

      expect(result).toBeInstanceOf(Usuario);
      expect(result.id).toBe(mockPrismaUser.id);
      expect(mockUsuarioModel.create).toHaveBeenCalled();
    });

    it('deve lançar erro original se o Prisma falhar por outro motivo', async () => {
      mockUsuarioModel.create.mockRejectedValue(new Error('DB Error'));
      await expect(
        repository.create({ email: 'test@test.com' }),
      ).rejects.toThrow('DB Error');
    });
  });

  describe('busca por um', () => {
    it('deve retornar um usuário por ID', async () => {
      mockUsuarioModel.findUnique.mockResolvedValue(mockPrismaUser);
      const result = await repository.findOne(1);
      expect(result?.id).toBe(1);
    });

    it('deve retornar undefined se o usuário não for encontrado', async () => {
      mockUsuarioModel.findUnique.mockResolvedValue(null);
      const result = await repository.findOne(999);
      expect(result).toBeUndefined();
    });
  });

  describe('busca de todos', () => {
    it('deve retornar usuários paginados', async () => {
      mockUsuarioModel.findMany.mockResolvedValue([mockPrismaUser]);
      mockUsuarioModel.count.mockResolvedValue(1);

      const result = await repository.findAll({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockUsuarioModel.findMany).toHaveBeenCalled();
    });

    it('deve retornar inclusive deletados se includeDeleted for true', async () => {
      mockUsuarioModel.findMany.mockResolvedValue([mockPrismaUser]);
      mockUsuarioModel.count.mockResolvedValue(1);

      await repository.findAll({ page: 1, limit: 10 }, true);

      expect(mockUsuarioModel.findMany).toHaveBeenCalled();
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
      mockUsuarioModel.findUnique.mockResolvedValue(userWithRelations);

      const result =
        await repository.findByEmailWithPerfisAndPermissoes('test@test.com');

      expect(result?.empresas).toHaveLength(1);
      const empresa = result?.empresas?.[0];
      if (empresa && empresa.perfis) {
        expect(empresa.perfis[0].nome).toBe('Admin');
      }
    });

    it('deve retornar null se o usuário não for encontrado', async () => {
      mockUsuarioModel.findUnique.mockResolvedValue(null);
      const result =
        await repository.findByEmailWithPerfisAndPermissoes('ghost@test.com');
      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('deve retornar um usuário por email', async () => {
      mockUsuarioModel.findUnique.mockResolvedValue(mockPrismaUser);
      const result = await repository.findByEmail('test@test.com');
      expect(result?.email).toBe('test@test.com');
    });

    it('deve retornar null se email não for encontrado', async () => {
      mockUsuarioModel.findUnique.mockResolvedValue(null);
      const result = await repository.findByEmail('ghost@test.com');
      expect(result).toBeNull();
    });
  });

  describe('atualização e remoção', () => {
    it('deve atualizar um usuário', async () => {
      mockUsuarioModel.update.mockResolvedValue(mockPrismaUser);
      const result = await repository.update(1, { email: 'new@test.com' });
      expect(result.email).toBe(mockPrismaUser.email);
    });

    it('remove deve lançar erro formatado quando ID não existe (P2025)', async () => {
      const error = new Error('Record not found');
      (error as any).code = 'P2025';
      mockUsuarioModel.delete.mockRejectedValue(error);

      await expect(repository.remove(999)).rejects.toThrow(
        'Usuário com ID 999 não encontrado.',
      );
    });

    it('restore deve lançar erro formatado quando ID não existe (P2025)', async () => {
      const error = new Error('Record not found');
      (error as any).code = 'P2025';
      mockUsuarioModel.update.mockRejectedValue(error);

      await expect(repository.restore(999)).rejects.toThrow(
        'Usuário com ID 999 não encontrado.',
      );
    });

    it('remove deve disparar erro genérico se falha do Prisma não for P2025', async () => {
      const error = new Error('Generic DB Error');
      mockUsuarioModel.delete.mockRejectedValue(error);

      await expect(repository.remove(1)).rejects.toThrow('Generic DB Error');
    });

    it('restore deve disparar erro genérico se falha do Prisma não for P2025', async () => {
      const error = new Error('Generic DB Error');
      mockUsuarioModel.update.mockRejectedValue(error);

      await expect(repository.restore(1)).rejects.toThrow('Generic DB Error');
    });
  });
});
