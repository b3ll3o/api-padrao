// BDD: features/autenticacao.feature
// SDD: .openspec/changes/auth/design.md
// ATDD: test/auth.e2e-spec.ts
// TDD: src/auth/domain/services/unit-of-work.service.spec.ts

/**
 * Unit of Work — abstrai a transação atômica do banco.
 *
 * O `T` genérico é o "transaction context" — para Prisma é
 * `Prisma.TransactionClient`, para outro ORM é o equivalente. O service
 * recebe esse client e usa para executar as operações que devem ser
 * atômicas.
 *
 * O contrato mínimo é: tudo dentro do callback roda atomicamente;
 * se algo falhar, tudo é revertido.
 */
export abstract class UnitOfWork {
  /**
   * Executa o callback dentro de uma transação atômica.
   * Se qualquer operação falhar, todas as anteriores são revertidas.
   *
   * @param work Callback que recebe o transaction client e retorna o resultado.
   * @returns O valor retornado pelo callback.
   */
  abstract execute<T, R>(work: (tx: T) => Promise<R>): Promise<R>;
}
