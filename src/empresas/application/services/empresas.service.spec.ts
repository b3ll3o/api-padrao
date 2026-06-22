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
import { ConfigService } from '@nestjs/config';
import {
  EMAIL_SENDER_SERVICE,
  EmailSenderService,
} from '../../../shared/application/services/email-sender.service';

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
    findCompaniesByUser: jest.fn(),
  };

  const mockUsuarioRepository = {
    findOne: jest.fn(),
  };

  const mockPerfilRepository = {
    findOne: jest.fn(),
    findManyByIds: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'APP_NAME') return 'API Padrão';
      if (key === 'APP_LOGIN_URL') return 'http://localhost:3000';
      return null;
    }),
  };

  const mockEmailSender: jest.Mocked<EmailSenderService> = {
    send: jest.fn().mockResolvedValue(undefined),
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
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EMAIL_SENDER_SERVICE, useValue: mockEmailSender },
      ],
    }).compile();

    service = module.get<EmpresasService>(EmpresasService);
    repository = module.get(EmpresaRepository);
    usuarioRepository = module.get(UsuarioRepository);
    perfilRepository = module.get(PerfilRepository);
    jest.clearAllMocks();
    // reset default mock implementations after clearAllMocks
    mockEmailSender.send.mockResolvedValue(undefined);
  });

  it('deve ser definido', () => {
    expect(service).toBeInstanceOf(EmpresasService);
  });

  describe('create', () => {
    // REQ-EMP-001: POST /empresas cria empresa (HTTP 201)
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
    // REQ-EMP-002: GET /empresas retorna lista paginada filtrando ativo=true/deletedAt=null
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
    // REQ-EMP-003: GET /empresas/:id retorna empresa (404 se não encontrada)
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
    // REQ-EMP-004: PATCH /empresas/:id aplica partial update (404 se id inexistente)
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
    // REQ-EMP-005: DELETE /empresas/:id realiza soft-delete (ativo=false, deletedAt=NOW)
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
    // REQ-EMP-006: POST /empresas/:id/usuarios vincula Usuario + perfis (idempotente)
    // REQ-EMP-008: validar empresa, usuário e cada perfil antes de vincular
    const addDto: AddUsuarioEmpresaDto = {
      usuarioId: 1,
      perfilIds: [1, 2],
    };

    it('deve adicionar um usuário a uma empresa', async () => {
      repository.findOne.mockResolvedValue(mockEmpresa);
      usuarioRepository.findOne.mockResolvedValue({
        id: 1,
        email: 'user@empresa.com',
        nome: 'João',
      } as any);
      perfilRepository.findManyByIds.mockResolvedValue([
        { id: 1 },
        { id: 2 },
      ] as any);
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
      usuarioRepository.findOne.mockResolvedValue({
        id: 1,
        email: 'user@empresa.com',
        nome: 'João',
      } as any);
      // retorna apenas 1 dos 2 perfis solicitados → 1 falta
      perfilRepository.findManyByIds.mockResolvedValue([{ id: 1 }] as any);

      await expect(service.addUser('uuid-123', addDto)).rejects.toThrow(
        /Perfil com ID 2 não encontrado/,
      );
    });

    // [Branch coverage] APP_LOGIN_URL ausente → fallback 'http://localhost:3000'
    it('deve usar URL padrão quando APP_LOGIN_URL não está configurada', async () => {
      repository.findOne.mockResolvedValue(mockEmpresa);
      usuarioRepository.findOne.mockResolvedValue({
        id: 1,
        email: 'user@empresa.com',
        nome: 'João',
      } as any);
      perfilRepository.findManyByIds.mockResolvedValue([
        { id: 1, nome: 'Admin' },
        { id: 2, nome: 'Leitor' },
      ] as any);
      repository.addUserToCompany.mockResolvedValue(undefined);
      // APP_LOGIN_URL não configurada (retorna null)
      mockConfigService.get.mockImplementation((key: string) =>
        key === 'APP_NAME' ? 'API Padrão' : null,
      );

      await service.addUser('uuid-123', addDto);

      expect(mockEmailSender.send).toHaveBeenCalledWith(
        'empresas.user_added',
        'user@empresa.com',
        expect.objectContaining({
          loginUrl: 'http://localhost:3000',
        }),
      );
    });

    // [Branch coverage] p.nome ?? 'perfil-${p.id}' — perfil sem nome
    it('deve usar fallback "perfil-{id}" quando algum perfil retornado não tem nome', async () => {
      repository.findOne.mockResolvedValue(mockEmpresa);
      usuarioRepository.findOne.mockResolvedValue({
        id: 1,
        email: 'user@empresa.com',
        nome: 'João',
      } as any);
      perfilRepository.findManyByIds.mockResolvedValue([
        { id: 7, nome: null },
      ] as any);
      repository.addUserToCompany.mockResolvedValue(undefined);

      await service.addUser('uuid-123', { usuarioId: 1, perfilIds: [7] });

      expect(mockEmailSender.send).toHaveBeenCalledWith(
        'empresas.user_added',
        'user@empresa.com',
        expect.objectContaining({
          perfis: 'perfil-7',
        }),
      );
    });
  });

  describe('findUsersByCompany', () => {
    // REQ-EMP-007: GET /empresas/:id/usuarios retorna usuários vinculados paginados
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

  describe('findCompaniesByUser', () => {
    // [Branch coverage] if (!usuario) — caminho de erro
    it('deve lançar NotFoundException se o usuário não existir', async () => {
      usuarioRepository.findOne.mockResolvedValue(undefined);

      await expect(service.findCompaniesByUser(999, {})).rejects.toThrow(
        `Usuário com ID 999 não encontrado`,
      );
      expect(usuarioRepository.findOne).toHaveBeenCalledWith(999);
    });

    it('deve retornar empresas do usuário quando ele existir', async () => {
      const mockUsuario = { id: 1, email: 'user@empresa.com' } as any;
      usuarioRepository.findOne.mockResolvedValue(mockUsuario);
      repository.findCompaniesByUser.mockResolvedValue({
        data: [mockEmpresa],
      } as any);

      const result = await service.findCompaniesByUser(1, {
        page: 1,
        limit: 10,
      });

      expect(result).toEqual({ data: [mockEmpresa] });
      expect(usuarioRepository.findOne).toHaveBeenCalledWith(1);
      expect(repository.findCompaniesByUser).toHaveBeenCalledWith(1, {
        page: 1,
        limit: 10,
      });
    });
  });
});
