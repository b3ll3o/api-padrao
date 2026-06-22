import { Test, TestingModule } from '@nestjs/testing';
import { EmpresasController } from './empresas.controller';
import { EmpresasService } from '../services/empresas.service';
import { CreateEmpresaDto } from '../../dto/create-empresa.dto';
import { UpdateEmpresaDto } from '../../dto/update-empresa.dto';
import { AddUsuarioEmpresaDto } from '../../dto/add-usuario-empresa.dto';
import { PaginationDto } from '../../../shared/dto/pagination.dto';
import { Empresa } from '../../domain/entities/empresa.entity';
import { PaginatedResponseDto } from '../../../shared/dto/paginated-response.dto';

describe('EmpresasController', () => {
  let controller: EmpresasController;
  let service: EmpresasService;

  const mockEmpresa: Empresa = Empresa.criar({
    id: 'uuid-1',
    nome: 'Empresa Teste',
    descricao: 'Descrição Teste',
    responsavelId: 1,
  });

  const mockEmpresasService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    addUser: jest.fn(),
    findUsersByCompany: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmpresasController],
      providers: [
        {
          provide: EmpresasService,
          useValue: mockEmpresasService,
        },
      ],
    }).compile();

    controller = module.get<EmpresasController>(EmpresasController);
    service = module.get<EmpresasService>(EmpresasService);
  });

  it('deve ser definido', () => {
    expect(controller).toBeInstanceOf(EmpresasController);
  });

  describe('create', () => {
    // REQ-EMP-001: POST /empresas cria empresa (HTTP 201)
    it('deve criar uma empresa com sucesso', async () => {
      const dto: CreateEmpresaDto = {
        nome: 'Empresa Teste',
        responsavelId: 1,
      };
      mockEmpresasService.create.mockResolvedValue(mockEmpresa);

      const result = await controller.create(dto);

      expect(result).toEqual(mockEmpresa);
      expect(service.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAll', () => {
    // REQ-EMP-002: GET /empresas lista paginada filtrando soft-deletadas
    it('deve retornar empresas paginadas', async () => {
      const paginationDto: PaginationDto = { page: 1, limit: 10 };
      const paginatedResponse: PaginatedResponseDto<Empresa> = {
        data: [mockEmpresa],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
      mockEmpresasService.findAll.mockResolvedValue(paginatedResponse);

      const result = await controller.findAll(paginationDto);

      expect(result).toEqual(paginatedResponse);
      expect(service.findAll).toHaveBeenCalledWith(paginationDto);
    });
  });

  describe('findOne', () => {
    // REQ-EMP-003: GET /empresas/:id retorna empresa (404 se não encontrada)
    it('deve retornar uma empresa pelo ID', async () => {
      mockEmpresasService.findOne.mockResolvedValue(mockEmpresa);

      const result = await controller.findOne('uuid-1');

      expect(result).toEqual(mockEmpresa);
      expect(service.findOne).toHaveBeenCalledWith('uuid-1');
    });
  });

  describe('update', () => {
    // REQ-EMP-004: PATCH /empresas/:id aplica partial update
    it('deve atualizar uma empresa com sucesso', async () => {
      const dto: UpdateEmpresaDto = { nome: 'Nome Atualizado' };
      const updatedEmpresa = { ...mockEmpresa, nome: 'Nome Atualizado' };
      mockEmpresasService.update.mockResolvedValue(updatedEmpresa);

      const result = await controller.update('uuid-1', dto);

      expect(result).toEqual(updatedEmpresa);
      expect(service.update).toHaveBeenCalledWith('uuid-1', dto);
    });
  });

  describe('remove', () => {
    // REQ-EMP-005: DELETE /empresas/:id realiza soft-delete
    it('deve remover uma empresa com sucesso', async () => {
      mockEmpresasService.remove.mockResolvedValue(undefined);

      await controller.remove('uuid-1');

      expect(service.remove).toHaveBeenCalledWith('uuid-1');
    });
  });

  describe('addUser', () => {
    // REQ-EMP-006: POST /empresas/:id/usuarios vincula usuário (idempotente)
    it('deve adicionar um usuário à empresa', async () => {
      const dto: AddUsuarioEmpresaDto = {
        usuarioId: 1,
        perfilIds: [1],
      };
      mockEmpresasService.addUser.mockResolvedValue(undefined);

      await controller.addUser('uuid-1', dto);

      expect(service.addUser).toHaveBeenCalledWith('uuid-1', dto);
    });
  });

  describe('findUsersByCompany', () => {
    // REQ-EMP-007: GET /empresas/:id/usuarios retorna usuários paginados
    it('deve retornar usuários de uma empresa paginados', async () => {
      const paginationDto: PaginationDto = { page: 1, limit: 10 };
      const usersResponse = {
        data: [{ id: 1, email: 'user@test.com' }],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
      mockEmpresasService.findUsersByCompany.mockResolvedValue(usersResponse);

      const result = await controller.findUsersByCompany(
        'uuid-1',
        paginationDto,
      );

      expect(result).toEqual(usersResponse);
      expect(service.findUsersByCompany).toHaveBeenCalledWith(
        'uuid-1',
        paginationDto,
      );
    });
  });
});
