import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { RateLimiterService } from '../../domain/services/rate-limiter.service';

@Injectable()
export class RedisRateLimiterService implements RateLimiterService {
  private readonly redisClient: Redis;

  constructor(@Inject('REDIS_CLIENT') redisClient: Redis) {
    this.redisClient = redisClient;
  }

  async isRateLimited(
    userId: string,
    limit: number,
    durationSeconds: number,
  ): Promise<boolean> {
    const key = `rate-limit:${userId}`;
    const now = Date.now();
    const windowStart = now - durationSeconds * 1000;

    // Remove timestamps older than the window start
    await this.redisClient.zremrangebyscore(key, 0, windowStart);

    // Get the current count of requests within the window
    const count = await this.redisClient.zcard(key);

    return count >= limit;
  }

  async recordRequest(userId: string, durationSeconds: number): Promise<void> {
    const key = `rate-limit:${userId}`;
    const now = Date.now();

    // Add the current timestamp to the sorted set
    await this.redisClient.zadd(key, now.toString(), now.toString());

    // Set expiration for the key to avoid stale data
    await this.redisClient.expire(key, durationSeconds);
  }
}
