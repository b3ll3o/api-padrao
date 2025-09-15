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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return true if user has ADMIN profile', () => {
    const user: JwtPayload = {
      email: 'test@example.com',
      sub: 1,
      perfis: [{ codigo: 'ADMIN' }],
    };
    expect(service.isAdmin(user)).toBe(true);
  });

  it('should return false if user does not have ADMIN profile', () => {
    const user: JwtPayload = {
      email: 'test@example.com',
      sub: 1,
      perfis: [{ codigo: 'USER' }],
    };
    expect(service.isAdmin(user)).toBe(false);
  });

  it('should return false if user has no profiles', () => {
    const user: JwtPayload = {
      email: 'test@example.com',
      sub: 1,
      perfis: [],
    };
    expect(service.isAdmin(user)).toBe(false);
  });

  it('should return false if user profiles is undefined', () => {
    const user: JwtPayload = {
      email: 'test@example.com',
      sub: 1,
    };
    expect(service.isAdmin(user)).toBe(false);
  });
});
