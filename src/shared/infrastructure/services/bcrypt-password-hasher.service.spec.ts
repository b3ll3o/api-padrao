import { Test, TestingModule } from '@nestjs/testing';
import { BcryptPasswordHasherService } from './bcrypt-password-hasher.service';

describe('BcryptPasswordHasherService', () => {
  let service: BcryptPasswordHasherService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BcryptPasswordHasherService],
    }).compile();

    service = module.get<BcryptPasswordHasherService>(
      BcryptPasswordHasherService,
    );
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  it('deve fazer o hash de uma senha', async () => {
    const password = 'mysecretpassword';
    const hashedPassword = await service.hash(password);
    expect(hashedPassword).toBeDefined();
    expect(hashedPassword).not.toEqual(password);
  });

  it('deve comparar uma senha com seu hash com sucesso', async () => {
    const password = 'mysecretpassword';
    const hashedPassword = await service.hash(password);
    const isMatch = await service.compare(password, hashedPassword);
    expect(isMatch).toBe(true);
  });

  it('deve falhar ao comparar uma senha com um hash errado', async () => {
    const password = 'mysecretpassword';
    const wrongPassword = 'wrongpassword';
    const hashedPassword = await service.hash(password);
    const isMatch = await service.compare(wrongPassword, hashedPassword);
    expect(isMatch).toBe(false);
  });
});
