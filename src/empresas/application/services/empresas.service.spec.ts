import { Test, TestingModule } from '@nestjs/testing';
import { EmpresasService } from './empresas.service';
import { EmpresaRepository } from '../../domain/repositories/empresa.repository';
import { CreateEmpresaDto } from '../../dto/create-empresa.dto';
import { Empresa } from '../../domain/entities/empresa.entity';
import { NotFoundException } from '@nestjs/common';
import { UpdateEmpresaDto } from '../../dto/update-empresa.dto';
import { PaginationDto } from '../../../shared/dto/pagination.dto';
import { PaginatedResponseDto } from '../../../shared/dto/paginated-response.dto';
import { UsuarioRepository } from '../../../usuarios/domain/repositories/usuario.repository';
import { PerfilRepository } from '../../../perfis/domain/repositories/perfil.repository';
import { AddUsuarioEmpresaDto } from '../../dto/add-usuario-empresa.dto';

describe('EmpresasService', () => {
  let service: EmpresasService;
  let repository: jest.Mocked<EmpresaRepository>;
  let usuarioRepository: jest.Mocked<UsuarioRepository>;
  let perfilRepository: jest.Mocked<PerfilRepository>;

  const mockEmpresa = new Empresa({
    id: 'uuid-123',
    nome: 'Empresa Teste',
    responsavelId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ativo: true,
  });

  const mockEmpresaRepository = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    addUserToCompany: jest.fn(),
    findUsersByCompany: jest.fn(),
  };

  const mockUsuarioRepository = {
    findOne: jest.fn(),
  };

  const mockPerfilRepository = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmpresasService,
        {
          provide: EmpresaRepository,
          useValue: mockEmpresaRepository,
        },
        {
          provide: UsuarioRepository,
          useValue: mockUsuarioRepository,
        },
        {
          provide: PerfilRepository,
          useValue: mockPerfilRepository,
        },
      ],
    }).compile();

    service = module.get<EmpresasService>(EmpresasService);
    repository = module.get(EmpresaRepository);
    usuarioRepository = module.get(UsuarioRepository);
    perfilRepository = module.get(PerfilRepository);
    jest.clearAllMocks();
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('deve criar uma nova empresa', async () => {
      const createDto: CreateEmpresaDto = {
        nome: 'Empresa Teste',
        responsavelId: 1,
      };
      repository.create.mockResolvedValue(mockEmpresa);

      const result = await service.create(createDto);

      expect(result).toEqual(mockEmpresa);
      expect(repository.create).toHaveBeenCalledWith(createDto);
    });
  });

  describe('findAll', () => {
    it('deve retornar uma lista paginada de empresas', async () => {
      const paginationDto: PaginationDto = { page: 1, limit: 10 };
      const paginatedResult: PaginatedResponseDto<Empresa> = {
        data: [mockEmpresa],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
      repository.findAll.mockResolvedValue(paginatedResult);

      const result = await service.findAll(paginationDto);

      expect(result).toEqual(paginatedResult);
      expect(repository.findAll).toHaveBeenCalledWith(paginationDto);
    });
  });

  describe('findOne', () => {
    it('deve retornar uma empresa pelo ID', async () => {
      repository.findOne.mockResolvedValue(mockEmpresa);

      const result = await service.findOne('uuid-123');

      expect(result).toEqual(mockEmpresa);
      expect(repository.findOne).toHaveBeenCalledWith('uuid-123');
    });

    it('deve lançar NotFoundException se a empresa não for encontrada', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findOne('uuid-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('deve atualizar uma empresa', async () => {
      const updateDto: UpdateEmpresaDto = { nome: 'Empresa Atualizada' };
      const updatedEmpresa = { ...mockEmpresa, nome: 'Empresa Atualizada' };
      repository.findOne.mockResolvedValue(mockEmpresa);
      repository.update.mockResolvedValue(updatedEmpresa as Empresa);

      const result = await service.update('uuid-123', updateDto);

      expect(result).toEqual(updatedEmpresa);
      expect(repository.update).toHaveBeenCalledWith('uuid-123', updateDto);
    });

    it('deve lançar NotFoundException ao tentar atualizar empresa inexistente', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.update('uuid-123', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('deve remover uma empresa', async () => {
      repository.findOne.mockResolvedValue(mockEmpresa);
      repository.remove.mockResolvedValue(undefined);

      await service.remove('uuid-123');

      expect(repository.remove).toHaveBeenCalledWith('uuid-123');
    });

    it('deve lançar NotFoundException ao tentar remover empresa inexistente', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.remove('uuid-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('addUser', () => {
    const addDto: AddUsuarioEmpresaDto = {
      usuarioId: 1,
      perfilIds: [1, 2],
    };

    it('deve adicionar um usuário a uma empresa', async () => {
      repository.findOne.mockResolvedValue(mockEmpresa);
      usuarioRepository.findOne.mockResolvedValue({ id: 1 } as any);
      perfilRepository.findOne.mockResolvedValue({ id: 1 } as any);
      repository.addUserToCompany.mockResolvedValue(undefined);

      await service.addUser('uuid-123', addDto);

      expect(repository.addUserToCompany).toHaveBeenCalledWith(
        'uuid-123',
        1,
        [1, 2],
      );
    });

    it('deve lançar NotFoundException se a empresa não existir', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.addUser('uuid-123', addDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve lançar NotFoundException se o usuário não existir', async () => {
      repository.findOne.mockResolvedValue(mockEmpresa);
      usuarioRepository.findOne.mockResolvedValue(undefined);

      await expect(service.addUser('uuid-123', addDto)).rejects.toThrow(
        `Usuário com ID ${addDto.usuarioId} não encontrado`,
      );
    });

    it('deve lançar NotFoundException se um perfil não existir', async () => {
      repository.findOne.mockResolvedValue(mockEmpresa);
      usuarioRepository.findOne.mockResolvedValue({ id: 1 } as any);
      perfilRepository.findOne.mockResolvedValue(undefined);

      await expect(service.addUser('uuid-123', addDto)).rejects.toThrow(
        `Perfil com ID ${addDto.perfilIds[0]} não encontrado`,
      );
    });
  });

  describe('findUsersByCompany', () => {
    it('deve retornar usuários da empresa', async () => {
      const paginationDto: PaginationDto = { page: 1, limit: 10 };
      repository.findOne.mockResolvedValue(mockEmpresa);
      repository.findUsersByCompany.mockResolvedValue({ data: [] } as any);

      await service.findUsersByCompany('uuid-123', paginationDto);

      expect(repository.findUsersByCompany).toHaveBeenCalledWith(
        'uuid-123',
        paginationDto,
      );
    });

    it('deve lançar NotFoundException se empresa não existir', async () => {
      repository.findOne.mockResolvedValue(null);
      await expect(service.findUsersByCompany('invalid', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
