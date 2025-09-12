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

describe('UsuariosService', () => {
  let service: UsuariosService;
  let mockUsuarioRepository: {
    create: jest.Mock<Promise<Usuario>, [Partial<Usuario>]>;
    findByEmail: jest.Mock<Promise<Usuario | null>, [string]>;
    findOne: jest.Mock<Promise<Usuario | undefined>, [number, boolean | undefined]>;
    update: jest.Mock<Promise<Usuario>, [number, Partial<Usuario>]>;
    remove: jest.Mock<Promise<Usuario>, [number]>;
    restore: jest.Mock<Promise<Usuario>, [number]>;
  };

  beforeEach(async () => {
    mockUsuarioRepository = {
      create: jest.fn(),
      findByEmail: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      restore: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsuariosService,
        {
          provide: UsuarioRepository,
          useValue: mockUsuarioRepository,
        },
      ],
    }).compile();

    service = module.get<UsuariosService>(UsuariosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a user', async () => {
      const createDto: CreateUsuarioDto = {
        email: 'test@example.com',
        senha: 'Password123!',
      };
      const createdUser = new Usuario();
      createdUser.id = 1;
      createdUser.email = createDto.email;
      createdUser.deletedAt = null; // Added
      createdUser.comparePassword = jest.fn().mockResolvedValue(true); // Added mock for comparePassword

      (mockUsuarioRepository.findByEmail as jest.Mock).mockResolvedValue(null);
      (mockUsuarioRepository.create as jest.Mock).mockResolvedValue(createdUser);

      const result = await service.create(createDto);

      expect(result).toEqual(createdUser);
      expect(mockUsuarioRepository.findByEmail).toHaveBeenCalledWith(
        createDto.email,
      );
      expect(mockUsuarioRepository.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if email already exists', async () => {
      const createDto: CreateUsuarioDto = {
        email: 'test@example.com',
        senha: 'Password123!',
      };
      const existingUser = new Usuario();
      existingUser.deletedAt = null; // Added
      existingUser.comparePassword = jest.fn().mockResolvedValue(true); // Added mock for comparePassword
      (mockUsuarioRepository.findByEmail as jest.Mock).mockResolvedValue(existingUser);

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findOne', () => {
    const mockUser = new Usuario();
    mockUser.id = 1;
    mockUser.email = 'test@example.com';
    mockUser.perfis = [
      { id: 1, codigo: 'USER', nome: 'User', descricao: 'User Profile' },
    ];
    mockUser.deletedAt = null; // Added
    mockUser.comparePassword = jest.fn().mockResolvedValue(true); // Added mock for comparePassword

    const mockAdminUser = new Usuario();
    mockAdminUser.id = 2;
    mockAdminUser.email = 'admin@example.com';
    mockAdminUser.perfis = [
      { id: 2, codigo: 'ADMIN', nome: 'Admin', descricao: 'Admin Profile' },
    ];
    mockAdminUser.deletedAt = null; // Added
    mockAdminUser.comparePassword = jest.fn().mockResolvedValue(true); // Added mock for comparePassword

    const mockUsuarioLogado: JwtPayload = {
      userId: 1,
      email: 'test@example.com',
      perfis: [{ codigo: 'USER' }], // Corrected perfis structure
    };

    const mockAdminUsuarioLogado: JwtPayload = {
      userId: 2,
      email: 'admin@example.com',
      perfis: [{ codigo: 'ADMIN' }], // Corrected perfis structure
    };

    it('should return a user if found and is owner', async () => {
      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.findOne(1, mockUsuarioLogado);

      expect(result).toEqual(mockUser);
      expect(mockUsuarioRepository.findOne).toHaveBeenCalledWith(1, false); // Default includeDeleted is false
    });

    it('should return a user if found and is admin', async () => {
      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.findOne(1, mockAdminUsuarioLogado);

      expect(result).toEqual(mockUser);
      expect(mockUsuarioRepository.findOne).toHaveBeenCalledWith(1, false);
    });

    it('should return a user if found and includeDeleted is true', async () => {
      const deletedUser = { ...mockUser, deletedAt: new Date() };
      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(deletedUser);

      const result = await service.findOne(1, mockAdminUsuarioLogado, true); // Pass true for includeDeleted

      expect(result).toEqual(deletedUser);
      expect(mockUsuarioRepository.findOne).toHaveBeenCalledWith(1, true);
    });

    it('should throw NotFoundException if user not found', async () => {
      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne(999, mockUsuarioLogado)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if not owner and not admin', async () => {
      const anotherUser = new Usuario();
      anotherUser.id = 3;
      anotherUser.email = 'another@example.com';
      anotherUser.deletedAt = null; // Added
      anotherUser.comparePassword = jest.fn().mockResolvedValue(true); // Added mock for comparePassword
      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(anotherUser);

      await expect(service.findOne(3, mockUsuarioLogado)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('update', () => {
    const mockUser = new Usuario();
    mockUser.id = 1;
    mockUser.email = 'test@example.com';
    mockUser.perfis = [
      { id: 1, codigo: 'USER', nome: 'User', descricao: 'User Profile' },
    ];
    mockUser.deletedAt = null; // Added
    mockUser.comparePassword = jest.fn().mockResolvedValue(true); // Added mock for comparePassword

    const mockAdminUser = new Usuario();
    mockAdminUser.id = 2;
    mockAdminUser.email = 'admin@example.com';
    mockAdminUser.perfis = [
      { id: 2, codigo: 'ADMIN', nome: 'Admin', descricao: 'Admin Profile' },
    ];
    mockAdminUser.deletedAt = null; // Added
    mockAdminUser.comparePassword = jest.fn().mockResolvedValue(true); // Added mock for comparePassword

    const mockUsuarioLogado: JwtPayload = {
      userId: 1,
      email: 'test@example.com',
      perfis: [{ codigo: 'USER' }], // Corrected perfis structure
    };

    const mockAdminUsuarioLogado: JwtPayload = {
      userId: 2,
      email: 'admin@example.com',
      perfis: [{ codigo: 'ADMIN' }], // Corrected perfis structure
    };

    it('should update a user if found and is owner', async () => {
      const updateDto: UpdateUsuarioDto = { email: 'updated@example.com' };
      const updatedUser = { ...mockUser, email: 'updated@example.com' };

      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(mockUser);
      (mockUsuarioRepository.findByEmail as jest.Mock).mockResolvedValue(null);
      (mockUsuarioRepository.update as jest.Mock).mockResolvedValue(updatedUser);

      const result = await service.update(1, updateDto, mockUsuarioLogado);

      expect(result).toEqual(updatedUser);
      expect(mockUsuarioRepository.findOne).toHaveBeenCalledWith(1, true); // Should find including deleted
      expect(mockUsuarioRepository.update).toHaveBeenCalledWith(
        1,
        expect.any(Usuario),
      );
    });

    it('should update a user if found and is admin', async () => {
      const updateDto: UpdateUsuarioDto = {
        email: 'admin_updated@example.com',
      };
      const updatedUser = { ...mockUser, email: 'admin_updated@example.com' };

      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(mockUser);
      (mockUsuarioRepository.findByEmail as jest.Mock).mockResolvedValue(null);
      (mockUsuarioRepository.update as jest.Mock).mockResolvedValue(updatedUser);

      const result = await service.update(1, updateDto, mockAdminUsuarioLogado);

      expect(result).toEqual(updatedUser);
      expect(mockUsuarioRepository.findOne).toHaveBeenCalledWith(1, true);
      expect(mockUsuarioRepository.update).toHaveBeenCalledWith(
        1,
        expect.any(Usuario),
      );
    });

    it('should throw NotFoundException if user not found', async () => {
      const updateDto: UpdateUsuarioDto = { email: 'updated@example.com' }; // Defined within scope
      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update(999, updateDto, mockUsuarioLogado),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not owner and not admin', async () => {
      const updateDto: UpdateUsuarioDto = { email: 'updated@example.com' };
      const anotherUser = new Usuario();
      anotherUser.id = 3;
      anotherUser.email = 'another@example.com';
      anotherUser.deletedAt = null; // Added
      anotherUser.comparePassword = jest.fn().mockResolvedValue(true); // Added mock for comparePassword
      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(anotherUser);

      await expect(
        service.update(3, updateDto, mockUsuarioLogado),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if email already in use by another user', async () => {
      const updateDto: UpdateUsuarioDto = { email: 'existing@example.com' };
      const existingUser = new Usuario();
      existingUser.id = 2;
      existingUser.email = 'existing@example.com';
      existingUser.deletedAt = null; // Added
      existingUser.comparePassword = jest.fn().mockResolvedValue(true); // Added mock for comparePassword

      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(mockUser); // User to update
      (mockUsuarioRepository.findByEmail as jest.Mock).mockResolvedValue(existingUser); // Another user with same email

      await expect(
        service.update(1, updateDto, mockUsuarioLogado),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ForbiddenException if non-admin tries to change perfisIds', async () => {
      const updateDto: UpdateUsuarioDto = { perfisIds: [99] };
      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(mockUser);

      await expect(
        service.update(1, updateDto, mockUsuarioLogado),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    const mockUser = new Usuario();
    mockUser.id = 1;
    mockUser.email = 'test@example.com';
    mockUser.perfis = [
      { id: 1, codigo: 'USER', nome: 'User', descricao: 'User Profile' },
    ];
    mockUser.deletedAt = null; // Added
    mockUser.comparePassword = jest.fn().mockResolvedValue(true); // Added mock for comparePassword

    const mockAdminUser = new Usuario();
    mockAdminUser.id = 2;
    mockAdminUser.email = 'admin@example.com';
    mockAdminUser.perfis = [
      { id: 2, codigo: 'ADMIN', nome: 'Admin', descricao: 'Admin Profile' },
    ];
    mockAdminUser.deletedAt = null; // Added
    mockAdminUser.comparePassword = jest.fn().mockResolvedValue(true); // Added mock for comparePassword

    const mockUsuarioLogado: JwtPayload = {
      userId: 1,
      email: 'test@example.com',
      perfis: [{ codigo: 'USER' }], // Corrected perfis structure
    };

    const mockAdminUsuarioLogado: JwtPayload = {
      userId: 2,
      email: 'admin@example.com',
      perfis: [{ codigo: 'ADMIN' }], // Corrected perfis structure
    };

    it('should soft delete a user if found and is owner', async () => {
      const softDeletedUser = { ...mockUser, deletedAt: new Date() };
      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(mockUser);
      (mockUsuarioRepository.remove as jest.Mock).mockResolvedValue(softDeletedUser);

      const result = await service.remove(1, mockUsuarioLogado);

      expect(result).toEqual(softDeletedUser);
      expect(mockUsuarioRepository.findOne).toHaveBeenCalledWith(1); // Should find only non-deleted
      expect(mockUsuarioRepository.remove).toHaveBeenCalledWith(1);
    });

    it('should soft delete a user if found and is admin', async () => {
      const softDeletedUser = { ...mockUser, deletedAt: new Date() };
      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(mockUser);
      (mockUsuarioRepository.remove as jest.Mock).mockResolvedValue(softDeletedUser);

      const result = await service.remove(1, mockAdminUsuarioLogado);

      expect(result).toEqual(softDeletedUser);
      expect(mockUsuarioRepository.findOne).toHaveBeenCalledWith(1);
      expect(mockUsuarioRepository.remove).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if user not found', async () => {
      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.remove(999, mockUsuarioLogado)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if not owner and not admin', async () => {
      const anotherUser = new Usuario();
      anotherUser.id = 3;
      anotherUser.email = 'another@example.com';
      anotherUser.deletedAt = null; // Added
      anotherUser.comparePassword = jest.fn().mockResolvedValue(true); // Added mock for comparePassword
      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(anotherUser);

      await expect(service.remove(3, mockUsuarioLogado)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('restore', () => {
    const mockUser = new Usuario();
    mockUser.id = 1;
    mockUser.email = 'test@example.com';
    mockUser.perfis = [
      { id: 1, codigo: 'USER', nome: 'User', descricao: 'User Profile' },
    ];
    mockUser.deletedAt = new Date(); // User is soft-deleted
    mockUser.comparePassword = jest.fn().mockResolvedValue(true); // Added mock for comparePassword

    const mockAdminUsuarioLogado: JwtPayload = {
      userId: 2,
      email: 'admin@example.com',
      perfis: [{ codigo: 'ADMIN' }], // Corrected perfis structure
    };

    it('should restore a soft-deleted user if admin', async () => {
      const restoredUser = { ...mockUser, deletedAt: null };
      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(mockUser); // Find soft-deleted user
      (mockUsuarioRepository.restore as jest.Mock).mockResolvedValue(restoredUser);

      const result = await service.restore(1, mockAdminUsuarioLogado);

      expect(result).toEqual(restoredUser);
      expect(mockUsuarioRepository.findOne).toHaveBeenCalledWith(1, true); // Should find including deleted
      expect(mockUsuarioRepository.restore).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if user not found', async () => {
      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.restore(999, mockAdminUsuarioLogado),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if user is not soft-deleted', async () => {
      const nonDeletedUser = new Usuario();
      nonDeletedUser.id = 1;
      nonDeletedUser.email = 'test@example.com';
      nonDeletedUser.deletedAt = null; // Added
      nonDeletedUser.comparePassword = jest.fn().mockResolvedValue(true); // Added mock for comparePassword
      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(nonDeletedUser);

      await expect(service.restore(1, mockAdminUsuarioLogado)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ForbiddenException if not admin', async () => {
      const mockUsuarioLogado: JwtPayload = {
        userId: 1,
        email: 'test@example.com',
        perfis: [{ codigo: 'USER' }], // Corrected perfis structure
      };
      (mockUsuarioRepository.findOne as jest.Mock).mockResolvedValue(mockUser);

      await expect(service.restore(1, mockUsuarioLogado)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
