import Redis from 'ioredis';

const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  db: 1, // Use the same DB as in auth.e2e-spec.ts for rate limiting tests
});

beforeEach(async () => {
  await redisClient.flushdb();
});

afterAll(async () => {
  await redisClient.quit();
});
