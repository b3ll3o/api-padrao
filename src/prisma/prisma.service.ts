import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { softDeleteExtension } from './prisma-extension';
import CircuitBreaker from 'opossum';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private _extendedClient: any;
  private breaker: CircuitBreaker;

  constructor() {
    super();
    this._extendedClient = this.$extends(softDeleteExtension);

    this.breaker = new CircuitBreaker(
      async (fn: () => Promise<any>) => {
        return fn();
      },
      {
        timeout: 5000, // 5 seconds
        errorThresholdPercentage: 50,
        resetTimeout: 30000, // 30 seconds
      },
    );

    this.breaker.on('open', () =>
      this.logger.warn('Database Circuit Breaker OPEN'),
    );
    this.breaker.on('halfOpen', () =>
      this.logger.log('Database Circuit Breaker HALF_OPEN'),
    );
    this.breaker.on('close', () =>
      this.logger.log('Database Circuit Breaker CLOSED'),
    );
  }

  get extended() {
    return this._extendedClient;
  }

  async runResilient<T>(fn: () => Promise<T>): Promise<T> {
    return this.breaker.fire(fn) as Promise<T>;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
