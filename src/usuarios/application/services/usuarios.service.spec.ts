import { Test, TestingModule } from '@nestjs/testing';
import { UsuariosService } from './usuarios.service';
import { UsuarioRepository } from '../../domain/repositories/usuario.repository';
import { CreateUsuarioDto } from '../../dto/create-usuario.dto';
import { Usuario } from '../../domain/entities/usuario.entity';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UpdateUsuarioDto } from '../../dto/update-usuario.dto';
import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';
import { PasswordHasher } from 'src/shared/domain/services/password-hasher.service';
import { IUsuarioAuthorizationService } from './usuario-authorization.service';
import { EmpresaRepository } from '../../../empresas/domain/repositories/empresa.repository';

describe('UsuariosService', () => {
  let service: UsuariosService;
  let mockUsuarioRepository: {
    create: jest.Mock<Promise<Usuario>, [Partial<Usuario>]>;
    findByEmail: jest.Mock<Promise<Usuario | null>, [string]>;
    findOne: jest.Mock<
      Promise<Usuario | undefined>,
      [number, boolean | undefined]
    >;
    update: jest.Mock<Promise<Usuario>, [number, Partial<Usuario>]>;
    remove: jest.Mock<Promise<Usuario>, [number]>;
    restore: jest.Mock<Promise<Usuario>, [number]>;
  };
  let mockPasswordHasher: {
    hash: jest.Mock<Promise<string>, [string]>;
    compare: jest.Mock<Promise<boolean>, [string, string]>;
  };
  let mockUsuarioAuthorizationService: {
    canAccessUsuario: jest.Mock<boolean, [number, JwtPayload]>;
    canUpdateUsuario: jest.Mock<boolean, [number, JwtPayload]>;
    canDeleteUsuario: jest.Mock<boolean, [number, JwtPayload]>;
    canRestoreUsuario: jest.Mock<boolean, [number, JwtPayload]>;
  };
  let mockEmpresaRepository: {
    findCompaniesByUser: jest.Mock<Promise<any>, [number, any]>;
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

      (mockUsuarioRepository.findByEmail as jest.Mock).mockResolvedValue(null);
      (mockUsuarioRepository.create as jest.Mock).mockResolvedValue(
        createdUser,
      );

      const result = await service.create(createDto);

      expect(result).toEqual(createdUser);
      expect(mockUsuarioRepository.findByEmail).toHaveBeenCalledWith(
        createDto.email,
      );
      expect(mockUsuarioRepository.create).toHaveBeenCalled();
    });

    it('deve lançar ConflictException se o email já existir', async () => {
      const createDto: CreateUsuarioDto = {
        email: 'test@example.com',
        senha: 'Password123!',
      };
      const existingUser = new Usuario();
      existingUser.deletedAt = null;
      (mockUsuarioRepository.findByEmail as jest.Mock).mockResolvedValue(
        existingUser,
      );

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('deve chamar o PasswordHasher para hash da senha', async () => {
      const createDto: CreateUsuarioDto = {
        email: 'hasher@example.com',
        senha: 'Password123!',
      };
      const createdUser = new Usuario();
      createdUser.id = 1;
      createdUser.email = createDto.email;
      createdUser.deletedAt = null;

      (mockUsuarioRepository.findByEmail as jest.Mock).mockResolvedValue(null);
      (mockUsuarioRepository.create as jest.Mock).mockResolvedValue(
        createdUser,
      );

      await service.create(createDto);

      expect(mockPasswordHasher.hash).toHaveBeenCalledWith(createDto.senha);
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
      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.findOne(1, mockUsuarioLogado);

      expect(result).toEqual(mockUser);
      expect(mockUsuarioRepository.findOne).toHaveBeenCalledWith(1, false);
    });

    it('deve retornar um usuário se encontrado e includeDeleted for true', async () => {
      const deletedUser = { ...mockUser, deletedAt: new Date() };
      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(
        deletedUser,
      );

      const result = await service.findOne(1, mockUsuarioLogado, true);

      expect(result).toEqual(deletedUser);
      expect(mockUsuarioRepository.findOne).toHaveBeenCalledWith(1, true);
    });

    it('deve lançar NotFoundException se o usuário não for encontrado', async () => {
      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne(999, mockUsuarioLogado)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve lançar ForbiddenException se não tiver acesso', async () => {
      const anotherUser = new Usuario();
      anotherUser.id = 3;
      anotherUser.email = 'another@example.com';
      anotherUser.deletedAt = null;
      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(
        anotherUser,
      );
      mockUsuarioAuthorizationService.canAccessUsuario.mockReturnValueOnce(
        false,
      );

      await expect(service.findOne(3, mockUsuarioLogado)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('atualização', () => {
    const mockUser = new Usuario();
    mockUser.id = 1;
    mockUser.email = 'test@example.com';
    mockUser.deletedAt = null;

    const mockUsuarioLogado: JwtPayload = {
      userId: 1,
      email: 'test@example.com',
      empresas: [],
    };

    const mockAdminUsuarioLogado: JwtPayload = {
      userId: 2,
      email: 'admin@example.com',
      empresas: [{ id: 'empresa-1', perfis: [{ codigo: 'ADMIN' }] }],
    };

    it('deve atualizar um usuário se encontrado e permitido', async () => {
      const updateDto: UpdateUsuarioDto = { email: 'updated@example.com' };
      const updatedUser = { ...mockUser, email: 'updated@example.com' };

      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(mockUser);
      (mockUsuarioRepository.findByEmail as jest.Mock).mockResolvedValue(null);
      (mockUsuarioRepository.update as jest.Mock).mockResolvedValue(
        updatedUser,
      );
      mockUsuarioAuthorizationService.canUpdateUsuario.mockReturnValueOnce(
        true,
      );

      const result = await service.update(1, updateDto, mockUsuarioLogado);

      expect(result).toEqual(updatedUser);
      expect(mockUsuarioRepository.findOne).toHaveBeenCalledWith(1, true);
      expect(mockUsuarioRepository.update).toHaveBeenCalledWith(
        1,
        expect.any(Usuario),
      );
    });

    it('deve lançar NotFoundException se o usuário não for encontrado', async () => {
      const updateDto: UpdateUsuarioDto = { email: 'updated@example.com' };
      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update(999, updateDto, mockUsuarioLogado),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException se não tiver permissão', async () => {
      const updateDto: UpdateUsuarioDto = { email: 'updated@example.com' };
      const anotherUser = new Usuario();
      anotherUser.id = 3;
      anotherUser.email = 'another@example.com';
      anotherUser.deletedAt = null;
      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(
        anotherUser,
      );
      mockUsuarioAuthorizationService.canUpdateUsuario.mockReturnValueOnce(
        false,
      );
      (mockUsuarioRepository.update as jest.Mock).mockResolvedValue(
        anotherUser,
      );

      await expect(
        service.update(3, updateDto, mockUsuarioLogado),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar ConflictException se o email já estiver em uso por outro usuário', async () => {
      const updateDto: UpdateUsuarioDto = { email: 'existing@example.com' };
      const existingUser = new Usuario();
      existingUser.id = 2;
      existingUser.email = 'existing@example.com';
      existingUser.deletedAt = null;

      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(mockUser);
      (mockUsuarioRepository.findByEmail as jest.Mock).mockResolvedValue(
        existingUser,
      );

      await expect(
        service.update(1, updateDto, mockUsuarioLogado),
      ).rejects.toThrow(ConflictException);
    });

    it('deve restaurar um usuário com soft delete via flag ativo', async () => {
      const softDeletedUser = { ...mockUser, deletedAt: new Date() };
      const updateDto: UpdateUsuarioDto = { ativo: true };

      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(
        softDeletedUser,
      );
      mockUsuarioAuthorizationService.canRestoreUsuario.mockReturnValueOnce(
        true,
      );
      (mockUsuarioRepository.restore as jest.Mock).mockResolvedValue({
        ...softDeletedUser,
        deletedAt: null,
      });

      const result = await service.update(1, updateDto, mockUsuarioLogado);

      expect(result.deletedAt).toBeNull();
      expect(mockUsuarioRepository.restore).toHaveBeenCalledWith(1);
    });

    it('deve realizar soft delete de um usuário via flag ativo', async () => {
      const nonDeletedUser = { ...mockUser, deletedAt: null };
      const updateDto: UpdateUsuarioDto = { ativo: false };

      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(
        nonDeletedUser,
      );
      // Mock authorization to allow delete for this test case
      // Note: Actual implementation currently requires Admin role check which is commented out/TODO
      // or handled by canUpdateUsuario fallback for now.
      mockUsuarioAuthorizationService.canUpdateUsuario.mockReturnValue(true);

      (mockUsuarioRepository.remove as jest.Mock).mockResolvedValue({
        ...nonDeletedUser,
        deletedAt: new Date(),
      });

      const result = await service.update(1, updateDto, mockAdminUsuarioLogado);

      expect(result.deletedAt).not.toBeNull();
      expect(mockUsuarioRepository.remove).toHaveBeenCalledWith(1);
    });
  });

  describe('findCompaniesByUser', () => {
    it('deve retornar empresas do usuário', async () => {
      const paginationDto = { page: 1, limit: 10 };
      mockUsuarioRepository.findOne.mockResolvedValue({ id: 1 } as any);
      mockEmpresaRepository.findCompaniesByUser.mockResolvedValue({ data: [] });

      await service.findCompaniesByUser(1, paginationDto);

      expect(mockEmpresaRepository.findCompaniesByUser).toHaveBeenCalledWith(
        1,
        paginationDto,
      );
    });

    it('deve lançar NotFoundException se usuário não existir', async () => {
      mockUsuarioRepository.findOne.mockResolvedValue(undefined);
      await expect(service.findCompaniesByUser(99, {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
