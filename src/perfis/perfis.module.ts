import { Module } from '@nestjs/common';
import { PerfisService } from './application/services/perfis.service';
import { PerfisController } from './application/controllers/perfis.controller';
import { PerfilRepository } from './domain/repositories/perfil.repository';
import { PrismaPerfilRepository } from './infrastructure/repositories/prisma-perfil.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissoesModule } from '../permissoes/permissoes.module';

@Module({
  imports: [PrismaModule, PermissoesModule],
  controllers: [PerfisController],
  providers: [
    PerfisService,
    {
      provide: PerfilRepository,
      useClass: PrismaPerfilRepository,
    },
  ],
  exports: [PerfisService, PerfilRepository],
})
export class PerfisModule {}
