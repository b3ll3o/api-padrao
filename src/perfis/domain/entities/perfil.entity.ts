// BDD: features/perfis.feature
// SDD: .openspec/changes/perfis/design.md
// ATDD: test/perfis.e2e-spec.ts
// TDD: src/perfis/domain/entities/perfil.entity.spec.ts

import { Permissao } from 'src/permissoes/domain/entities/permissao.entity';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '../../../shared/domain/entities/base.entity';

/**
 * Entidade de domínio `Perfil` (Aggregate Root de autorização por
 * empresa).
 *
 * Após [MED-003], ganhou fábrica estática e métodos de transição.
 * Mantém a invariante de que `empresaId` é **obrigatório** (perfil
 * é sempre escopado por empresa — multi-tenancy).
 *
 * @see Permissao para as invariantes das permissões referenciadas.
 */
// BDD: features/perfis.feature:Funcionalidade: Perfis
// SDD: .openspec/changes/perfis/design.md
export class Perfil extends BaseEntity {
  @ApiProperty({ description: 'Nome do perfil', example: 'Administrador' })
  nome: string;

  @ApiProperty({ description: 'Código do perfil', example: 'ADMIN' })
  codigo: string;

  @ApiProperty({
    description: 'Descrição do perfil',
    example: 'Perfil com acesso total ao sistema',
  })
  descricao: string;

  @ApiProperty({
    description: 'ID da empresa vinculada ao perfil',
    example: 'uuid-da-empresa',
  })
  empresaId: string;

  @ApiProperty({
    description: 'Permissões associadas ao perfil',
    type: [Permissao],
    required: false,
  })
  permissoes?: Permissao[];

  /**
   * Fábrica de domínio: cria um `Perfil` válido, escopado por
   * `empresaId`.
   *
   * @throws Error se `empresaId`, `nome` ou `codigo` ausentes.
   */
  static criar(props: {
    nome: string;
    codigo: string;
    descricao?: string;
    empresaId: string;
    permissoes?: Permissao[];
  }): Perfil {
    if (!props.nome || !props.nome.trim()) {
      throw new Error('Perfil: nome é obrigatório.');
    }
    if (!props.codigo || !props.codigo.trim()) {
      throw new Error('Perfil: codigo é obrigatório.');
    }
    if (!props.empresaId || !props.empresaId.trim()) {
      throw new Error('Perfil: empresaId é obrigatório (multi-tenancy).');
    }
    const codigoNormalizado = props.codigo.trim().toUpperCase();
    if (!/^[A-Z0-9_]{2,64}$/.test(codigoNormalizado)) {
      throw new Error(
        'Perfil: codigo deve seguir UPPER_SNAKE_CASE (2-64 chars).',
      );
    }
    const p = new Perfil();
    p.nome = props.nome.trim();
    p.codigo = codigoNormalizado;
    p.descricao = (props.descricao ?? '').trim();
    p.empresaId = props.empresaId.trim();
    p.permissoes = props.permissoes ?? [];
    p.ativo = true;
    p.deletedAt = null;
    return p;
  }

  /** Soft delete. Idempotente. */
  desativar(): void {
    if (this.ativo) {
      this.ativo = false;
      this.deletedAt = this.deletedAt ?? new Date();
    }
  }

  /** Reativa um perfil soft-deletado. */
  restaurar(): void {
    if (this.ativo || !this.deletedAt) {
      throw new Error('Perfil não está desativado.');
    }
    this.ativo = true;
    this.deletedAt = null;
  }

  /**
   * Substitui o conjunto de permissões. **Não** faz merge — caller
   * decide o que fica.
   */
  definirPermissoes(permissoes: Permissao[]): void {
    this.permissoes = [...permissoes];
  }

  /**
   * Adiciona uma permissão (idempotente em `codigo`).
   * @throws Error se já existir permissão com o mesmo codigo.
   */
  adicionarPermissao(permissao: Permissao): void {
    this.permissoes = this.permissoes ?? [];
    const duplicada = this.permissoes.some(
      (p) => p.codigo === permissao.codigo,
    );
    if (duplicada) {
      throw new Error(
        `Perfil já possui permissão com codigo "${permissao.codigo}".`,
      );
    }
    this.permissoes.push(permissao);
  }

  /**
   * Remove uma permissão por `codigo`.
   * @returns `true` se removida, `false` se não encontrada.
   */
  removerPermissao(codigo: string): boolean {
    if (!this.permissoes) return false;
    const idx = this.permissoes.findIndex((p) => p.codigo === codigo);
    if (idx === -1) return false;
    this.permissoes.splice(idx, 1);
    return true;
  }

  /**
   * Verifica se o perfil possui a permissão de `codigo` (cheque útil
   * para o `PermissaoGuard` quando o JWT não traz a lista completa).
   */
  possuiPermissao(codigo: string): boolean {
    return this.permissoes?.some((p) => p.codigo === codigo) ?? false;
  }

  /** Atualiza `nome` e `descricao`. `codigo` e `empresaId` são imutáveis. */
  atualizarMetadados(props: { nome?: string; descricao?: string }): void {
    if (props.nome !== undefined) {
      if (!props.nome.trim()) {
        throw new Error('Perfil: nome não pode ser vazio.');
      }
      this.nome = props.nome.trim();
    }
    if (props.descricao !== undefined) {
      this.descricao = props.descricao.trim();
    }
  }
}
