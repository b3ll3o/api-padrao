// BDD: N/A (cross-cutting / infraestrutura)
// SDD: N/A
// TDD: src/shared/infrastructure/config/app.config.spec.ts

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppConfig {
  constructor(private configService: ConfigService) {}

  get nodeEnv(): string {
    return this.configService.get<string>('NODE_ENV', 'development');
  }

  // [Sprint1-HTTP] Trust proxy: 'loopback' | 'true' | number (hops).
  // - 'loopback': apenas o primeiro hop (default seguro).
  // - 'true': confiar em qualquer proxy (NÃO usar em prod — IP spoofing).
  // - 'N' (número): confiar nos primeiros N hops.
  // BDD: features/devsecops-sprint1-quick-wins.feature:Cenário: Trust proxy reflete X-Forwarded-For
  get trustProxy(): true | 'loopback' | number {
    const raw = this.configService.get<string>('TRUST_PROXY', 'loopback');
    if (raw === 'true') return true;
    if (raw === 'loopback') return 'loopback';
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 'loopback';
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

  // [L4] Reduzido de 7 para 2 (DevSecOps sweep 2026-06-21).
  get jwtRefreshExpiresDays(): number {
    return this.configService.get<number>('JWT_REFRESH_EXPIRES_DAYS', 2);
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
