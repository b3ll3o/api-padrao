import { Test, TestingModule } from '@nestjs/testing';
import { DefaultAuthorizationService } from './default-authorization.service';
import { JwtPayload } from '../strategies/jwt.strategy';

describe('DefaultAuthorizationService', () => {
  let service: DefaultAuthorizationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DefaultAuthorizationService],
    }).compile();

    service = module.get<DefaultAuthorizationService>(
      DefaultAuthorizationService,
    );
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  it('deve retornar true se o usuário tiver perfil ADMIN', () => {
    const user: JwtPayload = {
      email: 'test@example.com',
      sub: 1,
      empresas: [{ id: 'empresa-1', perfis: [{ codigo: 'ADMIN' }] }],
    };
    expect(service.isAdmin(user)).toBe(true);
  });

  it('deve retornar false se o usuário não tiver perfil ADMIN', () => {
    const user: JwtPayload = {
      email: 'test@example.com',
      sub: 1,
      empresas: [{ id: 'empresa-1', perfis: [{ codigo: 'USER' }] }],
    };
    expect(service.isAdmin(user)).toBe(false);
  });

  it('deve retornar false se o usuário não tiver perfis', () => {
    const user: JwtPayload = {
      email: 'test@example.com',
      sub: 1,
      empresas: [{ id: 'empresa-1', perfis: [] }],
    };
    expect(service.isAdmin(user)).toBe(false);
  });

  it('deve retornar false se os perfis do usuário forem indefinidos', () => {
    const user: JwtPayload = {
      email: 'test@example.com',
      sub: 1,
    };
    expect(service.isAdmin(user)).toBe(false);
  });
});
