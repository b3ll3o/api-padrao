import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPerfilRepository } from './prisma-perfil.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreatePerfilDto } from '../../dto/create-perfil.dto';

describe('PrismaPerfilRepository', () => {
  let repository: PrismaPerfilRepository;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaPerfilRepository,
        {
          provide: PrismaService,
          useValue: {
            perfil: {
              create: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
              count: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    repository = module.get<PrismaPerfilRepository>(PrismaPerfilRepository);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('deve ser definido', () => {
    expect(repository).toBeDefined();
  });

  describe('create', () => {
    it('deve criar um perfil com permissões', async () => {
      const createPerfilDto: CreatePerfilDto = {
        nome: 'Admin',
        codigo: 'ADMIN',
        descricao: 'Administrador',
        permissoesIds: [1, 2],
        empresaId: 'empresa-1',
      };

      const mockPrismaPerfil = {
        id: 1,
        nome: 'Admin',
        codigo: 'ADMIN',
        descricao: 'Administrador',
        deletedAt: null,
        ativo: true,
        empresaId: 'empresa-1',
        permissoes: [
          {
            id: 1,
            nome: 'Read',
            codigo: 'READ',
            descricao: 'Read permission',
            ativo: true,
          },
          {
            id: 2,
            nome: 'Write',
            codigo: 'WRITE',
            descricao: 'Write permission',
            ativo: true,
          },
        ],
      };

      (prismaService.perfil.create as jest.Mock).mockResolvedValue(
        mockPrismaPerfil,
      );

      const result = await repository.create(createPerfilDto);

      expect(result.nome).toBe(createPerfilDto.nome);
      expect(result.permissoes).toHaveLength(2);
      expect(prismaService.perfil.create).toHaveBeenCalledWith({
        data: {
          nome: 'Admin',
          codigo: 'ADMIN',
          descricao: 'Administrador',
          empresaId: 'empresa-1',
          permissoes: {
            connect: [{ id: 1 }, { id: 2 }],
          },
        },
        include: { permissoes: true },
      });
    });

    it('deve criar um perfil sem permissões', async () => {
      const createPerfilDto: CreatePerfilDto = {
        nome: 'User',
        codigo: 'USER',
        descricao: 'Usuário comum',
        empresaId: 'empresa-1',
      };

      const mockPrismaPerfil = {
        id: 2,
        nome: 'User',
        codigo: 'USER',
        descricao: 'Usuário comum',
        deletedAt: null,
        ativo: true,
        empresaId: 'empresa-1',
        permissoes: [],
      };

      (prismaService.perfil.create as jest.Mock).mockResolvedValue(
        mockPrismaPerfil,
      );

      const result = await repository.create(createPerfilDto);

      expect(result.nome).toBe(createPerfilDto.nome);
      expect(result.permissoes).toHaveLength(0);
      expect(prismaService.perfil.create).toHaveBeenCalledWith({
        data: {
          nome: 'User',
          codigo: 'USER',
          descricao: 'Usuário comum',
          empresaId: 'empresa-1',
          permissoes: {
            connect: undefined,
          },
        },
        include: { permissoes: true },
      });
    });
  });

  describe('findAll', () => {
    it('deve retornar uma lista de perfis e o total', async () => {
      const mockPerfis = [
        {
          id: 1,
          nome: 'Admin',
          codigo: 'ADMIN',
          descricao: 'Admin',
          empresaId: 'empresa-1',
          permissoes: [],
          ativo: true,
          deletedAt: null,
        },
      ];
      (prismaService.perfil.findMany as jest.Mock).mockResolvedValue(
        mockPerfis,
      );
      (prismaService.perfil.count as jest.Mock).mockResolvedValue(1);

      const [result, total] = await repository.findAll(0, 10);

      expect(result).toHaveLength(1);
      expect(total).toBe(1);
      expect(prismaService.perfil.findMany).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('deve retornar um perfil pelo id', async () => {
      const mockPerfil = {
        id: 1,
        nome: 'Admin',
        codigo: 'ADMIN',
        descricao: 'Admin',
        empresaId: 'empresa-1',
        permissoes: [],
        ativo: true,
        deletedAt: null,
      };
      (prismaService.perfil.findFirst as jest.Mock).mockResolvedValue(
        mockPerfil,
      );

      const result = await repository.findOne(1);

      expect(result).toBeDefined();
      expect(result?.id).toBe(1);
    });
  });
});
