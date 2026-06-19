// BDD: features/autenticacao.feature
// SDD: .openspec/changes/auth/design.md
// ATDD: test/auth.e2e-spec.ts
// TDD: src/auth/infrastructure/repositories/prisma-password-reset-token.repository.spec.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  PasswordResetTokenCreateInput,
  PasswordResetTokenRecord,
  PasswordResetTokenRepository,
} from '../../domain/repositories/password-reset-token.repository';

/**
 * Adapter Prisma para `PasswordResetTokenRepository` (porta de domínio).
 *
 * Concentra as queries de lookup/hash/marcação de uso para que o
 * `PasswordRecoveryService` permaneça focado em orquestração. Usa
 * o índice `@unique` em `tokenHash` para lookup O(log n).
 */
// BDD: features/autenticacao.feature:Funcionalidade: Recuperação de Senha
// SDD: .openspec/changes/password-recovery/design.md:REQ-PR-002,REQ-PR-003,REQ-PR-005
@Injectable()
export class PrismaPasswordResetTokenRepository extends PasswordResetTokenRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  /**
   * Cria um novo `PasswordResetToken` com `tokenHash` já calculado.
   * O plain token **nunca** deve ser persistido.
   */
  async create(
    data: PasswordResetTokenCreateInput,
  ): Promise<PasswordResetTokenRecord> {
    const token = await this.prisma.passwordResetToken.create({
      data: {
        user: { connect: { id: data.userId } },
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
      },
    });
    return this.toRecord(token);
  }

  /**
   * Busca um token pelo `tokenHash` se (a) **não usado** e (b) **não expirado**.
   * Retorna `null` caso não satisfaça ambos os critérios — caller decide
   * se o motivo da rejeição é "expirado", "usado" ou "inválido".
   */
  async findValidByHash(
    tokenHash: string,
  ): Promise<PasswordResetTokenRecord | null> {
    const token = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    return token ? this.toRecord(token) : null;
  }

  /**
   * Invalida todos os tokens ainda não usados do usuário.
   * Chamado antes de emitir um novo token (cascade — REQ-PR-005).
   */
  async invalidateAllForUser(userId: number): Promise<void> {
    await this.prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  private toRecord(token: {
    id: string;
    tokenHash: string;
    userId: number;
    expiresAt: Date;
    usedAt: Date | null;
    createdAt: Date;
  }): PasswordResetTokenRecord {
    return {
      id: token.id,
      tokenHash: token.tokenHash,
      userId: token.userId,
      expiresAt: token.expiresAt,
      usedAt: token.usedAt,
      createdAt: token.createdAt,
    };
  }
}
