import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  RefreshTokenRepository,
  RefreshTokenWithUser,
} from '../../domain/repositories/refresh-token.repository';

/**
 * Adapter Prisma para `RefreshTokenRepository`.
 *
 * A query `findByTokenWithUser` usa o mesmo `include` aninhado que existia
 * inline no `AuthService.refreshTokens` — centralizado aqui para que
 * `AuthService` não precise conhecer o schema do Prisma.
 *
 * [SEC-001] Persistimos apenas o **hash SHA-256** do token (`tokenHash`).
 * O token bruto nunca toca o DB — defesa contra dump da tabela
 * expor todos os refresh tokens ativos.
 */
// BDD: features/autenticacao.feature:Funcionalidade: Autenticação
@Injectable()
export class PrismaRefreshTokenRepository extends RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(data: {
    tokenHash: string;
    userId: number;
    expiresAt: Date;
  }): Promise<void> {
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: data.tokenHash,
        userId: data.userId,
        expiresAt: data.expiresAt,
      },
    });
  }

  async findByTokenWithUser(
    tokenHash: string,
  ): Promise<RefreshTokenWithUser | null> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            empresas: {
              select: {
                empresaId: true,
                perfis: {
                  select: {
                    id: true,
                    nome: true,
                    codigo: true,
                    descricao: true,
                    permissoes: {
                      select: {
                        id: true,
                        nome: true,
                        codigo: true,
                        descricao: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!record) return null;

    return {
      id: record.id,
      tokenHash: record.tokenHash,
      userId: record.userId,
      expiresAt: record.expiresAt,
      revokedAt: record.revokedAt,
      user: {
        id: record.user.id,
        email: record.user.email,
        empresas: record.user.empresas.map((ue) => ({
          empresaId: ue.empresaId,
          perfis: ue.perfis,
        })),
      },
    };
  }

  async revoke(id: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: number): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { revokedAt: new Date() },
    });
  }
}
