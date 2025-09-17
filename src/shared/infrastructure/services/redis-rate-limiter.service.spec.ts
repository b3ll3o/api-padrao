import { Test, TestingModule } from '@nestjs/testing';
import { RedisRateLimiterService } from './redis-rate-limiter.service';

const mockRedisClient = {
  zadd: jest.fn(),
  zremrangebyscore: jest.fn(),
  zcard: jest.fn(),
  expire: jest.fn(),
};

describe('RedisRateLimiterService', () => {
  let service: RedisRateLimiterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisRateLimiterService,
        {
          provide: 'REDIS_CLIENT',
          useValue: mockRedisClient,
        },
      ],
    }).compile();

    service = module.get<RedisRateLimiterService>(RedisRateLimiterService);
    jest.clearAllMocks();
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  it('não deve limitar requisições dentro do limite', async () => {
    const userId = 'test-user-1';
    const limit = 3;
    const durationSeconds = 60;

    mockRedisClient.zcard.mockResolvedValue(2);

    const isLimited = await service.isRateLimited(
      userId,
      limit,
      durationSeconds,
    );

    expect(isLimited).toBe(false);
    expect(mockRedisClient.zremrangebyscore).toHaveBeenCalled();
  });

  it('deve limitar requisições quando o limite é excedido', async () => {
    const userId = 'test-user-2';
    const limit = 2;
    const durationSeconds = 60;

    mockRedisClient.zcard.mockResolvedValue(3);

    const isLimited = await service.isRateLimited(
      userId,
      limit,
      durationSeconds,
    );

    expect(isLimited).toBe(true);
    expect(mockRedisClient.zremrangebyscore).toHaveBeenCalled();
  });

  it('deve gravar uma requisição', async () => {
    const userId = 'test-user-3';
    const durationSeconds = 60;

    await service.recordRequest(userId, durationSeconds);

    expect(mockRedisClient.zadd).toHaveBeenCalled();
    expect(mockRedisClient.expire).toHaveBeenCalledWith(
      `rate-limit:${userId}`,
      durationSeconds,
    );
  });
});
