import { Module } from '@nestjs/common';
import { PasswordHasher } from './domain/services/password-hasher.service';
import { BcryptPasswordHasherService } from './infrastructure/services/bcrypt-password-hasher.service';
import { RATE_LIMITER_SERVICE } from './domain/services/rate-limiter.service';
import { RedisRateLimiterService } from './infrastructure/services/redis-rate-limiter.service';
import Redis from 'ioredis';

@Module({
  providers: [
    {
      provide: PasswordHasher,
      useClass: BcryptPasswordHasherService,
    },
    {
      provide: 'REDIS_CLIENT',
      useFactory: () => {
        return new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
        });
      },
    },
    {
      provide: RATE_LIMITER_SERVICE,
      useClass: RedisRateLimiterService,
    },
  ],
  exports: [PasswordHasher, RATE_LIMITER_SERVICE],
})
export class SharedModule {}
