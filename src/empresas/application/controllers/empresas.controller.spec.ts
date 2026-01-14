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

  const mockEmpresa: Empresa = {
    id: 'uuid-1',
    nome: 'Empresa Teste',
    descricao: 'Descrição Teste',
    ativo: true,
    responsavelId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

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
    expect(controller).toBeDefined();
  });

  describe('create', () => {
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
    it('deve retornar uma empresa pelo ID', async () => {
      mockEmpresasService.findOne.mockResolvedValue(mockEmpresa);

      const result = await controller.findOne('uuid-1');

      expect(result).toEqual(mockEmpresa);
      expect(service.findOne).toHaveBeenCalledWith('uuid-1');
    });
  });

  describe('update', () => {
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
    it('deve remover uma empresa com sucesso', async () => {
      mockEmpresasService.remove.mockResolvedValue(undefined);

      await controller.remove('uuid-1');

      expect(service.remove).toHaveBeenCalledWith('uuid-1');
    });
  });

  describe('addUser', () => {
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
