import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppConfig {
  constructor(private configService: ConfigService) {}

  get nodeEnv(): string {
    return this.configService.get<string>('NODE_ENV', 'development');
  }

  get port(): number {
    return this.configService.get<number>('PORT', 3001);
  }

  get databaseUrl(): string {
    return this.configService.getOrThrow<string>('DATABASE_URL');
  }

  get jwtSecret(): string {
    return this.configService.getOrThrow<string>('JWT_SECRET');
  }

  get jwtAccessExpiresIn(): string {
    return this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m');
  }

  get jwtRefreshExpiresDays(): number {
    return this.configService.get<number>('JWT_REFRESH_EXPIRES_DAYS', 7);
  }

  get redisHost(): string {
    return this.configService.get<string>('REDIS_HOST', 'localhost');
  }

  get redisPort(): number {
    return this.configService.get<number>('REDIS_PORT', 6379);
  }

  get cacheTtl(): number {
    return this.configService.get<number>('CACHE_TTL', 600);
  }

  get throttlerShortTtl(): number {
    return this.configService.get<number>('THROTTLER_SHORT_TTL', 1000);
  }

  get throttlerShortLimit(): number {
    return this.configService.get<number>('THROTTLER_SHORT_LIMIT', 3);
  }

  get throttlerMediumTtl(): number {
    return this.configService.get<number>('THROTTLER_MEDIUM_TTL', 10000);
  }

  get throttlerMediumLimit(): number {
    return this.configService.get<number>('THROTTLER_MEDIUM_LIMIT', 20);
  }

  get throttlerLongTtl(): number {
    return this.configService.get<number>('THROTTLER_LONG_TTL', 60000);
  }

  get throttlerLongLimit(): number {
    return this.configService.get<number>('THROTTLER_LONG_LIMIT', 100);
  }

  get throttlerSensitiveTtl(): number {
    return this.configService.get<number>('THROTTLER_SENSITIVE_TTL', 60000);
  }

  get throttlerSensitiveLimit(): number {
    return this.configService.get<number>('THROTTLER_SENSITIVE_LIMIT', 10);
  }
}
