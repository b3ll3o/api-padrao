import { Module } from '@nestjs/common';
import { PermissoesService } from './application/services/permissoes.service';
import { PermissoesController } from './application/controllers/permissoes.controller';
import { PermissaoRepository } from './domain/repositories/permissao.repository';
import { PrismaPermissaoRepository } from './infrastructure/repositories/prisma-permissao.repository';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PermissoesController],
  providers: [
    PermissoesService,
    {
      provide: PermissaoRepository,
      useClass: PrismaPermissaoRepository,
    },
  ],
  exports: [PermissoesService, PermissaoRepository],
})
export class PermissoesModule {}
