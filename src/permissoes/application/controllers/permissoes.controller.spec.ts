import { Test, TestingModule } from '@nestjs/testing';
import { PermissoesController } from './permissoes.controller';
import { PermissoesService } from '../services/permissoes.service';
import { CreatePermissaoDto } from '../../dto/create-permissao.dto';
import { UpdatePermissaoDto } from '../../dto/update-permissao.dto';
import { Permissao } from '../../domain/entities/permissao.entity';
import { PaginationDto } from '../../../dto/pagination.dto';
import { PaginatedResponseDto } from '../../../dto/paginated-response.dto';
import { Request } from 'express'; // Import Request
import { ForbiddenException } from '@nestjs/common'; // Import ForbiddenException

describe('PermissoesController', () => {
  let controller: PermissoesController;
  let service: PermissoesService;

  const mockPermissoesService = {
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
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PermissoesController],
      providers: [
        {
          provide: PermissoesService,
          useValue: mockPermissoesService,
        },
      ],
    }).compile();

    controller = module.get<PermissoesController>(PermissoesController);
    service = module.get<PermissoesService>(PermissoesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a permissao', async () => {
      const createPermissaoDto: CreatePermissaoDto = {
        nome: 'Test Permissao',
        codigo: 'TEST_PERMISSAO',
        descricao: 'Description',
      };
      const expectedPermissao = { id: 1, ...createPermissaoDto } as Permissao;
      (mockPermissoesService.create as jest.Mock).mockResolvedValue(
        expectedPermissao,
      );

      const result = await controller.create(createPermissaoDto);
      expect(result).toEqual(expectedPermissao);
      expect(service.create).toHaveBeenCalledWith(createPermissaoDto);
    });
  });

  describe('findAll', () => {
    it('should return a paginated list of permissoes', async () => {
      const paginationDto: PaginationDto = { page: 1, limit: 10 };
      const expectedResponse: PaginatedResponseDto<Permissao> = {
        data: [{ id: 1, nome: 'Permissao 1' } as Permissao],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
      (mockPermissoesService.findAll as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const result = await controller.findAll(paginationDto);
      expect(result).toEqual(expectedResponse);
      expect(service.findAll).toHaveBeenCalledWith(paginationDto);
    });
  });

  describe('findOne', () => {
    it('should return a single permissao by ID', async () => {
      const id = '1';
      const expectedPermissao = { id: 1, nome: 'Test Permissao' } as Permissao;
      (mockPermissoesService.findOne as jest.Mock).mockResolvedValue(
        expectedPermissao,
      );

      const result = await controller.findOne(id);
      expect(result).toEqual(expectedPermissao);
      expect(service.findOne).toHaveBeenCalledWith(+id);
    });
  });

  describe('findByName', () => {
    it('should return a paginated list of permissoes by name', async () => {
      const nome = 'Test';
      const paginationDto: PaginationDto = { page: 1, limit: 10 };
      const expectedResponse: PaginatedResponseDto<Permissao> = {
        data: [{ id: 1, nome: 'Test Permissao' } as Permissao],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
      (
        mockPermissoesService.findByNomeContaining as jest.Mock
      ).mockResolvedValue(expectedResponse);

      const result = await controller.findByNome(nome, paginationDto);
      expect(result).toEqual(expectedResponse);
      expect(service.findByNomeContaining).toHaveBeenCalledWith(
        nome,
        paginationDto,
      );
    });
  });

  describe('update', () => {
    it('should update a permissao', async () => {
      const id = '1';
      const updatePermissaoDto: UpdatePermissaoDto = {
        nome: 'Updated Permissao',
      };
      const expectedPermissao = { id: 1, ...updatePermissaoDto } as Permissao;
      (mockPermissoesService.update as jest.Mock).mockResolvedValue(
        expectedPermissao,
      );

      const result = await controller.update(id, updatePermissaoDto);
      expect(result).toEqual(expectedPermissao);
      expect(service.update).toHaveBeenCalledWith(+id, updatePermissaoDto);
    });
  });

  describe('remove', () => {
    const mockPermissao = {
      id: 1,
      nome: 'Test Permissao',
      codigo: 'TEST_PERMISSAO',
      descricao: 'Description',
      deletedAt: null,
    } as Permissao; // Corrected
    const softDeletedPermissao = {
      ...mockPermissao,
      deletedAt: new Date(),
    } as Permissao;

    it('should soft delete a permissao', async () => {
      (mockPermissoesService.remove as jest.Mock).mockResolvedValue(
        softDeletedPermissao,
      );
      const req = mockRequest(true); // Admin user

      const result = await controller.remove('1', req);
      expect(result).toEqual(softDeletedPermissao);
      expect(service.remove).toHaveBeenCalledWith(1, req.usuarioLogado);
    });

    it('should throw ForbiddenException if user is not authenticated', async () => {
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

  describe('restore', () => {
    const mockPermissao = {
      id: 1,
      nome: 'Test Permissao',
      codigo: 'TEST_PERMISSAO',
      descricao: 'Description',
      deletedAt: new Date(),
    } as Permissao; // Corrected
    const restoredPermissao = {
      ...mockPermissao,
      deletedAt: null,
    } as Permissao;

    it('should restore a permissao', async () => {
      (mockPermissoesService.restore as jest.Mock).mockResolvedValue(
        restoredPermissao,
      );
      const req = mockRequest(true); // Admin user

      const result = await controller.restore('1', req);
      expect(result).toEqual(restoredPermissao);
      expect(service.restore).toHaveBeenCalledWith(1, req.usuarioLogado);
    });

    it('should throw ForbiddenException if user is not authenticated', async () => {
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
