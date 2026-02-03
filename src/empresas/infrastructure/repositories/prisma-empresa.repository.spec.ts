import { Test, TestingModule } from '@nestjs/testing';
import { PrismaEmpresaRepository } from './prisma-empresa.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateEmpresaDto } from '../../dto/create-empresa.dto';
import { Empresa } from '../../domain/entities/empresa.entity';

describe('PrismaEmpresaRepository', () => {
  let repository: PrismaEmpresaRepository;

  const mockEmpresaModel = {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockUsuarioEmpresaModel = {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  };

  const mockPrismaService = {
    empresa: mockEmpresaModel,
    usuarioEmpresa: mockUsuarioEmpresaModel,
    extended: {
      empresa: mockEmpresaModel,
      usuarioEmpresa: mockUsuarioEmpresaModel,
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
      mockEmpresaModel.create.mockResolvedValue(createdEmpresa);

      const result = await repository.create(createDto);

      expect(result).toBeInstanceOf(Empresa);
      expect(mockEmpresaModel.create).toHaveBeenCalledWith({ data: createDto });
    });
  });

  describe('findAll', () => {
    it('deve retornar empresas paginadas', async () => {
      const mockEmpresas = [
        { id: 'uuid', nome: 'Teste', createdAt: new Date() },
      ];
      mockEmpresaModel.findMany.mockResolvedValue(mockEmpresas);
      mockEmpresaModel.count.mockResolvedValue(1);

      const result = await repository.findAll({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });
  });

  describe('findOne', () => {
    it('deve retornar uma empresa se encontrada', async () => {
      const mockEmpresa = { id: 'uuid', nome: 'Teste' };
      mockEmpresaModel.findUnique.mockResolvedValue(mockEmpresa);

      const result = await repository.findOne('uuid');

      expect(result).toBeInstanceOf(Empresa);
    });

    it('deve retornar null se não encontrada', async () => {
      mockEmpresaModel.findUnique.mockResolvedValue(null);

      const result = await repository.findOne('uuid');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('deve atualizar uma empresa', async () => {
      const mockEmpresa = { id: 'uuid', nome: 'Updated' };
      mockEmpresaModel.update.mockResolvedValue(mockEmpresa);

      const result = await repository.update('uuid', { nome: 'Updated' });

      expect(result.nome).toBe('Updated');
    });
  });

  describe('remove', () => {
    it('deve realizar soft delete chamando delete do extended client', async () => {
      await repository.remove('uuid');

      expect(mockEmpresaModel.delete).toHaveBeenCalledWith({
        where: { id: 'uuid' },
      });
    });
  });

  describe('addUserToCompany', () => {
    it('deve criar novo vinculo se não existir', async () => {
      mockUsuarioEmpresaModel.findUnique.mockResolvedValue(null);

      await repository.addUserToCompany('empresa-id', 1, [1, 2]);

      expect(mockUsuarioEmpresaModel.create).toHaveBeenCalledWith({
        data: {
          usuarioId: 1,
          empresaId: 'empresa-id',
          perfis: { connect: [{ id: 1 }, { id: 2 }] },
        },
      });
    });

    it('deve atualizar vinculo se existir', async () => {
      mockUsuarioEmpresaModel.findUnique.mockResolvedValue({ id: 10 });

      await repository.addUserToCompany('empresa-id', 1, [3]);

      expect(mockUsuarioEmpresaModel.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: {
          perfis: { set: [{ id: 3 }] },
        },
      });
    });
  });

  describe('findUsersByCompany', () => {
    it('deve listar usuários de uma empresa', async () => {
      mockUsuarioEmpresaModel.findMany.mockResolvedValue([]);
      mockUsuarioEmpresaModel.count.mockResolvedValue(0);

      const result = await repository.findUsersByCompany('uuid', {
        page: 1,
        limit: 10,
      });

      expect(result.data).toBeDefined();
      expect(mockUsuarioEmpresaModel.findMany).toHaveBeenCalled();
    });
  });

  describe('findCompaniesByUser', () => {
    it('deve listar empresas de um usuário', async () => {
      mockUsuarioEmpresaModel.findMany.mockResolvedValue([]);
      mockUsuarioEmpresaModel.count.mockResolvedValue(0);

      const result = await repository.findCompaniesByUser(1, {
        page: 1,
        limit: 10,
      });

      expect(result.data).toBeDefined();
      expect(mockUsuarioEmpresaModel.findMany).toHaveBeenCalled();
    });
  });
});
