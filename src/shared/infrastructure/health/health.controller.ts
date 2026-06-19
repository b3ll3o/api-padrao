import { Controller, Get } from '@nestjs/common';
import {
  HealthCheckService,
  HealthCheck,
  PrismaHealthIndicator,
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
    private prismaIndicator: PrismaHealthIndicator,
    private prismaService: PrismaService,
    private disk: DiskHealthIndicator,
  ) {}

  // [HEALTH-001] Liveness deve ser um sinal "o processo está vivo?". Checar
  // memória aqui faz com que o k8s mate pods **saudáveis** (150MB é baixo
  // para uma API NestJS com Prisma em produção). Removido o checkHeap.
  // A spec k8s define: liveness = processo responde; readiness = pode receber
  // tráfego. Health check de memória é trabalho do Horizontal Pod Autoscaler
  // ou do monitoring, não do livenessProbe.
  @Get('live')
  @Public()
  @HealthCheck()
  @ApiOperation({
    summary: 'Liveness probe - Verifica se o processo está ativo',
  })
  checkLiveness() {
    // Lista vazia: o @HealthCheck() apenas responde 200 enquanto o
    // processo estiver rodando e o event loop não estiver travado.
    return this.health.check([]);
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
      // Verifica se há pelo menos 10% de disco disponível na raiz
      // (limite de 0.9 = usar no máximo 90% do disco)
      () =>
        this.disk.checkStorage('storage', { path: '/', thresholdPercent: 0.9 }),
    ]);
  }

  // [HEALTH-002] Removido `/health/network` que pingava Google. Em produção
  // isso causa **cascading failure**: se a internet do provedor cair, o
  // readinessProbe falha e o k8s tira todos os pods de rotação, mesmo
  // estando o DB/Redis internos OK. Conectividade externa não é sinal
  // de saúde do processo. O endpoint pode ser reintroduzido como
  // ferramenta de diagnóstico manual (sem entrar na probe do k8s).
}
