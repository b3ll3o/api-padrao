// BDD: features/permissoes.feature
// SDD: .openspec/changes/permissoes/design.md
// ATDD: test/permissoes.e2e-spec.ts
// TDD: src/permissoes/domain/entities/permissao.entity.spec.ts

import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '../../../shared/domain/entities/base.entity';

/**
 * Entidade de domínio `Permissao`.
 *
 * Após [MED-003], passou de "saco de campos" para um agregado com
 * fábrica estática e transições de estado explícitas. O service
 * (camada Application) delega as invariantes de domínio para cá.
 *
 * Invariantes protegidas:
 * - `codigo` é **obrigatório** e normalizado para UPPER_SNAKE_CASE.
 * - `nome` é obrigatório (trim).
 * - `descricao` pode ser vazia, mas não `undefined`.
 * - Soft delete: `desativar()` zera `ativo` e seta `deletedAt`.
 * - Restauração: `restaurar()` reativa e zera `deletedAt`.
 *
 * **NÃO** aceita mutação direta de `codigo` após criação
 * (imutabilidade do identificador de domínio).
 */
// BDD: features/permissoes.feature:Funcionalidade: Permissões
// SDD: .openspec/changes/permissoes/design.md
export class Permissao extends BaseEntity {
  @ApiProperty({ description: 'Nome da permissão', example: 'read:users' })
  nome: string;

  @ApiProperty({ description: 'Código da permissão', example: 'READ_USERS' })
  codigo: string;

  @ApiProperty({
    description: 'Descrição da permissão',
    example: 'Permite ler usuários',
  })
  descricao: string;

  /**
   * Fábrica de domínio: cria uma `Permissao` válida.
   *
   * @throws Error se `codigo` ou `nome` ausentes.
   * @throws Error se `codigo` não bater no regex UPPER_SNAKE_CASE.
   */
  static criar(props: {
    nome: string;
    codigo: string;
    descricao?: string;
  }): Permissao {
    if (!props.nome || !props.nome.trim()) {
      throw new Error('Permissão: nome é obrigatório.');
    }
    if (!props.codigo || !props.codigo.trim()) {
      throw new Error('Permissão: codigo é obrigatório.');
    }
    const codigoNormalizado = props.codigo.trim().toUpperCase();
    if (!/^[A-Z0-9_]{2,64}$/.test(codigoNormalizado)) {
      throw new Error(
        'Permissão: codigo deve seguir UPPER_SNAKE_CASE (2-64 chars).',
      );
    }
    const p = new Permissao();
    p.nome = props.nome.trim();
    p.codigo = codigoNormalizado;
    p.descricao = (props.descricao ?? '').trim();
    p.ativo = true;
    p.deletedAt = null;
    return p;
  }

  /**
   * Transição de estado: desativar a permissão (soft delete).
   * Idempotente — chamar de novo mantém o `deletedAt` original.
   */
  desativar(): void {
    if (this.ativo) {
      this.ativo = false;
      this.deletedAt = this.deletedAt ?? new Date();
    }
  }

  /**
   * Transição de estado: restaurar a permissão.
   * @throws Error se a permissão não estiver soft-deletada.
   */
  restaurar(): void {
    if (this.ativo || !this.deletedAt) {
      throw new Error('Permissão não está desativada.');
    }
    this.ativo = true;
    this.deletedAt = null;
  }

  /**
   * Atualiza apenas `nome` e `descricao` (campos editáveis).
   * `codigo` é imutável após criação (identificador de domínio).
   */
  atualizarMetadados(props: { nome?: string; descricao?: string }): void {
    if (props.nome !== undefined) {
      if (!props.nome.trim()) {
        throw new Error('Permissão: nome não pode ser vazio.');
      }
      this.nome = props.nome.trim();
    }
    if (props.descricao !== undefined) {
      this.descricao = props.descricao.trim();
    }
  }
}
