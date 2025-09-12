import { Test, TestingModule } from '@nestjs/testing';
import { PrismaUsuarioRepository } from './prisma-usuario.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { Usuario } from '../../domain/entities/usuario.entity';
import { Perfil } from 'src/perfis/domain/entities/perfil.entity';
import { Permissao } from 'src/permissoes/domain/entities/permissao.entity';

describe('PrismaUsuarioRepository', () => {
  let repository: PrismaUsuarioRepository;
  let prismaService: PrismaService;

  const mockPrismaService = {
    usuario: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
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
    prismaService = module.get<PrismaService>(PrismaService);
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
      };
      mockPrismaService.usuario.create.mockResolvedValue(prismaResult);

      const result = await repository.create(createData);

      expect(result).toBeInstanceOf(Usuario);
      expect(result.id).toBe(prismaResult.id);
      expect(result.email).toBe(prismaResult.email);
      expect(result.senha).toBe(prismaResult.senha);
      expect(result.createdAt).toEqual(prismaResult.createdAt);
      expect(result.updatedAt).toEqual(prismaResult.updatedAt);
      expect(mockPrismaService.usuario.create).toHaveBeenCalledWith({
        data: {
          email: createData.email,
          senha: createData.senha,
          perfis: {
            connect: [{ id: 1 }],
          },
        },
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
      };
      mockPrismaService.usuario.create.mockResolvedValue(prismaResult);

      const result = await repository.create(createData);

      expect(result).toBeInstanceOf(Usuario);
      expect(result.senha).toBeUndefined(); // Should be undefined if null from Prisma
      expect(mockPrismaService.usuario.create).toHaveBeenCalledWith({
        data: {
          email: createData.email,
          senha: undefined, // Should be undefined if not provided
          perfis: {
            connect: undefined,
          },
        },
      });
    });
  });

  describe('findOne', () => {
    it('should return a user by ID', async () => {
      const prismaResult = {
        id: 1,
        email: 'test@example.com',
        senha: 'hashedPassword',
        createdAt: new Date(),
        updatedAt: new Date(),
        perfis: [{ id: 1, codigo: 'ADMIN', nome: 'Admin', descricao: 'Admin Profile' }],
      };
      mockPrismaService.usuario.findUnique.mockResolvedValue(prismaResult);

      const result = await repository.findOne(1);

      expect(result!).toBeInstanceOf(Usuario);
      expect(result!.id).toBe(prismaResult.id);
      expect(result!.email).toBe(prismaResult.email);
      expect(result!.senha).toBe(prismaResult.senha);
      expect(result!.perfis).toBeDefined();
      expect(result!.perfis?.[0]).toBeInstanceOf(Perfil);
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
  });

  describe('findByEmail', () => {
    it('should return a user by email', async () => {
      const prismaResult = {
        id: 1,
        email: 'test@example.com',
        senha: 'hashedPassword',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaService.usuario.findUnique.mockResolvedValue(prismaResult);

      const result = await repository.findByEmail('test@example.com');

      expect(result).toBeInstanceOf(Usuario);
      expect(result?.email).toBe(prismaResult.email);
      expect(result?.senha).toBe(prismaResult.senha);
      expect(mockPrismaService.usuario.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });

    it('should return null if user not found by email', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);

      const result = await repository.findByEmail('nonexistent@example.com');
      expect(result).toBeNull();
    });
  });

  describe('findByEmailWithPerfisAndPermissoes', () => {
    it('should return a user with profiles and permissions', async () => {
      const prismaResult = {
        id: 1,
        email: 'test@example.com',
        senha: 'hashedPassword',
        createdAt: new Date(),
        updatedAt: new Date(),
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
                descricao: 'Create User Perm',
              },
            ],
          },
        ],
      };
      mockPrismaService.usuario.findUnique.mockResolvedValue(prismaResult);

      const result = await repository.findByEmailWithPerfisAndPermissoes('test@example.com');

      expect(result).toBeInstanceOf(Usuario);
      expect(result?.email).toBe(prismaResult.email);
      expect(result?.perfis).toBeDefined();
      expect(result?.perfis?.[0]).toBeInstanceOf(Perfil);
      expect(result?.perfis?.[0].permissoes).toBeDefined();
      expect(result?.perfis?.[0].permissoes?.[0]).toBeInstanceOf(Permissao);
      expect(mockPrismaService.usuario.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        include: {
          perfis: {
            include: {
              permissoes: true,
            },
          },
        },
      });
    });

    it('should return null if user not found by email with profiles and permissions', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);

      const result = await repository.findByEmailWithPerfisAndPermissoes('nonexistent@example.com');
      expect(result).toBeNull();
    });
  });
});