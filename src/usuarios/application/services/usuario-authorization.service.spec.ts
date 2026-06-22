import { Test, TestingModule } from '@nestjs/testing';
import { UsuarioAuthorizationService } from './usuario-authorization.service';
import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';

// REQ-USER-022: próprio userId acessa sem checagem extra
// REQ-USER-023: ADMIN acessa qualquer usuario
// REQ-USER-024: 403 quando não-próprio e não-ADMIN
// REQ-USER-034: ADMIN pode atualizar qualquer usuario
// REQ-USER-035: ADMIN soft delete
// REQ-USER-036: ADMIN restore

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

  it('deve ser definido', () => {
    expect(service).toBeInstanceOf(UsuarioAuthorizationService);
  });

  describe('pode acessar usuário', () => {
    // REQ-USER-022/023/024
    const usuarioId = 1;

    it('deve retornar true se o usuário for o proprietário', () => {
      const usuarioLogado: JwtPayload = {
        email: 'owner@example.com',
        sub: 1,
        userId: usuarioId,
      };
      expect(service.canAccessUsuario(usuarioId, usuarioLogado)).toBe(true);
    });

    it('deve retornar true se o usuário for admin', () => {
      const usuarioLogado: JwtPayload = {
        email: 'admin@example.com',
        sub: 2,
        userId: 2,
        empresas: [{ id: 'empresa-1', perfis: [{ codigo: 'ADMIN' }] }],
      };
      expect(service.canAccessUsuario(usuarioId, usuarioLogado)).toBe(true);
    });

    it('deve retornar false se o usuário não for proprietário nem admin', () => {
      const usuarioLogado: JwtPayload = {
        email: 'user@example.com',
        sub: 2,
        userId: 2,
        empresas: [{ id: 'empresa-1', perfis: [{ codigo: 'USER' }] }],
      };
      expect(service.canAccessUsuario(usuarioId, usuarioLogado)).toBe(false);
    });

    it('deve retornar false se o usuário não for proprietário e não tiver perfis', () => {
      const usuarioLogado: JwtPayload = {
        email: 'user@example.com',
        sub: 2,
        userId: 2,
      };
      expect(service.canAccessUsuario(usuarioId, usuarioLogado)).toBe(false);
    });
  });

  describe('pode atualizar usuário', () => {
    // REQ-USER-033/034
    const usuarioId = 1;

    it('deve retornar true se o usuário for o proprietário', () => {
      const usuarioLogado: JwtPayload = {
        email: 'owner@example.com',
        sub: 1,
        userId: usuarioId,
      };
      expect(service.canUpdateUsuario(usuarioId, usuarioLogado)).toBe(true);
    });

    it('deve retornar true se o usuário for admin', () => {
      const usuarioLogado: JwtPayload = {
        email: 'admin@example.com',
        sub: 2,
        userId: 2,
        empresas: [{ id: 'empresa-1', perfis: [{ codigo: 'ADMIN' }] }],
      };
      expect(service.canUpdateUsuario(usuarioId, usuarioLogado)).toBe(true);
    });

    it('deve retornar false se o usuário não for proprietário nem admin', () => {
      const usuarioLogado: JwtPayload = {
        email: 'user@example.com',
        sub: 2,
        userId: 2,
        empresas: [{ id: 'empresa-1', perfis: [{ codigo: 'USER' }] }],
      };
      expect(service.canUpdateUsuario(usuarioId, usuarioLogado)).toBe(false);
    });

    it('deve retornar false se o usuário não for proprietário e não tiver perfis', () => {
      const usuarioLogado: JwtPayload = {
        email: 'user@example.com',
        sub: 2,
        userId: 2,
      };
      expect(service.canUpdateUsuario(usuarioId, usuarioLogado)).toBe(false);
    });
  });

  describe('pode deletar usuário', () => {
    // REQ-USER-035: ADMIN soft delete
    const usuarioId = 1;

    it('deve retornar true se o usuário for o proprietário', () => {
      const usuarioLogado: JwtPayload = {
        email: 'owner@example.com',
        sub: 1,
        userId: usuarioId,
      };
      expect(service.canDeleteUsuario(usuarioId, usuarioLogado)).toBe(true);
    });

    it('deve retornar true se o usuário for admin', () => {
      const usuarioLogado: JwtPayload = {
        email: 'admin@example.com',
        sub: 2,
        userId: 2,
        empresas: [{ id: 'empresa-1', perfis: [{ codigo: 'ADMIN' }] }],
      };
      expect(service.canDeleteUsuario(usuarioId, usuarioLogado)).toBe(true);
    });

    it('deve retornar false se o usuário não for proprietário nem admin', () => {
      const usuarioLogado: JwtPayload = {
        email: 'user@example.com',
        sub: 2,
        userId: 2,
        empresas: [{ id: 'empresa-1', perfis: [{ codigo: 'USER' }] }],
      };
      expect(service.canDeleteUsuario(usuarioId, usuarioLogado)).toBe(false);
    });

    it('deve retornar false se o usuário não for proprietário e não tiver perfis', () => {
      const usuarioLogado: JwtPayload = {
        email: 'user@example.com',
        sub: 2,
        userId: 2,
      };
      expect(service.canDeleteUsuario(usuarioId, usuarioLogado)).toBe(false);
    });
  });

  describe('pode restaurar usuário', () => {
    // REQ-USER-036: ADMIN restore
    const usuarioId = 1;

    it('deve retornar true se o usuário for admin', () => {
      const usuarioLogado: JwtPayload = {
        email: 'admin@example.com',
        sub: 2,
        userId: 2,
        empresas: [{ id: 'empresa-1', perfis: [{ codigo: 'ADMIN' }] }],
      };
      expect(service.canRestoreUsuario(usuarioId, usuarioLogado)).toBe(true);
    });

    it('deve retornar false se o usuário não for admin', () => {
      const usuarioLogado: JwtPayload = {
        email: 'user@example.com',
        sub: 2,
        userId: 2,
        empresas: [{ id: 'empresa-1', perfis: [{ codigo: 'USER' }] }],
      };
      expect(service.canRestoreUsuario(usuarioId, usuarioLogado)).toBe(false);
    });

    it('deve retornar false se o usuário não tiver perfis', () => {
      const usuarioLogado: JwtPayload = {
        email: 'user@example.com',
        sub: 2,
        userId: 2,
      };
      expect(service.canRestoreUsuario(usuarioId, usuarioLogado)).toBe(false);
    });
  });
});
