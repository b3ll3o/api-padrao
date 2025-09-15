import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  it('deve chamar $connect em onModuleInit', async () => {
    // Mock the $connect method
    service.$connect = jest.fn().mockResolvedValue(undefined);

    await service.onModuleInit();

    expect(service.$connect).toHaveBeenCalled();
  });
});
