import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UnitOfWork } from '../../domain/services/unit-of-work.service';

/**
 * Adapter Prisma para `UnitOfWork`.
 *
 * Usa `prisma.$transaction(callback)` (forma interativa) que:
 * - passa um `Prisma.TransactionClient` para o callback,
 * - executa tudo em uma única transação,
 * - faz rollback automático se qualquer op falhar.
 *
 * O `T` genérico em `UnitOfWork.execute<T, R>` permite que o caller
 * (ex.: `PasswordRecoveryService`) importe o tipo concreto do ORM
 * (`Prisma.TransactionClient`) e tenha type-safety no `tx`.
 */
// BDD: features/autenticacao.feature:Funcionalidade: Recuperação de Senha
@Injectable()
export class PrismaUnitOfWork extends UnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async execute<T, R>(work: (tx: T) => Promise<R>): Promise<R> {
    return this.prisma.$transaction(async (tx) =>
      work(tx as unknown as T),
    ) as Promise<R>;
  }
}
