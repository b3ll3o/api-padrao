import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { LoginHistoryRepository } from '../../domain/repositories/login-history.repository';

/**
 * Adapter Prisma para `LoginHistoryRepository`.
 *
 * Persiste um registro de login bem-sucedido para auditoria.
 */
// BDD: features/autenticacao.feature:Funcionalidade: Autenticação
@Injectable()
export class PrismaLoginHistoryRepository extends LoginHistoryRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async record(data: {
    userId: number;
    ip?: string;
    userAgent?: string;
  }): Promise<void> {
    await this.prisma.loginHistory.create({
      data: {
        userId: data.userId,
        ip: data.ip,
        userAgent: data.userAgent,
      },
    });
  }
}
