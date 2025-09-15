import { Test, TestingModule } from '@nestjs/testing';
import { UsuarioAuthorizationService } from './usuario-authorization.service';
import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';

describe('UsuarioAuthorizationService', () => {
  let service: UsuarioAuthorizationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsuarioAuthorizationService],
    }).compile();

    service = module.get<UsuarioAuthorizationService>(
      UsuarioAuthorizationService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('canAccessUsuario', () => {
    const usuarioId = 1;

    it('should return true if user is owner', () => {
      const usuarioLogado: JwtPayload = {
        email: 'owner@example.com',
        sub: 1,
        userId: usuarioId,
      };
      expect(service.canAccessUsuario(usuarioId, usuarioLogado)).toBe(true);
    });

    it('should return true if user is admin', () => {
      const usuarioLogado: JwtPayload = {
        email: 'admin@example.com',
        sub: 2,
        userId: 2,
        perfis: [{ codigo: 'ADMIN' }],
      };
      expect(service.canAccessUsuario(usuarioId, usuarioLogado)).toBe(true);
    });

    it('should return false if user is neither owner nor admin', () => {
      const usuarioLogado: JwtPayload = {
        email: 'user@example.com',
        sub: 2,
        userId: 2,
        perfis: [{ codigo: 'USER' }],
      };
      expect(service.canAccessUsuario(usuarioId, usuarioLogado)).toBe(false);
    });

    it('should return false if user is not owner and has no profiles', () => {
      const usuarioLogado: JwtPayload = {
        email: 'user@example.com',
        sub: 2,
        userId: 2,
      };
      expect(service.canAccessUsuario(usuarioId, usuarioLogado)).toBe(false);
    });
  });

  describe('canUpdateUsuario', () => {
    const usuarioId = 1;

    it('should return true if user is owner', () => {
      const usuarioLogado: JwtPayload = {
        email: 'owner@example.com',
        sub: 1,
        userId: usuarioId,
      };
      expect(service.canUpdateUsuario(usuarioId, usuarioLogado)).toBe(true);
    });

    it('should return true if user is admin', () => {
      const usuarioLogado: JwtPayload = {
        email: 'admin@example.com',
        sub: 2,
        userId: 2,
        perfis: [{ codigo: 'ADMIN' }],
      };
      expect(service.canUpdateUsuario(usuarioId, usuarioLogado)).toBe(true);
    });

    it('should return false if user is neither owner nor admin', () => {
      const usuarioLogado: JwtPayload = {
        email: 'user@example.com',
        sub: 2,
        userId: 2,
        perfis: [{ codigo: 'USER' }],
      };
      expect(service.canUpdateUsuario(usuarioId, usuarioLogado)).toBe(false);
    });

    it('should return false if user is not owner and has no profiles', () => {
      const usuarioLogado: JwtPayload = {
        email: 'user@example.com',
        sub: 2,
        userId: 2,
      };
      expect(service.canUpdateUsuario(usuarioId, usuarioLogado)).toBe(false);
    });
  });

  describe('canDeleteUsuario', () => {
    const usuarioId = 1;

    it('should return true if user is owner', () => {
      const usuarioLogado: JwtPayload = {
        email: 'owner@example.com',
        sub: 1,
        userId: usuarioId,
      };
      expect(service.canDeleteUsuario(usuarioId, usuarioLogado)).toBe(true);
    });

    it('should return true if user is admin', () => {
      const usuarioLogado: JwtPayload = {
        email: 'admin@example.com',
        sub: 2,
        userId: 2,
        perfis: [{ codigo: 'ADMIN' }],
      };
      expect(service.canDeleteUsuario(usuarioId, usuarioLogado)).toBe(true);
    });

    it('should return false if user is neither owner nor admin', () => {
      const usuarioLogado: JwtPayload = {
        email: 'user@example.com',
        sub: 2,
        userId: 2,
        perfis: [{ codigo: 'USER' }],
      };
      expect(service.canDeleteUsuario(usuarioId, usuarioLogado)).toBe(false);
    });

    it('should return false if user is not owner and has no profiles', () => {
      const usuarioLogado: JwtPayload = {
        email: 'user@example.com',
        sub: 2,
        userId: 2,
      };
      expect(service.canDeleteUsuario(usuarioId, usuarioLogado)).toBe(false);
    });
  });

  describe('canRestoreUsuario', () => {
    const usuarioId = 1;

    it('should return true if user is admin', () => {
      const usuarioLogado: JwtPayload = {
        email: 'admin@example.com',
        sub: 2,
        userId: 2,
        perfis: [{ codigo: 'ADMIN' }],
      };
      expect(service.canRestoreUsuario(usuarioId, usuarioLogado)).toBe(true);
    });

    it('should return false if user is not admin', () => {
      const usuarioLogado: JwtPayload = {
        email: 'user@example.com',
        sub: 2,
        userId: 2,
        perfis: [{ codigo: 'USER' }],
      };
      expect(service.canRestoreUsuario(usuarioId, usuarioLogado)).toBe(false);
    });

    it('should return false if user has no profiles', () => {
      const usuarioLogado: JwtPayload = {
        email: 'user@example.com',
        sub: 2,
        userId: 2,
      };
      expect(service.canRestoreUsuario(usuarioId, usuarioLogado)).toBe(false);
    });
  });
});
