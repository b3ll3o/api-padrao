import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Entidade de domínio `Empresa` (Aggregate Root do tenant).
 *
 * Após [MED-003], ganhou fábrica estática e métodos de transição.
 * O `id` é gerado pelo caller (em geral um UUID vindo do DB ou
 * gerado no `criar()`) e é imutável.
 *
 * Invariantes protegidas:
 * - `nome` é obrigatório.
 * - `responsavelId` é obrigatório (toda empresa tem um owner).
 *
 * @see Perfil e Usuario (escopados por `empresaId`).
 */
// BDD: features/empresas.feature:Funcionalidade: Empresas
// SDD: .openspec/changes/empresas/design.md
export class Empresa {
  @ApiProperty({ description: 'ID da empresa (UUID)', example: 'uuid' })
  id: string;

  @ApiProperty({ description: 'Nome da empresa', example: 'Acme SA' })
  nome: string;

  @ApiPropertyOptional({
    description: 'Descrição opcional da empresa',
    nullable: true,
  })
  descricao?: string | null;

  @ApiProperty({
    description: 'Plano de assinatura (FREE, PRO, ENTERPRISE)',
    example: 'PRO',
  })
  plano: string;

  @ApiProperty({ description: 'Status ativo da empresa', example: true })
  ativo: boolean;

  @ApiProperty({
    description: 'ID do usuário responsável (owner)',
    example: 1,
  })
  responsavelId: number;

  @ApiProperty({ description: 'Data de criação' })
  createdAt: Date;

  @ApiProperty({ description: 'Data da última atualização' })
  updatedAt: Date;

  @ApiPropertyOptional({
    description: 'Data de deleção lógica (soft delete)',
    nullable: true,
  })
  deletedAt?: Date | null;

  constructor(partial: Partial<Empresa>) {
    Object.assign(this, partial);
  }

  /**
   * Fábrica de domínio: cria uma `Empresa` válida.
   * Gera `id` (UUID v4) e timestamps.
   *
   * **Nota**: usa `crypto.randomUUID()` nativo do Node 19+ (e
   * disponível no Node 20 LTS usado no Dockerfile). Em
   * ambiente de browser, o caller deve passar `id` explícito.
   */
  static criar(props: {
    nome: string;
    responsavelId: number;
    plano?: string;
    descricao?: string;
    id?: string;
  }): Empresa {
    if (!props.nome || !props.nome.trim()) {
      throw new Error('Empresa: nome é obrigatório.');
    }
    if (!Number.isInteger(props.responsavelId) || props.responsavelId <= 0) {
      throw new Error('Empresa: responsavelId deve ser inteiro positivo.');
    }
    const planoNormalizado = (props.plano ?? 'FREE').trim().toUpperCase();
    if (!['FREE', 'PRO', 'ENTERPRISE'].includes(planoNormalizado)) {
      throw new Error('Empresa: plano deve ser FREE, PRO ou ENTERPRISE.');
    }
    return new Empresa({
      id: props.id ?? crypto.randomUUID(),
      nome: props.nome.trim(),
      descricao: props.descricao?.trim() ?? null,
      plano: planoNormalizado,
      responsavelId: props.responsavelId,
      ativo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });
  }

  /** Soft delete. Idempotente. */
  desativar(): void {
    if (this.ativo) {
      this.ativo = false;
      this.deletedAt = this.deletedAt ?? new Date();
      this.updatedAt = new Date();
    }
  }

  /** Reativa uma empresa soft-deletada. */
  restaurar(): void {
    if (this.ativo || !this.deletedAt) {
      throw new Error('Empresa não está desativada.');
    }
    this.ativo = true;
    this.deletedAt = null;
    this.updatedAt = new Date();
  }

  /** Atualiza `nome` e/ou `descricao` (campos editáveis). */
  atualizarMetadados(props: {
    nome?: string;
    descricao?: string | null;
  }): void {
    if (props.nome !== undefined) {
      if (!props.nome.trim()) {
        throw new Error('Empresa: nome não pode ser vazio.');
      }
      this.nome = props.nome.trim();
    }
    if (props.descricao !== undefined) {
      this.descricao = props.descricao?.trim() ?? null;
    }
    this.updatedAt = new Date();
  }

  /**
   * Troca o plano. Apenas transições válidas são aceitas:
   * FREE → PRO → ENTERPRISE e downgrades correspondentes.
   */
  trocarPlano(novoPlano: 'FREE' | 'PRO' | 'ENTERPRISE'): void {
    const ordem = { FREE: 0, PRO: 1, ENTERPRISE: 2 } as const;
    if (!(novoPlano in ordem)) {
      throw new Error('Empresa: plano inválido.');
    }
    this.plano = novoPlano;
    this.updatedAt = new Date();
  }

  /**
   * Transfere a responsabilidade para outro usuário.
   * @throws Error se o novo responsável for o mesmo atual.
   */
  transferirResponsabilidade(novoResponsavelId: number): void {
    if (!Number.isInteger(novoResponsavelId) || novoResponsavelId <= 0) {
      throw new Error('Empresa: novoResponsavelId inválido.');
    }
    if (novoResponsavelId === this.responsavelId) {
      throw new Error('Empresa: novo responsável é o mesmo atual.');
    }
    this.responsavelId = novoResponsavelId;
    this.updatedAt = new Date();
  }
}
