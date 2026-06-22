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
    upsert: jest.fn(),
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
    expect(repository).toBeInstanceOf(PrismaEmpresaRepository);
  });

  describe('create', () => {
    // REQ-EMP-001: POST /empresas cria empresa (HTTP 201)
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
      expect(mockEmpresaModel.create).toHaveBeenCalledWith({
        data: createDto,
        select: {
          id: true,
          nome: true,
          descricao: true,
          responsavelId: true,
          plano: true,
          ativo: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      });
    });
  });

  describe('findAll', () => {
    // REQ-EMP-002: listagem paginada filtrando soft-deletadas
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
    // REQ-EMP-005: soft delete via client estendido (deletedAt=NOW, ativo=false)
    it('deve realizar soft delete chamando delete do extended client', async () => {
      await repository.remove('uuid');

      expect(mockEmpresaModel.delete).toHaveBeenCalledWith({
        where: { id: 'uuid' },
      });
    });
  });

  describe('addUserToCompany', () => {
    // REQ-EMP-006: vinculação idempotente (upsert)
    // REQ-EMP-008: validar empresa, usuário e cada perfil
    it('deve usar upsert atômico (evita race condition) ao vincular usuário', async () => {
      // TDD: features/empresas.feature:Cenário: Vincular usuário a empresa
      // BDD: vinculação é idempotente e atômica (constraint @@unique[usuarioId,empresaId])
      mockUsuarioEmpresaModel.upsert.mockResolvedValue({ id: 1 });

      await repository.addUserToCompany('empresa-id', 1, [1, 2]);

      // Verifica chamada atômica: where, create e update no mesmo upsert
      expect(mockUsuarioEmpresaModel.upsert).toHaveBeenCalledWith({
        where: {
          usuarioId_empresaId: {
            usuarioId: 1,
            empresaId: 'empresa-id',
          },
        },
        create: {
          usuarioId: 1,
          empresaId: 'empresa-id',
          perfis: { connect: [{ id: 1 }, { id: 2 }] },
        },
        update: {
          perfis: { set: [{ id: 1 }, { id: 2 }] },
        },
      });
      // Garante que NÃO usa o caminho antigo (findUnique + create/update)
      expect(mockUsuarioEmpresaModel.findUnique).not.toHaveBeenCalled();
      expect(mockUsuarioEmpresaModel.create).not.toHaveBeenCalled();
      expect(mockUsuarioEmpresaModel.update).not.toHaveBeenCalled();
    });
  });

  describe('findUsersByCompany', () => {
    // REQ-EMP-007: GET /empresas/:id/usuarios retorna usuários vinculados paginados
    it('deve listar usuários de uma empresa', async () => {
      mockUsuarioEmpresaModel.findMany.mockResolvedValue([]);
      mockUsuarioEmpresaModel.count.mockResolvedValue(0);

      const result = await repository.findUsersByCompany('uuid', {
        page: 1,
        limit: 10,
      });

      expect(result.data).toEqual([]);
      expect(mockUsuarioEmpresaModel.findMany).toHaveBeenCalled();
    });

    it('deve mapear item.usuario e item.perfis para o data', async () => {
      mockUsuarioEmpresaModel.findMany.mockResolvedValue([
        {
          usuario: { id: 1, email: 'a@b.c', ativo: true },
          perfis: [{ id: 10, nome: 'Admin' }],
        },
      ]);
      mockUsuarioEmpresaModel.count.mockResolvedValue(1);

      const result = await repository.findUsersByCompany('uuid', {
        page: 1,
        limit: 10,
      });

      expect(result.data).toEqual([
        {
          id: 1,
          email: 'a@b.c',
          ativo: true,
          perfis: [{ id: 10, nome: 'Admin' }],
        },
      ]);
    });

    it('deve usar defaults de paginação (page=1, limit=10) quando ausentes', async () => {
      mockUsuarioEmpresaModel.findMany.mockResolvedValue([]);
      mockUsuarioEmpresaModel.count.mockResolvedValue(0);

      await repository.findUsersByCompany('uuid', {} as any);

      expect(mockUsuarioEmpresaModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
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

      expect(result.data).toEqual([]);
      expect(mockUsuarioEmpresaModel.findMany).toHaveBeenCalled();
    });

    it('deve mapear item.empresa e item.perfis para o data', async () => {
      mockUsuarioEmpresaModel.findMany.mockResolvedValue([
        {
          empresa: { id: 'uuid', nome: 'Acme', plano: 'PRO' },
          perfis: [{ id: 10, nome: 'Admin' }],
        },
      ]);
      mockUsuarioEmpresaModel.count.mockResolvedValue(1);

      const result = await repository.findCompaniesByUser(1, {
        page: 1,
        limit: 10,
      });

      expect(result.data).toEqual([
        {
          id: 'uuid',
          nome: 'Acme',
          plano: 'PRO',
          perfis: [{ id: 10, nome: 'Admin' }],
        },
      ]);
    });

    it('deve usar defaults de paginação (page=1, limit=10) quando ausentes', async () => {
      mockUsuarioEmpresaModel.findMany.mockResolvedValue([]);
      mockUsuarioEmpresaModel.count.mockResolvedValue(0);

      await repository.findCompaniesByUser(1, {} as any);

      expect(mockUsuarioEmpresaModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });
  });

  describe('findAll - defaults', () => {
    it('deve usar page=1 e limit=10 quando não fornecidos', async () => {
      mockEmpresaModel.findMany.mockResolvedValue([]);
      mockEmpresaModel.count.mockResolvedValue(0);

      await repository.findAll({} as any);

      expect(mockEmpresaModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });

    it('deve calcular totalPages com ceil quando total não é múltiplo de limit', async () => {
      mockEmpresaModel.findMany.mockResolvedValue([]);
      mockEmpresaModel.count.mockResolvedValue(25);

      const result = await repository.findAll({ page: 1, limit: 10 });

      expect(result.totalPages).toBe(3);
    });
  });
});
