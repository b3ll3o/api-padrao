// BDD: N/A (cross-cutting / infraestrutura)
// SDD: N/A
// TDD: src/prisma/prisma.service.spec.ts
//
// [A1 — analista-backend sweep 2026-06-21] CircuitBreaker (opossum)
// removido — declarado mas com zero call-sites. Prisma driver já
// tem retry/connection-pool internos. Circuit breakers são úteis
// para chamadas HTTP/SMTP externas, não para queries ao próprio DB
// no mesmo processo.

import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { softDeleteExtension } from './prisma-extension';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private _extendedClient: any;

  constructor() {
    super();
    this._extendedClient = this.$extends(softDeleteExtension);
  }

  get extended() {
    return this._extendedClient;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
