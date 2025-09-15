import { Test, TestingModule } from '@nestjs/testing';
import { PerfisService } from './perfis.service';
import { PerfilRepository } from '../../domain/repositories/perfil.repository';
import { PrismaService } from 'src/prisma/prisma.service';
import { Perfil } from '../../domain/entities/perfil.entity';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';
import { PermissoesService } from '../../../permissoes/application/services/permissoes.service';

describe('PerfisService', () => {
  let service: PerfisService;
  let mockPerfilRepository: Partial<PerfilRepository>;
  let mockPermissoesService: Partial<PermissoesService>;

  beforeEach(async () => {
    mockPerfilRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      restore: jest.fn(),
      findByNome: jest.fn(),
      findByNomeContaining: jest.fn(),
    };

    mockPermissoesService = {
      findOne: jest.fn(),
    };

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
          provide: PrismaService, // Keep PrismaService mock if it's used indirectly
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<PerfisService>(PerfisService);
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  describe('criação', () => {
    it('deve criar um perfil', async () => {
      const createPerfilDto = {
        nome: 'Test Perfil',
        codigo: 'TEST_PERFIL',
        descricao: 'Perfil de teste',
        permissoesIds: [1],
      };
      const expectedPerfil = {
        id: 1,
        ...createPerfilDto,
        deletedAt: null, // Added
      } as Perfil;
      (mockPerfilRepository.findByNome as jest.Mock).mockResolvedValue(null);
      (mockPerfilRepository.create as jest.Mock).mockResolvedValue(
        expectedPerfil,
      );
      (mockPermissoesService.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        nome: 'Permissao 1',
        codigo: 'PERM_1',
        descricao: 'Desc 1',
        deletedAt: null,
      });

      const result = await service.create(createPerfilDto);

      expect(result).toEqual(expectedPerfil);
      expect(mockPerfilRepository.findByNome).toHaveBeenCalledWith(
        createPerfilDto.nome,
      );
      expect(mockPerfilRepository.create).toHaveBeenCalledWith(createPerfilDto);
      expect(mockPermissoesService.findOne).toHaveBeenCalledWith(1);
    });

    it('deve criar um perfil sem permissões', async () => {
      const createPerfilDto = {
        nome: 'Test Perfil',
        codigo: 'TEST_PERFIL',
        descricao: 'Perfil de teste',
      };
      const expectedPerfil = {
        id: 1,
        ...createPerfilDto,
        deletedAt: null, // Added
      } as Perfil;
      (mockPerfilRepository.findByNome as jest.Mock).mockResolvedValue(null);
      (mockPerfilRepository.create as jest.Mock).mockResolvedValue(
        expectedPerfil,
      );

      const result = await service.create(createPerfilDto);

      expect(result).toEqual(expectedPerfil);
      expect(mockPerfilRepository.findByNome).toHaveBeenCalledWith(
        createPerfilDto.nome,
      );
      expect(mockPerfilRepository.create).toHaveBeenCalledWith(createPerfilDto);
      expect(mockPermissoesService.findOne).not.toHaveBeenCalled();
    });

    it('deve lançar ConflictException se um perfil com o mesmo nome já existir', async () => {
      const createPerfilDto = {
        nome: 'Existing Perfil',
        codigo: 'EXISTING_PERFIL',
        descricao: 'Perfil existente',
      };
      (mockPerfilRepository.findByNome as jest.Mock).mockResolvedValue({
        id: 1,
        nome: 'Existing Perfil',
        codigo: 'EXISTING_PERFIL',
        descricao: 'Perfil existente',
        deletedAt: null,
      });

      await expect(service.create(createPerfilDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPerfilRepository.findByNome).toHaveBeenCalledWith(
        createPerfilDto.nome,
      );
      expect(mockPerfilRepository.create).not.toHaveBeenCalled();
    });

    it('deve lançar NotFoundException se as permissões não existirem', async () => {
      const createPerfilDto = {
        nome: 'Perfil with Invalid Perms',
        codigo: 'PERFIL_INVALID_PERMS',
        descricao: 'Perfil com permissões inválidas',
        permissoesIds: [999],
      };
      (mockPerfilRepository.findByNome as jest.Mock).mockResolvedValue(null);
      (mockPermissoesService.findOne as jest.Mock).mockRejectedValue(
        new NotFoundException('Permissão com ID 999 não encontrada'),
      );

      await expect(service.create(createPerfilDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPermissoesService.findOne).toHaveBeenCalledWith(999);
      expect(mockPerfilRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('busca de todos', () => {
    const expectedPerfis = [
      {
        id: 1,
        nome: 'Perfil 1',
        codigo: 'PERFIL_1',
        descricao: 'Desc 1',
        deletedAt: null,
      },
      {
        id: 2,
        nome: 'Perfil 2',
        codigo: 'PERFIL_2',
        descricao: 'Desc 2',
        deletedAt: new Date(),
      },
    ] as Perfil[];

    it('deve retornar uma lista paginada de perfis não excluídos por padrão', async () => {
      const paginationDto = { page: 1, limit: 10 };
      (mockPerfilRepository.findAll as jest.Mock).mockResolvedValue([
        [expectedPerfis[0]],
        1,
      ]);

      const result = await service.findAll(paginationDto);

      expect(result.data).toEqual([expectedPerfis[0]]);
      expect(result.total).toBe(1);
      expect(mockPerfilRepository.findAll).toHaveBeenCalledWith(0, 10, false); // Default includeDeleted is false
    });

    it('deve retornar uma lista paginada de todos os perfis, incluindo os excluídos', async () => {
      const paginationDto = { page: 1, limit: 10 };
      (mockPerfilRepository.findAll as jest.Mock).mockResolvedValue([
        expectedPerfis,
        2,
      ]);

      const result = await service.findAll(paginationDto, true); // Pass true for includeDeleted

      expect(result.data).toEqual(expectedPerfis);
      expect(result.total).toBe(2);
      expect(mockPerfilRepository.findAll).toHaveBeenCalledWith(0, 10, true);
    });
  });

  describe('busca por um', () => {
    const expectedPerfil = {
      id: 1,
      nome: 'Test Perfil',
      codigo: 'TEST_PERFIL',
      descricao: 'Description',
      deletedAt: null,
    } as Perfil;

    it('deve retornar um único perfil (não excluído) por padrão', async () => {
      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(
        expectedPerfil,
      );

      const result = await service.findOne(1);

      expect(result).toEqual(expectedPerfil);
      expect(mockPerfilRepository.findOne).toHaveBeenCalledWith(1, false); // Default includeDeleted is false
    });

    it('deve retornar um único perfil, incluindo os excluídos', async () => {
      const deletedPerfil = { ...expectedPerfil, deletedAt: new Date() };
      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(
        deletedPerfil,
      );

      const result = await service.findOne(1, true); // Pass true for includeDeleted

      expect(result).toEqual(deletedPerfil);
      expect(mockPerfilRepository.findOne).toHaveBeenCalledWith(1, true);
    });

    it('deve lançar NotFoundException se o perfil não for encontrado', async () => {
      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
      expect(mockPerfilRepository.findOne).toHaveBeenCalledWith(999, false);
    });
  });

  describe('busca por nome', () => {
    const expectedPerfis = [
      {
        id: 1,
        nome: 'Test Perfil 1',
        codigo: 'TEST_PERFIL_1',
        descricao: 'Desc 1',
        deletedAt: null,
      },
      {
        id: 2,
        nome: 'Another Test Perfil',
        codigo: 'ANOTHER_TEST_PERFIL',
        descricao: 'Desc 2',
        deletedAt: new Date(),
      },
    ] as Perfil[];

    it('deve retornar uma lista paginada de perfis não excluídos contendo o nome por padrão', async () => {
      const paginationDto = { page: 1, limit: 10 };
      (
        mockPerfilRepository.findByNomeContaining as jest.Mock
      ).mockResolvedValue([[expectedPerfis[0]], 1]);

      const result = await service.findByNome('Test Perfil', paginationDto);

      expect(result.data).toEqual([expectedPerfis[0]]);
      expect(result.total).toBe(1);
      expect(mockPerfilRepository.findByNomeContaining).toHaveBeenCalledWith(
        'Test Perfil',
        0,
        10,
        false, // Default includeDeleted is false
      );
    });

    it('deve retornar uma lista paginada de todos os perfis contendo o nome, incluindo os excluídos', async () => {
      const paginationDto = { page: 1, limit: 10 };
      (
        mockPerfilRepository.findByNomeContaining as jest.Mock
      ).mockResolvedValue([expectedPerfis, 2]);

      const result = await service.findByNome(
        'Test Perfil',
        paginationDto,
        true,
      ); // Pass true for includeDeleted

      expect(result.data).toEqual(expectedPerfis);
      expect(result.total).toBe(2);
      expect(mockPerfilRepository.findByNomeContaining).toHaveBeenCalledWith(
        'Test Perfil',
        0,
        10,
        true,
      );
    });
  });

  describe('atualização', () => {
    const existingPerfil = {
      id: 1,
      nome: 'Old Perfil',
      codigo: 'OLD_PERFIL',
      descricao: 'Old Description',
      deletedAt: null,
    } as Perfil;

    it('deve atualizar um perfil', async () => {
      const updatePerfilDto = {
        nome: 'Updated Perfil',
        codigo: 'UPDATED_PERFIL',
        descricao: 'Perfil atualizado',
        permissoesIds: [1],
      };
      const expectedPerfil = {
        ...existingPerfil,
        ...updatePerfilDto,
        permissoes: [
          {
            id: 1,
            codigo: 'PERM_1',
            nome: 'Permissao 1',
            descricao: 'Desc 1',
            deletedAt: null,
          },
        ], // Added full Permissao object
      } as Perfil;

      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(
        existingPerfil,
      ); // For the findOne call inside update
      (mockPerfilRepository.update as jest.Mock).mockResolvedValue(
        expectedPerfil,
      );
      (mockPermissoesService.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        nome: 'Permissao 1',
        codigo: 'PERM_1',
        descricao: 'Desc 1',
        deletedAt: null,
      });

      const result = await service.update(1, updatePerfilDto);

      expect(result).toEqual(expectedPerfil);
      expect(mockPerfilRepository.findOne).toHaveBeenCalledWith(1, true); // Should find including deleted
      expect(mockPerfilRepository.update).toHaveBeenCalledWith(
        1,
        updatePerfilDto,
      );
      expect(mockPermissoesService.findOne).toHaveBeenCalledWith(1);
    });

    it('deve atualizar um perfil sem permissões', async () => {
      const updatePerfilDto = {
        nome: 'Updated Perfil',
        codigo: 'UPDATED_PERFIL',
        descricao: 'Perfil atualizado',
      };
      const expectedPerfil = {
        ...existingPerfil,
        ...updatePerfilDto,
      } as Perfil;

      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(
        existingPerfil,
      ); // For the findOne call inside update
      (mockPerfilRepository.update as jest.Mock).mockResolvedValue(
        expectedPerfil,
      );

      const result = await service.update(1, updatePerfilDto);

      expect(result).toEqual(expectedPerfil);
      expect(mockPerfilRepository.findOne).toHaveBeenCalledWith(1, true);
      expect(mockPerfilRepository.update).toHaveBeenCalledWith(
        1,
        updatePerfilDto,
      );
      expect(mockPermissoesService.findOne).not.toHaveBeenCalled();
    });

    it('deve lançar NotFoundException se o perfil a ser atualizado não for encontrado', async () => {
      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update(999, { nome: 'Non Existent' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPerfilRepository.findOne).toHaveBeenCalledWith(999, true);
      expect(mockPerfilRepository.update).not.toHaveBeenCalled();
    });

    it('deve lançar NotFoundException se as permissões não existirem', async () => {
      const updatePerfilDto = {
        nome: 'Perfil with Invalid Perms',
        permissoesIds: [999],
      };
      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(
        existingPerfil,
      );
      (mockPermissoesService.findOne as jest.Mock).mockRejectedValue(
        new NotFoundException('Permissão com ID 999 não encontrada'),
      );

      await expect(service.update(1, updatePerfilDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPermissoesService.findOne).toHaveBeenCalledWith(999);
      expect(mockPerfilRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('remoção', () => {
    const mockPerfil = {
      id: 1,
      nome: 'Test Perfil',
      codigo: 'TEST_PERFIL',
      descricao: 'Description',
      deletedAt: null,
    } as Perfil;

    const mockAdminUsuarioLogado: JwtPayload = {
      userId: 1,
      email: 'admin@example.com',
      perfis: [{ codigo: 'ADMIN' }], // Corrected perfis structure
    };

    const mockUserUsuarioLogado: JwtPayload = {
      userId: 2,
      email: 'user@example.com',
      perfis: [{ codigo: 'USER' }], // Corrected perfis structure
    };

    it('deve realizar soft delete de um perfil se for admin', async () => {
      const softDeletedPerfil = { ...mockPerfil, deletedAt: new Date() };
      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(mockPerfil); // Find only non-deleted
      (mockPerfilRepository.remove as jest.Mock).mockResolvedValue(
        softDeletedPerfil,
      );

      const result = await service.remove(1, mockAdminUsuarioLogado);

      expect(result).toEqual(softDeletedPerfil);
      expect(mockPerfilRepository.findOne).toHaveBeenCalledWith(1); // Removed false
      expect(mockPerfilRepository.remove).toHaveBeenCalledWith(1);
    });

    it('deve lançar NotFoundException se o perfil não for encontrado', async () => {
      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.remove(999, mockAdminUsuarioLogado)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPerfilRepository.findOne).toHaveBeenCalledWith(999); // Removed false
      expect(mockPerfilRepository.remove).not.toHaveBeenCalled();
    });

    it('deve lançar ForbiddenException se não for admin', async () => {
      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(mockPerfil);

      await expect(service.remove(1, mockUserUsuarioLogado)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPerfilRepository.findOne).toHaveBeenCalledWith(1); // Removed false
      expect(mockPerfilRepository.remove).not.toHaveBeenCalled();
    });
  });

  describe('restauração', () => {
    const mockPerfil = {
      id: 1,
      nome: 'Test Perfil',
      codigo: 'TEST_PERFIL',
      descricao: 'Description',
      deletedAt: new Date(), // Soft deleted
    } as Perfil;

    const mockAdminUsuarioLogado: JwtPayload = {
      userId: 1,
      email: 'admin@example.com',
      perfis: [{ codigo: 'ADMIN' }], // Corrected perfis structure
    };

    const mockUserUsuarioLogado: JwtPayload = {
      userId: 2,
      email: 'user@example.com',
      perfis: [{ codigo: 'USER' }], // Corrected perfis structure
    };

    it('deve restaurar um perfil com soft delete se for admin', async () => {
      const restoredPerfil = { ...mockPerfil, deletedAt: null };
      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(mockPerfil); // Find soft-deleted perfil
      (mockPerfilRepository.restore as jest.Mock).mockResolvedValue(
        restoredPerfil,
      );

      const result = await service.restore(1, mockAdminUsuarioLogado);

      expect(result).toEqual(restoredPerfil);
      expect(mockPerfilRepository.findOne).toHaveBeenCalledWith(1, true); // Should find including deleted
      expect(mockPerfilRepository.restore).toHaveBeenCalledWith(1);
    });

    it('deve lançar NotFoundException se o perfil não for encontrado', async () => {
      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.restore(999, mockAdminUsuarioLogado),
      ).rejects.toThrow(NotFoundException);
      expect(mockPerfilRepository.findOne).toHaveBeenCalledWith(999, true);
      expect(mockPerfilRepository.restore).not.toHaveBeenCalled();
    });

    it('deve lançar ConflictException se o perfil não estiver com soft delete', async () => {
      const nonDeletedPerfil = { ...mockPerfil, deletedAt: null };
      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(
        nonDeletedPerfil,
      );

      await expect(service.restore(1, mockAdminUsuarioLogado)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPerfilRepository.findOne).toHaveBeenCalledWith(1, true);
      expect(mockPerfilRepository.restore).not.toHaveBeenCalled();
    });

    it('deve lançar ForbiddenException se não for admin', async () => {
      (mockPerfilRepository.findOne as jest.Mock).mockResolvedValue(mockPerfil);

      await expect(service.restore(1, mockUserUsuarioLogado)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPerfilRepository.findOne).toHaveBeenCalledWith(1, true);
      expect(mockPerfilRepository.restore).not.toHaveBeenCalled();
    });
  });
});
