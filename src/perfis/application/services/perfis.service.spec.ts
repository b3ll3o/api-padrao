/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { PerfisService } from './perfis.service';
import { PerfilRepository } from '../../domain/repositories/perfil.repository';
import { PrismaService } from 'src/prisma/prisma.service';
import { PermissoesService } from '../../../permissoes/application/services/permissoes.service';

describe('PerfisService', () => {
  let service: PerfisService;
  let repository: PerfilRepository;
  let permissoesService: PermissoesService;

  const mockPerfilRepository = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    findByNome: jest.fn(),
    findByNomeContaining: jest.fn(),
  };

  const mockPermissoesService = {
    findOne: jest.fn(),
  };

  const mockPrismaService = {
    perfil: {
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
        PerfisService,
        {
          provide: PerfilRepository,
          useValue: mockPerfilRepository,
        },
        {
          provide: PermissoesService,
          useValue: mockPermissoesService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<PerfisService>(PerfisService);
    repository = module.get<PerfilRepository>(PerfilRepository);
    permissoesService = module.get<PermissoesService>(PermissoesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a perfil', async () => {
      const createPerfilDto = { nome: 'Test Perfil', permissoesIds: [1] };
      const expectedPerfil = {
        id: 1,
        ...createPerfilDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPerfilRepository.findByNome.mockResolvedValue(null);
      mockPerfilRepository.create.mockResolvedValue(expectedPerfil);
      mockPermissoesService.findOne.mockResolvedValue({
        id: 1,
        nome: 'Permissao 1',
      });

      const result = await service.create(createPerfilDto);

      expect(result).toEqual(expectedPerfil);
      expect(repository.findByNome).toHaveBeenCalledWith(createPerfilDto.nome);
      expect(mockPerfilRepository.create).toHaveBeenCalledWith(createPerfilDto);
      expect(permissoesService.findOne).toHaveBeenCalledWith(1);
    });

    it('should create a perfil without permissions', async () => {
      const createPerfilDto = { nome: 'Test Perfil' };
      const expectedPerfil = {
        id: 1,
        ...createPerfilDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPerfilRepository.findByNome.mockResolvedValue(null);
      mockPerfilRepository.create.mockResolvedValue(expectedPerfil);

      const result = await service.create(createPerfilDto);

      expect(result).toEqual(expectedPerfil);
      expect(repository.findByNome).toHaveBeenCalledWith(createPerfilDto.nome);
      expect(mockPerfilRepository.create).toHaveBeenCalledWith(createPerfilDto);
      expect(permissoesService.findOne).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if perfil with same name already exists', async () => {
      const createPerfilDto = { nome: 'Existing Perfil' };
      mockPerfilRepository.findByNome.mockResolvedValue({
        id: 1,
        nome: 'Existing Perfil',
      });

      await expect(service.create(createPerfilDto)).rejects.toThrowError(
        `Perfil com o nome '${createPerfilDto.nome}' já existe.`,
      );
      expect(repository.findByNome).toHaveBeenCalledWith(createPerfilDto.nome);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if permissions do not exist', async () => {
      const createPerfilDto = {
        nome: 'Perfil with Invalid Perms',
        permissoesIds: [999],
      };
      mockPerfilRepository.findByNome.mockResolvedValue(null);
      mockPermissoesService.findOne.mockRejectedValue(
        new Error('Permissão com ID 999 não encontrada'),
      );

      await expect(service.create(createPerfilDto)).rejects.toThrowError(
        'Permissão com ID 999 não encontrada',
      );
      expect(permissoesService.findOne).toHaveBeenCalledWith(999);
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return a paginated list of perfis', async () => {
      const expectedPerfis = [
        {
          id: 1,
          nome: 'Perfil 1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          nome: 'Perfil 2',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const paginationDto = { page: 1, limit: 10 };
      mockPerfilRepository.findAll.mockResolvedValue([expectedPerfis, 2]);

      const result = await service.findAll(paginationDto);

      expect(result).toEqual({ data: expectedPerfis, total: 2 });
      expect(repository.findAll).toHaveBeenCalledWith(0, 10);
    });
  });

  describe('findOne', () => {
    it('should return a single perfil', async () => {
      const expectedPerfil = {
        id: 1,
        nome: 'Test Perfil',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPerfilRepository.findOne.mockResolvedValue(expectedPerfil);

      const result = await service.findOne(1);

      expect(result).toEqual(expectedPerfil);
      expect(repository.findOne).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if perfil not found', async () => {
      mockPerfilRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrowError(
        'Perfil com ID 999 não encontrado',
      );
      expect(repository.findOne).toHaveBeenCalledWith(999);
    });
  });

  describe('findByNome', () => {
    it('should return a paginated list of perfis containing the name', async () => {
      const expectedPerfis = [
        {
          id: 1,
          nome: 'Test Perfil 1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          nome: 'Another Test Perfil',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const paginationDto = { page: 1, limit: 10 };
      mockPerfilRepository.findByNomeContaining.mockResolvedValue([
        expectedPerfis,
        2,
      ]);

      const result = await service.findByNome('Test Perfil', paginationDto);

      expect(result).toEqual({ data: expectedPerfis, total: 2 });
      expect(mockPerfilRepository.findByNomeContaining).toHaveBeenCalledWith(
        'Test Perfil',
        0,
        10,
      );
    });

    it('should return an empty paginated list if no perfil is found by name', async () => {
      const paginationDto = { page: 1, limit: 10 };
      mockPerfilRepository.findByNomeContaining.mockResolvedValue([[], 0]);

      const result = await service.findByNome(
        'Non Existent Perfil',
        paginationDto,
      );

      expect(result).toEqual({ data: [], total: 0 });
      expect(mockPerfilRepository.findByNomeContaining).toHaveBeenCalledWith(
        'Non Existent Perfil',
        0,
        10,
      );
    });
  });

  describe('update', () => {
    it('should update a perfil', async () => {
      const updatePerfilDto = { nome: 'Updated Perfil', permissoesIds: [1] };
      const existingPerfil = {
        id: 1,
        nome: 'Old Perfil',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const expectedPerfil = {
        id: 1,
        ...updatePerfilDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPerfilRepository.findOne.mockResolvedValue(existingPerfil); // For the findOne call inside update
      mockPerfilRepository.update.mockResolvedValue(expectedPerfil);
      mockPermissoesService.findOne.mockResolvedValue({
        id: 1,
        nome: 'Permissao 1',
      });

      const result = await service.update(1, updatePerfilDto);

      expect(result).toEqual(expectedPerfil);
      expect(repository.update).toHaveBeenCalledWith(1, updatePerfilDto);
      expect(permissoesService.findOne).toHaveBeenCalledWith(1);
    });

    it('should update a perfil without permissions', async () => {
      const updatePerfilDto = { nome: 'Updated Perfil' };
      const existingPerfil = {
        id: 1,
        nome: 'Old Perfil',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const expectedPerfil = {
        id: 1,
        ...updatePerfilDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPerfilRepository.findOne.mockResolvedValue(existingPerfil); // For the findOne call inside update
      mockPerfilRepository.update.mockResolvedValue(expectedPerfil);

      const result = await service.update(1, updatePerfilDto);

      expect(result).toEqual(expectedPerfil);
      expect(repository.update).toHaveBeenCalledWith(1, updatePerfilDto);
      expect(permissoesService.findOne).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if perfil to update not found', async () => {
      mockPerfilRepository.update.mockResolvedValue(null);

      await expect(
        service.update(999, { nome: 'Non Existent' }),
      ).rejects.toThrowError('Perfil com ID 999 não encontrado');
      expect(repository.update).toHaveBeenCalledWith(999, {
        nome: 'Non Existent',
      });
      expect(repository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should remove a perfil', async () => {
      const existingPerfil = {
        id: 1,
        nome: 'Test Perfil',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPerfilRepository.findOne.mockResolvedValue(existingPerfil);
      mockPerfilRepository.remove.mockResolvedValue(undefined);

      await service.remove(1);

      expect(repository.findOne).toHaveBeenCalledWith(1);
      expect(repository.remove).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if perfil to remove not found', async () => {
      mockPerfilRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrowError(
        'Perfil com ID 999 não encontrado',
      );
      expect(repository.findOne).toHaveBeenCalledWith(999);
      expect(repository.remove).not.toHaveBeenCalled();
    });
  });
});
