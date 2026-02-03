import { Test, TestingModule } from '@nestjs/testing';
import { UsuariosService } from './usuarios.service';
import { UsuarioRepository } from '../../domain/repositories/usuario.repository';
import { CreateUsuarioDto } from '../../dto/create-usuario.dto';
import { Usuario } from '../../domain/entities/usuario.entity';
import { ForbiddenException } from '@nestjs/common';
import { UpdateUsuarioDto } from '../../dto/update-usuario.dto';
import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';
import { PasswordHasher } from 'src/shared/domain/services/password-hasher.service';
import { IUsuarioAuthorizationService } from './usuario-authorization.service';
import { EmpresaRepository } from '../../../empresas/domain/repositories/empresa.repository';

describe('UsuariosService', () => {
  let service: UsuariosService;
  let mockUsuarioRepository: {
    create: jest.Mock;
    findByEmail: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    restore: jest.Mock;
    findAll: jest.Mock;
  };
  let mockPasswordHasher: {
    hash: jest.Mock;
    compare: jest.Mock;
  };
  let mockUsuarioAuthorizationService: {
    canAccessUsuario: jest.Mock;
    canUpdateUsuario: jest.Mock;
    canDeleteUsuario: jest.Mock;
    canRestoreUsuario: jest.Mock;
  };
  let mockEmpresaRepository: {
    findCompaniesByUser: jest.Mock;
  };

  beforeEach(async () => {
    mockUsuarioRepository = {
      create: jest.fn(),
      findByEmail: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn().mockImplementation((id, data) => {
        const updatedUser = new Usuario();
        Object.assign(updatedUser, { id, ...data });
        return updatedUser;
      }),
      remove: jest.fn(),
      restore: jest.fn(),
      findAll: jest.fn(),
    };
    mockPasswordHasher = {
      hash: jest.fn().mockResolvedValue('hashedPassword'),
      compare: jest.fn().mockResolvedValue(true),
    };
    mockUsuarioAuthorizationService = {
      canAccessUsuario: jest.fn().mockReturnValue(true),
      canUpdateUsuario: jest.fn().mockReturnValue(true),
      canDeleteUsuario: jest.fn().mockReturnValue(true),
      canRestoreUsuario: jest.fn().mockReturnValue(true),
    };
    mockEmpresaRepository = {
      findCompaniesByUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsuariosService,
        {
          provide: UsuarioRepository,
          useValue: mockUsuarioRepository,
        },
        {
          provide: PasswordHasher,
          useValue: mockPasswordHasher,
        },
        {
          provide: IUsuarioAuthorizationService,
          useValue: mockUsuarioAuthorizationService,
        },
        {
          provide: EmpresaRepository,
          useValue: mockEmpresaRepository,
        },
      ],
    }).compile();

    service = module.get<UsuariosService>(UsuariosService);
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  describe('criação', () => {
    it('deve criar um usuário', async () => {
      const createDto: CreateUsuarioDto = {
        email: 'test@example.com',
        senha: 'Password123!',
      };
      const createdUser = new Usuario();
      createdUser.id = 1;
      createdUser.email = createDto.email;
      createdUser.deletedAt = null;

      mockUsuarioRepository.findByEmail.mockResolvedValue(null);
      mockUsuarioRepository.create.mockResolvedValue(createdUser);

      const result = await service.create(createDto);

      expect(result).toEqual(createdUser);
      expect(mockUsuarioRepository.findByEmail).toHaveBeenCalledWith(
        createDto.email,
      );
      expect(mockUsuarioRepository.create).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    const mockAdminUsuarioLogado: JwtPayload = {
      userId: 2,
      email: 'admin@example.com',
      empresas: [{ id: 'empresa-1', perfis: [{ codigo: 'ADMIN' }] }],
    };

    it('deve listar usuários para um administrador', async () => {
      mockUsuarioRepository.findAll.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });

      const result = await service.findAll(
        { page: 1, limit: 10 },
        mockAdminUsuarioLogado,
        false,
        'empresa-1',
      );

      expect(result.data).toBeInstanceOf(Array);
      expect(mockUsuarioRepository.findAll).toHaveBeenCalledWith(
        { page: 1, limit: 10 },
        false,
      );
    });

    it('deve lançar ForbiddenException para não-administradores', async () => {
      const mockUsuarioLogado: JwtPayload = {
        userId: 1,
        email: 'test@example.com',
        empresas: [],
      };
      await expect(
        service.findAll({ page: 1, limit: 10 }, mockUsuarioLogado),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('busca por um', () => {
    const mockUser = new Usuario();
    mockUser.id = 1;
    mockUser.email = 'test@example.com';
    mockUser.deletedAt = null;

    const mockUsuarioLogado: JwtPayload = {
      userId: 1,
      email: 'test@example.com',
      empresas: [],
    };

    it('deve retornar um usuário se encontrado e permitido', async () => {
      mockUsuarioRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findOne(1, mockUsuarioLogado);

      expect(result).toEqual(mockUser);
      expect(mockUsuarioRepository.findOne).toHaveBeenCalledWith(1, false);
    });
  });

  describe('atualização', () => {
    const mockUser = new Usuario();
    mockUser.id = 1;
    mockUser.email = 'test@example.com';
    mockUser.deletedAt = null;

    const mockAdminUsuarioLogado: JwtPayload = {
      userId: 2,
      email: 'admin@example.com',
      empresas: [{ id: 'empresa-1', perfis: [{ codigo: 'ADMIN' }] }],
    };

    it('deve atualizar um usuário se encontrado e permitido', async () => {
      const updateDto: UpdateUsuarioDto = { email: 'updated@example.com' };
      const updatedUser = { ...mockUser, email: 'updated@example.com' };

      mockUsuarioRepository.findOne.mockResolvedValue(mockUser);
      mockUsuarioRepository.findByEmail.mockResolvedValue(null);
      mockUsuarioRepository.update.mockResolvedValue(updatedUser);

      const result = await service.update(1, updateDto, mockAdminUsuarioLogado);

      expect(result).toEqual(updatedUser);
      expect(mockUsuarioRepository.findOne).toHaveBeenCalledWith(1, true);
    });

    it('deve realizar soft delete de um usuário via flag ativo', async () => {
      const nonDeletedUser = { ...mockUser, deletedAt: null };
      const updateDto: UpdateUsuarioDto = { ativo: false };

      mockUsuarioRepository.findOne.mockResolvedValue(nonDeletedUser);
      mockUsuarioRepository.remove.mockResolvedValue({
        ...nonDeletedUser,
        deletedAt: new Date(),
      });

      const result = await service.update(
        1,
        updateDto,
        mockAdminUsuarioLogado,
        'empresa-1',
      );

      expect(result.deletedAt).not.toBeNull();
      expect(mockUsuarioRepository.remove).toHaveBeenCalledWith(1);
    });
  });
});
