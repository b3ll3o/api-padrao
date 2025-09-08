/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { PermissoesService } from './permissoes.service';
import { PermissaoRepository } from '../../domain/repositories/permissao.repository';
import { PrismaService } from 'src/prisma/prisma.service';

describe('PermissoesService', () => {
  let service: PermissoesService;
  let repository: PermissaoRepository;

  const mockPermissaoRepository = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    findByNome: jest.fn(),
    findByNomeContaining: jest.fn(),
  };

  const mockPrismaService = {
    permissao: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissoesService,
        {
          provide: PermissaoRepository,
          useValue: mockPermissaoRepository,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<PermissoesService>(PermissoesService);
    repository = module.get<PermissaoRepository>(PermissaoRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a permissao', async () => {
      const createPermissaoDto = { nome: 'Test Permissao' };
      const expectedPermissao = {
        id: 1,
        ...createPermissaoDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPermissaoRepository.findByNome.mockResolvedValue(null);
      mockPermissaoRepository.create.mockResolvedValue(expectedPermissao);

      const result = await service.create(createPermissaoDto);

      expect(result).toEqual(expectedPermissao);
      expect(repository.findByNome).toHaveBeenCalledWith(
        createPermissaoDto.nome,
      );
      expect(mockPermissaoRepository.create).toHaveBeenCalledWith(
        createPermissaoDto,
      );
    });

    it('should throw ConflictException if permissao with same name already exists', async () => {
      const createPermissaoDto = { nome: 'Existing Permissao' };
      mockPermissaoRepository.findByNome.mockResolvedValue({
        id: 1,
        nome: 'Existing Permissao',
      });

      await expect(service.create(createPermissaoDto)).rejects.toThrowError(
        `Permissão com o nome '${createPermissaoDto.nome}' já existe.`,
      );
      expect(repository.findByNome).toHaveBeenCalledWith(
        createPermissaoDto.nome,
      );
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return a paginated list of permissoes', async () => {
      const expectedPermissoes = [
        {
          id: 1,
          nome: 'Permissao 1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          nome: 'Permissao 2',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const paginationDto = { page: 1, limit: 10 };
      mockPermissaoRepository.findAll.mockResolvedValue([expectedPermissoes, 2]);

      const result = await service.findAll(paginationDto);

      expect(result).toEqual({ data: expectedPermissoes, total: 2 });
      expect(repository.findAll).toHaveBeenCalledWith(0, 10);
    });
  });

  describe('findOne', () => {
    it('should return a single permissao', async () => {
      const expectedPermissao = {
        id: 1,
        nome: 'Test Permissao',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPermissaoRepository.findOne.mockResolvedValue(expectedPermissao);

      const result = await service.findOne(1);

      expect(result).toEqual(expectedPermissao);
      expect(repository.findOne).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if permissao not found', async () => {
      mockPermissaoRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrowError(
        'Permissão com ID 999 não encontrada',
      );
      expect(repository.findOne).toHaveBeenCalledWith(999);
    });
  });

  describe('findByName', () => {
    it('should return an array of permissoes containing the name', async () => {
      const expectedPermissoes = [
        {
          id: 1,
          nome: 'Test Permissao 1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          nome: 'Another Test Permissao',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockPermissaoRepository.findByNomeContaining.mockResolvedValue(expectedPermissoes);

      const result = await service.findByNome('Test Permissao');

      expect(result).toEqual(expectedPermissoes);
      expect(mockPermissaoRepository.findByNomeContaining).toHaveBeenCalledWith('Test Permissao');
    });

    it('should return an empty array if no permissao is found by name', async () => {
      mockPermissaoRepository.findByNomeContaining.mockResolvedValue([]);

      const result = await service.findByNome('Non Existent Permissao');

      expect(result).toEqual([]);
      expect(mockPermissaoRepository.findByNomeContaining).toHaveBeenCalledWith('Non Existent Permissao');
    });
  });

  describe('update', () => {
    it('should update a permissao', async () => {
      const updatePermissaoDto = { nome: 'Updated Permissao' };
      const existingPermissao = {
        id: 1,
        nome: 'Test Permissao',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const expectedPermissao = {
        id: 1,
        ...updatePermissaoDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPermissaoRepository.findOne.mockResolvedValue(existingPermissao);
      mockPermissaoRepository.update.mockResolvedValue(expectedPermissao);

      const result = await service.update(1, updatePermissaoDto);

      expect(result).toEqual(expectedPermissao);
      expect(repository.update).toHaveBeenCalledWith(1, updatePermissaoDto);
    });

    it('should throw NotFoundException if permissao to update not found', async () => {
      mockPermissaoRepository.update.mockResolvedValue(null);

      await expect(
        service.update(999, { nome: 'Non Existent' }),
      ).rejects.toThrowError('Permissão com ID 999 não encontrada');
      expect(repository.update).toHaveBeenCalledWith(999, {
        nome: 'Non Existent',
      });
      expect(repository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should remove a permissao', async () => {
      const existingPermissao = {
        id: 1,
        nome: 'Test Permissao',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPermissaoRepository.findOne.mockResolvedValue(existingPermissao);
      mockPermissaoRepository.remove.mockResolvedValue(undefined);

      await service.remove(1);

      expect(repository.findOne).toHaveBeenCalledWith(1);
      expect(repository.remove).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if permissao to remove not found', async () => {
      mockPermissaoRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrowError(
        'Permissão com ID 999 não encontrada',
      );
      expect(repository.findOne).toHaveBeenCalledWith(999);
      expect(repository.remove).not.toHaveBeenCalled();
    });
  });
});
