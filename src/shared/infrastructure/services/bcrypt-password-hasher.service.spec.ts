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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should hash a password', async () => {
    const password = 'mysecretpassword';
    const hashedPassword = await service.hash(password);
    expect(hashedPassword).toBeDefined();
    expect(hashedPassword).not.toEqual(password);
  });

  it('should compare a password with its hash successfully', async () => {
    const password = 'mysecretpassword';
    const hashedPassword = await service.hash(password);
    const isMatch = await service.compare(password, hashedPassword);
    expect(isMatch).toBe(true);
  });

  it('should fail to compare a password with a wrong hash', async () => {
    const password = 'mysecretpassword';
    const wrongPassword = 'wrongpassword';
    const hashedPassword = await service.hash(password);
    const isMatch = await service.compare(wrongPassword, hashedPassword);
    expect(isMatch).toBe(false);
  });
});
