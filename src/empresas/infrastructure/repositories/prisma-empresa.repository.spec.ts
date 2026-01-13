import { Test, TestingModule } from '@nestjs/testing';
import { PrismaEmpresaRepository } from './prisma-empresa.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateEmpresaDto } from '../../dto/create-empresa.dto';
import { Empresa } from '../../domain/entities/empresa.entity';

describe('PrismaEmpresaRepository', () => {
  let repository: PrismaEmpresaRepository;
  let prisma: jest.Mocked<PrismaService>;

  const mockPrismaService = {
    empresa: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    usuarioEmpresa: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaEmpresaRepository,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    repository = module.get<PrismaEmpresaRepository>(PrismaEmpresaRepository);
    prisma = module.get(PrismaService);
    jest.clearAllMocks();
  });

  it('deve ser definido', () => {
    expect(repository).toBeDefined();
  });

  describe('create', () => {
    it('deve criar uma empresa', async () => {
      const createDto: CreateEmpresaDto = {
        nome: 'Teste',
        responsavelId: 1,
      };
      const createdEmpresa = {
        ...createDto,
        id: 'uuid',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ativo: true,
        descricao: null,
      };
      mockPrismaService.empresa.create.mockResolvedValue(createdEmpresa);

      const result = await repository.create(createDto);

      expect(result).toBeInstanceOf(Empresa);
      expect(prisma.empresa.create).toHaveBeenCalledWith({ data: createDto });
    });
  });

  describe('findAll', () => {
    it('deve retornar empresas paginadas', async () => {
      const mockEmpresas = [
        { id: 'uuid', nome: 'Teste', createdAt: new Date() },
      ];
      mockPrismaService.empresa.findMany.mockResolvedValue(mockEmpresas);
      mockPrismaService.empresa.count.mockResolvedValue(1);

      const result = await repository.findAll({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });
  });

  describe('findOne', () => {
    it('deve retornar uma empresa se encontrada', async () => {
      const mockEmpresa = { id: 'uuid', nome: 'Teste' };
      mockPrismaService.empresa.findUnique.mockResolvedValue(mockEmpresa);

      const result = await repository.findOne('uuid');

      expect(result).toBeInstanceOf(Empresa);
    });

    it('deve retornar null se não encontrada', async () => {
      mockPrismaService.empresa.findUnique.mockResolvedValue(null);

      const result = await repository.findOne('uuid');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('deve atualizar uma empresa', async () => {
      const mockEmpresa = { id: 'uuid', nome: 'Updated' };
      mockPrismaService.empresa.update.mockResolvedValue(mockEmpresa);

      const result = await repository.update('uuid', { nome: 'Updated' });

      expect(result.nome).toBe('Updated');
    });
  });

  describe('remove', () => {
    it('deve realizar soft delete', async () => {
      await repository.remove('uuid');

      expect(prisma.empresa.update).toHaveBeenCalledWith({
        where: { id: 'uuid' },
        data: { deletedAt: expect.any(Date), ativo: false },
      });
    });
  });

  describe('addUserToCompany', () => {
    it('deve criar novo vinculo se não existir', async () => {
      mockPrismaService.usuarioEmpresa.findUnique.mockResolvedValue(null);

      await repository.addUserToCompany('empresa-id', 1, [1, 2]);

      expect(prisma.usuarioEmpresa.create).toHaveBeenCalledWith({
        data: {
          usuarioId: 1,
          empresaId: 'empresa-id',
          perfis: { connect: [{ id: 1 }, { id: 2 }] },
        },
      });
    });

    it('deve atualizar vinculo se existir', async () => {
      mockPrismaService.usuarioEmpresa.findUnique.mockResolvedValue({ id: 10 });

      await repository.addUserToCompany('empresa-id', 1, [3]);

      expect(prisma.usuarioEmpresa.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: {
          perfis: { set: [{ id: 3 }] },
        },
      });
    });
  });

  describe('findUsersByCompany', () => {
    it('deve listar usuários de uma empresa', async () => {
      mockPrismaService.usuarioEmpresa.findMany.mockResolvedValue([]);
      mockPrismaService.usuarioEmpresa.count.mockResolvedValue(0);

      const result = await repository.findUsersByCompany('uuid', {
        page: 1,
        limit: 10,
      });

      expect(result.data).toBeDefined();
      expect(prisma.usuarioEmpresa.findMany).toHaveBeenCalled();
    });
  });

  describe('findCompaniesByUser', () => {
    it('deve listar empresas de um usuário', async () => {
      mockPrismaService.usuarioEmpresa.findMany.mockResolvedValue([]);
      mockPrismaService.usuarioEmpresa.count.mockResolvedValue(0);

      const result = await repository.findCompaniesByUser(1, {
        page: 1,
        limit: 10,
      });

      expect(result.data).toBeDefined();
      expect(prisma.usuarioEmpresa.findMany).toHaveBeenCalled();
    });
  });
});
