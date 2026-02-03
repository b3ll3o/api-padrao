import { Controller, Get } from '@nestjs/common';
import {
  HealthCheckService,
  HttpHealthIndicator,
  HealthCheck,
  PrismaHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../../../prisma/prisma.service';
import { Public } from '../../../auth/application/decorators/public.decorator';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private prismaIndicator: PrismaHealthIndicator,
    private prismaService: PrismaService,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
  ) {}

  @Get('live')
  @Public()
  @HealthCheck()
  @ApiOperation({
    summary: 'Liveness probe - Verifica se o processo está ativo',
  })
  checkLiveness() {
    // Verifica apenas recursos básicos do processo
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024), // Max 150MB
    ]);
  }

  @Get('ready')
  @Public()
  @HealthCheck()
  @ApiOperation({
    summary: 'Readiness probe - Verifica se as dependências estão prontas',
  })
  checkReadiness() {
    return this.health.check([
      () => this.prismaIndicator.pingCheck('database', this.prismaService),
      // Verifica se há pelo menos 1GB de disco disponível na raiz
      () =>
        this.disk.checkStorage('storage', { path: '/', thresholdPercent: 0.9 }),
    ]);
  }

  @Get('network')
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: 'Verifica conectividade externa' })
  checkNetwork() {
    return this.health.check([
      () => this.http.pingCheck('google', 'https://google.com'),
    ]);
  }
}
