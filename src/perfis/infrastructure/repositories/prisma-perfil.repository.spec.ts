import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPerfilRepository } from './prisma-perfil.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreatePerfilDto } from '../../dto/create-perfil.dto';
import { UpdatePerfilDto } from '../../dto/update-perfil.dto';
import { Perfil } from '../../domain/entities/perfil.entity';
import { Permissao } from '../../../permissoes/domain/entities/permissao.entity';

describe('PrismaPerfilRepository', () => {
  let repository: PrismaPerfilRepository;

  const mockPrismaService = {
    perfil: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(), // Modified for soft delete and restore
      delete: jest.fn(), // Original delete, now replaced by update for soft delete
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks(); // Clear all mocks before each test
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaPerfilRepository,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    repository = module.get<PrismaPerfilRepository>(PrismaPerfilRepository);
  });

  it('deve ser definido', () => {
    expect(repository).toBeDefined();
  });

  describe('criação', () => {
    it('deve criar um novo perfil', async () => {
      const createPerfilDto: CreatePerfilDto = {
        nome: 'Test Perfil',
        codigo: 'TEST_PERFIL',
        descricao: 'Description',
        permissoesIds: [1, 2],
      };
      const expectedPerfil = new Perfil();
      Object.assign(expectedPerfil, {
        id: 1,
        nome: createPerfilDto.nome,
        codigo: createPerfilDto.codigo,
        descricao: createPerfilDto.descricao,
        permissoes: createPerfilDto.permissoesIds?.map((id) => {
          const p = new Permissao();
          p.id = id;
          return p;
        }),
        deletedAt: null, // Added
      });

      mockPrismaService.perfil.create.mockResolvedValue({
        id: 1,
        nome: createPerfilDto.nome,
        codigo: createPerfilDto.codigo,
        descricao: createPerfilDto.descricao,
        permissoes: createPerfilDto.permissoesIds?.map((id) => ({ id })),
        deletedAt: null,
      });

      const result = await repository.create(createPerfilDto);
      expect(result).toEqual(expectedPerfil);
      expect(result.deletedAt).toBeNull(); // Assert deletedAt
      expect(mockPrismaService.perfil.create).toHaveBeenCalledWith({
        data: {
          nome: createPerfilDto.nome,
          codigo: createPerfilDto.codigo,
          descricao: createPerfilDto.descricao,
          permissoes: {
            connect: [{ id: 1 }, { id: 2 }],
          },
        },
        include: { permissoes: true },
      });
    });

    it('deve criar um novo perfil sem permissões', async () => {
      const createPerfilDto: CreatePerfilDto = {
        nome: 'Test Perfil',
        codigo: 'TEST_PERFIL',
        descricao: 'Description',
      };
      const expectedPerfil = new Perfil();
      Object.assign(expectedPerfil, {
        id: 1,
        ...createPerfilDto,
        permissoes: [],
        deletedAt: null, // Added
      });

      mockPrismaService.perfil.create.mockResolvedValue(expectedPerfil);

      const result = await repository.create(createPerfilDto);
      expect(result).toEqual(expectedPerfil);
      expect(result.deletedAt).toBeNull(); // Assert deletedAt
      expect(mockPrismaService.perfil.create).toHaveBeenCalledWith({
        data: {
          nome: createPerfilDto.nome,
          codigo: createPerfilDto.codigo,
          descricao: createPerfilDto.descricao,
          permissoes: {
            connect: undefined, // Should be undefined if permissoesIds is not provided
          },
        },
        include: { permissoes: true },
      });
    });
  });

  describe('busca de todos', () => {
    const prismaResults = [
      {
        id: 1,
        nome: 'Perfil 1',
        codigo: 'PERFIL_1',
        descricao: 'Desc 1',
        deletedAt: null,
        permissoes: [],
      },
      {
        id: 2,
        nome: 'Perfil 2',
        codigo: 'PERFIL_2',
        descricao: 'Desc 2',
        deletedAt: new Date(), // Soft deleted
        permissoes: [],
      },
    ];

    it('deve retornar uma lista de perfis não excluídos e a contagem total por padrão', async () => {
      mockPrismaService.perfil.findMany.mockResolvedValue([prismaResults[0]]); // Only return non-deleted
      mockPrismaService.perfil.count.mockResolvedValue(1);

      const [data, total] = await repository.findAll(0, 10);
      expect(data).toHaveLength(1);
      expect(data[0]).toBeInstanceOf(Perfil);
      expect(data[0].deletedAt).toBeNull();
      expect(total).toBe(1);
      expect(mockPrismaService.perfil.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        where: { deletedAt: null }, // Assert filter
        include: { permissoes: true },
      });
      expect(mockPrismaService.perfil.count).toHaveBeenCalledWith({
        where: { deletedAt: null },
      });
    });

    it('deve retornar todos os perfis, incluindo os excluídos, quando especificado', async () => {
      mockPrismaService.perfil.findMany.mockResolvedValue(prismaResults); // Return all
      mockPrismaService.perfil.count.mockResolvedValue(2);

      const [data, total] = await repository.findAll(0, 10, true); // Pass true for includeDeleted
      expect(data).toHaveLength(2);
      expect(data[0]).toBeInstanceOf(Perfil);
      expect(data[1]).toBeInstanceOf(Perfil);
      expect(data[1].deletedAt).not.toBeNull();
      expect(total).toBe(2);
      expect(mockPrismaService.perfil.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        where: {}, // No deletedAt filter
        include: { permissoes: true },
      });
      expect(mockPrismaService.perfil.count).toHaveBeenCalledWith({
        where: {},
      });
    });
  });

  describe('busca por um', () => {
    const prismaResult = {
      id: 1,
      nome: 'Perfil 1',
      codigo: 'PERFIL_1',
      descricao: 'Desc 1',
      deletedAt: null,
      permissoes: [],
    };

    it('deve retornar um único perfil por ID (não excluído)', async () => {
      mockPrismaService.perfil.findFirst.mockResolvedValue(prismaResult);

      const result = await repository.findOne(1);
      expect(result).toEqual(prismaResult);
      expect(result!.deletedAt).toBeNull();
      expect(mockPrismaService.perfil.findFirst).toHaveBeenCalledWith({
        where: { id: 1, deletedAt: null }, // Assert filter
        include: { permissoes: true },
      });
    });

    it('deve retornar um único perfil por ID, incluindo os excluídos', async () => {
      const deletedPrismaResult = { ...prismaResult, deletedAt: new Date() };
      mockPrismaService.perfil.findFirst.mockResolvedValue(deletedPrismaResult);

      const result = await repository.findOne(1, true); // Pass true for includeDeleted
      expect(result).toEqual(deletedPrismaResult);
      expect(result!.deletedAt).toEqual(deletedPrismaResult.deletedAt);
      expect(mockPrismaService.perfil.findFirst).toHaveBeenCalledWith({
        where: { id: 1 }, // No deletedAt filter
        include: { permissoes: true },
      });
    });

    it('deve retornar undefined se o perfil não for encontrado', async () => {
      mockPrismaService.perfil.findFirst.mockResolvedValue(null);

      const result = await repository.findOne(999);
      expect(result).toBeUndefined();
    });

    it('deve retornar undefined se o perfil estiver com soft delete e não for incluído', async () => {
      mockPrismaService.perfil.findFirst.mockResolvedValue(null);

      const result = await repository.findOne(1, false); // Explicitly not include deleted
      expect(result).toBeUndefined();
    });
  });

  describe('atualização', () => {
    it('deve atualizar um perfil existente', async () => {
      const updatePerfilDto: UpdatePerfilDto = {
        nome: 'Updated Perfil',
        permissoesIds: [3],
      };
      const expectedPerfil = new Perfil();
      Object.assign(expectedPerfil, {
        id: 1,
        nome: 'Updated Perfil',
        codigo: 'TEST_PERFIL',
        descricao: 'Description',
        deletedAt: null,
        permissoes: updatePerfilDto.permissoesIds?.map((id) => {
          const p = new Permissao();
          p.id = id;
          return p;
        }),
      });
      mockPrismaService.perfil.update.mockResolvedValue(expectedPerfil);
      mockPrismaService.perfil.findFirst.mockResolvedValue({ id: 1 }); // Mock existingPerfil for update method

      const result = await repository.update(1, updatePerfilDto);
      expect(result).toEqual(expectedPerfil);
      expect(mockPrismaService.perfil.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          nome: updatePerfilDto.nome,
          permissoes: {
            set: [{ id: 3 }],
          },
        },
        include: { permissoes: true },
      });
    });

    it('deve atualizar um perfil existente sem alterar permissões', async () => {
      const updatePerfilDto: UpdatePerfilDto = { nome: 'Updated Perfil' };
      const expectedPerfil = new Perfil();
      Object.assign(expectedPerfil, {
        id: 1,
        nome: 'Updated Perfil',
        codigo: 'TEST_PERFIL',
        descricao: 'Description',
        deletedAt: null,
        permissoes: [],
      });
      mockPrismaService.perfil.update.mockResolvedValue(expectedPerfil);
      mockPrismaService.perfil.findFirst.mockResolvedValue({ id: 1 }); // Mock existingPerfil for update method

      const result = await repository.update(1, updatePerfilDto);
      expect(result).toEqual(expectedPerfil);
      expect(mockPrismaService.perfil.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          nome: updatePerfilDto.nome,
          permissoes: {
            set: undefined, // Should be undefined if permissoesIds is not provided
          },
        },
        include: { permissoes: true },
      });
    });

    it('deve retornar undefined se o perfil a ser atualizado não for encontrado (erro P2025)', async () => {
      const updatePerfilDto: UpdatePerfilDto = { nome: 'Non Existent' };
      const prismaError = new Error('Record not found');
      (prismaError as any).code = 'P2025';
      mockPrismaService.perfil.update.mockRejectedValue(prismaError);
      mockPrismaService.perfil.findFirst.mockResolvedValue(null); // Mock existingPerfil for update method

      const result = await repository.update(999, updatePerfilDto);
      expect(result).toBeUndefined();
    });

    it('deve relançar outros erros durante a atualização', async () => {
      const updatePerfilDto: UpdatePerfilDto = { nome: 'Error Perfil' };
      const prismaError = new Error('Database error');
      (prismaError as any).code = 'P1000'; // Some other Prisma error
      mockPrismaService.perfil.update.mockRejectedValue(prismaError);
      mockPrismaService.perfil.findFirst.mockResolvedValue({ id: 1 }); // Mock existingPerfil for update method

      await expect(repository.update(1, updatePerfilDto)).rejects.toThrow(
        prismaError,
      );
    });
  });

  describe('remoção', () => {
    it('deve realizar soft delete de um perfil', async () => {
      const prismaResult = {
        id: 1,
        nome: 'Test Perfil',
        codigo: 'TEST_PERFIL',
        descricao: 'Description',
        deletedAt: new Date(), // Expected to be set
        permissoes: [],
      };
      mockPrismaService.perfil.update.mockResolvedValue(prismaResult);

      const result = await repository.remove(1);

      expect(result).toEqual(prismaResult);
      expect(result.deletedAt).not.toBeNull(); // Assert deletedAt is set
      expect(mockPrismaService.perfil.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deletedAt: expect.any(Date) },
        include: { permissoes: true }, // Added include expectation
      });
    });

    it('deve lançar um erro se o perfil não for encontrado durante o soft delete', async () => {
      mockPrismaService.perfil.update.mockRejectedValue({ code: 'P2025' }); // Simulate not found

      await expect(repository.remove(999)).rejects.toThrow(
        'Perfil com ID 999 não encontrado.',
      );
    });
  });

  describe('restauração', () => {
    it('deve restaurar um perfil com soft delete', async () => {
      const prismaResult = {
        id: 1,
        nome: 'Test Perfil',
        codigo: 'TEST_PERFIL',
        descricao: 'Description',
        deletedAt: null, // Expected to be null after restore
        permissoes: [],
      };
      mockPrismaService.perfil.update.mockResolvedValue(prismaResult);

      const result = await repository.restore(1);

      expect(result).toEqual(prismaResult);
      expect(result.deletedAt).toBeNull(); // Assert deletedAt is null
      expect(mockPrismaService.perfil.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deletedAt: null },
        include: { permissoes: true }, // Added include expectation
      });
    });

    it('deve lançar um erro se o perfil não for encontrado durante a restauração', async () => {
      mockPrismaService.perfil.update.mockRejectedValue({ code: 'P2025' }); // Simulate not found

      await expect(repository.restore(999)).rejects.toThrow(
        'Perfil com ID 999 não encontrado.',
      );
    });
  });

  describe('busca por nome', () => {
    const prismaResult = {
      id: 1,
      nome: 'Test Perfil',
      codigo: 'TEST_PERFIL',
      descricao: 'Description',
      deletedAt: null,
      permissoes: [],
    };

    it('deve retornar um perfil por nome (não excluído)', async () => {
      mockPrismaService.perfil.findFirst.mockResolvedValue(prismaResult);

      const result = await repository.findByNome('Test Perfil');
      expect(result).toEqual(prismaResult);
      expect(result!.deletedAt).toBeNull();
      expect(mockPrismaService.perfil.findFirst).toHaveBeenCalledWith({
        where: { nome: 'Test Perfil', deletedAt: null }, // Assert filter
        include: { permissoes: true },
      });
    });

    it('deve retornar um perfil por nome, incluindo os excluídos', async () => {
      const deletedPrismaResult = { ...prismaResult, deletedAt: new Date() };
      mockPrismaService.perfil.findFirst.mockResolvedValue(deletedPrismaResult);

      const result = await repository.findByNome('Test Perfil', true); // Pass true for includeDeleted
      expect(result).toEqual(deletedPrismaResult);
      expect(result!.deletedAt).toEqual(deletedPrismaResult.deletedAt);
      expect(mockPrismaService.perfil.findFirst).toHaveBeenCalledWith({
        where: { nome: 'Test Perfil' }, // No deletedAt filter
        include: { permissoes: true },
      });
    });

    it('deve retornar null se o perfil não for encontrado por nome', async () => {
      mockPrismaService.perfil.findFirst.mockResolvedValue(null);

      const result = await repository.findByNome('Non Existent');
      expect(result).toBeNull();
    });

    it('deve retornar null se o perfil estiver com soft delete e não for incluído', async () => {
      mockPrismaService.perfil.findFirst.mockResolvedValue(null);

      const result = await repository.findByNome('Test Perfil', false); // Explicitly not include deleted
      expect(result).toBeNull();
    });
  });

  describe('busca por nome contendo', () => {
    const prismaResults = [
      {
        id: 1,
        nome: 'Test Perfil 1',
        codigo: 'TEST_PERFIL_1',
        descricao: 'Desc 1',
        deletedAt: null,
        permissoes: [],
      },
      {
        id: 2,
        nome: 'Another Test Perfil',
        codigo: 'ANOTHER_TEST_PERFIL',
        descricao: 'Desc 2',
        deletedAt: new Date(), // Soft deleted
        permissoes: [],
      },
    ];

    it('deve retornar uma lista de perfis não excluídos contendo o nome e a contagem total por padrão', async () => {
      mockPrismaService.perfil.findMany.mockResolvedValue([prismaResults[0]]); // Only return non-deleted
      mockPrismaService.perfil.count.mockResolvedValue(1);

      const [data, total] = await repository.findByNomeContaining(
        'Test',
        0,
        10,
      );
      expect(data).toHaveLength(1);
      expect(data[0]).toBeInstanceOf(Perfil);
      expect(data[0].deletedAt).toBeNull();
      expect(total).toBe(1);
      expect(mockPrismaService.perfil.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        where: {
          nome: {
            contains: 'Test',
            mode: 'insensitive',
          },
          deletedAt: null, // Assert filter
        },
        include: { permissoes: true },
      });
      expect(mockPrismaService.perfil.count).toHaveBeenCalledWith({
        where: {
          nome: {
            contains: 'Test',
            mode: 'insensitive',
          },
          deletedAt: null,
        },
      });
    });

    it('deve retornar todos os perfis contendo o nome, incluindo os excluídos, quando especificado', async () => {
      mockPrismaService.perfil.findMany.mockResolvedValue(prismaResults); // Return all
      mockPrismaService.perfil.count.mockResolvedValue(2);

      const [data, total] = await repository.findByNomeContaining(
        'Test',
        0,
        10,
        true, // Pass true for includeDeleted
      );
      expect(data).toHaveLength(2);
      expect(data[0]).toBeInstanceOf(Perfil);
      expect(data[1]).toBeInstanceOf(Perfil);
      expect(data[1].deletedAt).not.toBeNull();
      expect(total).toBe(2);
      expect(mockPrismaService.perfil.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        where: {
          nome: {
            contains: 'Test',
            mode: 'insensitive',
          },
        },
        include: { permissoes: true },
      });
      expect(mockPrismaService.perfil.count).toHaveBeenCalledWith({
        where: {
          nome: {
            contains: 'Test',
            mode: 'insensitive',
          },
        },
      });
    });

    it('deve retornar uma lista vazia e contagem zero se nenhum perfil for encontrado por nome', async () => {
      mockPrismaService.perfil.findMany.mockResolvedValue([]);
      mockPrismaService.perfil.count.mockResolvedValue(0);

      const [data, total] = await repository.findByNomeContaining(
        'Non Existent',
        0,
        10,
      );
      expect(data).toEqual([]);
      expect(total).toBe(0);
    });
  });
});
