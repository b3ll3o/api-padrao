import { Test, TestingModule } from '@nestjs/testing';
import { PerfisController } from './perfis.controller';
import { PerfisService } from '../services/perfis.service';
import { CreatePerfilDto } from '../../dto/create-perfil.dto';
import { UpdatePerfilDto } from '../../dto/update-perfil.dto';
import { Perfil } from '../../domain/entities/perfil.entity';
import { PaginationDto } from '../../../shared/dto/pagination.dto';
import { PaginatedResponseDto } from '../../../shared/dto/paginated-response.dto';
import { Request } from 'express'; // Import Request
import { ForbiddenException } from '@nestjs/common'; // Import ForbiddenException

describe('PerfisController', () => {
  let controller: PerfisController;
  let service: PerfisService;

  const mockPerfisService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByNomeContaining: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    restore: jest.fn(), // Added
  };

  // Mock Request object for @Req()
  const mockRequest = (isAdmin: boolean = false, userId?: number) => {
    const req: Partial<Request> = {
      usuarioLogado: {
        userId: userId || 1,
        email: 'test@example.com',
        perfis: isAdmin ? [{ codigo: 'ADMIN' }] : [], // Corrected perfis structure
      },
    };
    return req as Request;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PerfisController],
      providers: [
        {
          provide: PerfisService,
          useValue: mockPerfisService,
        },
      ],
    }).compile();

    controller = module.get<PerfisController>(PerfisController);
    service = module.get<PerfisService>(PerfisService);
  });

  it('deve ser definido', () => {
    expect(controller).toBeDefined();
  });

  describe('criação', () => {
    it('deve criar um perfil', async () => {
      const createPerfilDto: CreatePerfilDto = {
        nome: 'Test Perfil',
        codigo: 'TEST_PERFIL',
        descricao: 'Description',
      };
      const expectedPerfil = {
        id: 1,
        ...createPerfilDto,
        deletedAt: null,
      } as Perfil; // Added deletedAt
      (mockPerfisService.create as jest.Mock).mockResolvedValue(expectedPerfil);

      const result = await controller.create(createPerfilDto);
      expect(result).toEqual(expectedPerfil);
      expect(service.create).toHaveBeenCalledWith(createPerfilDto);
    });
  });

  describe('busca de todos', () => {
    it('deve retornar uma lista paginada de perfis', async () => {
      const paginationDto: PaginationDto = { page: 1, limit: 10 };
      const expectedResponse: PaginatedResponseDto<Perfil> = {
        data: [
          {
            id: 1,
            nome: 'Perfil 1',
            codigo: 'PERFIL_1',
            descricao: 'Desc 1',
            deletedAt: null,
          } as Perfil,
        ],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
      (mockPerfisService.findAll as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const result = await controller.findAll(paginationDto);
      expect(result).toEqual(expectedResponse);
      expect(service.findAll).toHaveBeenCalledWith(paginationDto);
    });
  });

  describe('busca por um', () => {
    it('deve retornar um único perfil por ID', async () => {
      const id = '1';
      const expectedPerfil = {
        id: 1,
        nome: 'Test Perfil',
        codigo: 'TEST_PERFIL',
        descricao: 'Description',
        deletedAt: null,
      } as Perfil; // Added deletedAt
      (mockPerfisService.findOne as jest.Mock).mockResolvedValue(
        expectedPerfil,
      );

      const result = await controller.findOne(id);
      expect(result).toEqual(expectedPerfil);
      expect(service.findOne).toHaveBeenCalledWith(+id);
    });
  });

  describe('busca por nome', () => {
    it('deve retornar uma lista paginada de perfis por nome', async () => {
      const nome = 'Test';
      const paginationDto: PaginationDto = { page: 1, limit: 10 };
      const expectedResponse: PaginatedResponseDto<Perfil> = {
        data: [
          {
            id: 1,
            nome: 'Test Perfil',
            codigo: 'TEST_PERFIL',
            descricao: 'Description',
            deletedAt: null,
          } as Perfil,
        ],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
      (mockPerfisService.findByNomeContaining as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const result = await controller.findByNome(nome, paginationDto);
      expect(result).toEqual(expectedResponse);
      expect(service.findByNomeContaining).toHaveBeenCalledWith(
        nome,
        paginationDto,
      );
    });
  });

  describe('atualização', () => {
    it('deve atualizar um perfil', async () => {
      const id = '1';
      const updatePerfilDto: UpdatePerfilDto = {
        nome: 'Updated Perfil',
      };
      const expectedPerfil = {
        id: 1,
        ...updatePerfilDto,
        deletedAt: null,
      } as Perfil; // Added deletedAt
      (mockPerfisService.update as jest.Mock).mockResolvedValue(expectedPerfil);

      const result = await controller.update(id, updatePerfilDto);
      expect(result).toEqual(expectedPerfil);
      expect(service.update).toHaveBeenCalledWith(+id, updatePerfilDto);
    });
  });

  describe('remoção', () => {
    const mockPerfil = {
      id: 1,
      nome: 'Test Perfil',
      codigo: 'TEST_PERFIL',
      descricao: 'Description',
      deletedAt: null,
    } as Perfil; // Corrected
    const softDeletedPerfil = {
      ...mockPerfil,
      deletedAt: new Date(),
    } as Perfil;

    it('deve realizar soft delete de um perfil', async () => {
      (mockPerfisService.remove as jest.Mock).mockResolvedValue(
        softDeletedPerfil,
      );
      const req = mockRequest(true); // Admin user

      const result = await controller.remove('1', req);
      expect(result).toEqual(softDeletedPerfil);
      expect(service.remove).toHaveBeenCalledWith(1, req.usuarioLogado);
    });

    it('deve lançar ForbiddenException se o usuário não estiver autenticado', async () => {
      const req: Partial<Request> = { usuarioLogado: undefined };
      let error: any;
      try {
        await controller.remove('1', req as Request);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.message).toBe('Usuário não autenticado');
    });
  });

  describe('restauração', () => {
    const mockPerfil = {
      id: 1,
      nome: 'Test Perfil',
      codigo: 'TEST_PERFIL',
      descricao: 'Description',
      deletedAt: new Date(),
    } as Perfil; // Corrected
    const restoredPerfil = { ...mockPerfil, deletedAt: null } as Perfil;

    it('deve restaurar um perfil', async () => {
      (mockPerfisService.restore as jest.Mock).mockResolvedValue(
        restoredPerfil,
      );
      const req = mockRequest(true); // Admin user

      const result = await controller.restore('1', req);
      expect(result).toEqual(restoredPerfil);
      expect(service.restore).toHaveBeenCalledWith(1, req.usuarioLogado);
    });

    it('deve lançar ForbiddenException se o usuário não estiver autenticado', async () => {
      const req: Partial<Request> = { usuarioLogado: undefined };
      let error: any;
      try {
        await controller.restore('1', req as Request);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.message).toBe('Usuário não autenticado');
    });
  });
});
