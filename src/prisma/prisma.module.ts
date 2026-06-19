// BDD: N/A (cross-cutting / infraestrutura)
// SDD: N/A
// TDD: src/prisma/prisma.module.spec.ts

import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
