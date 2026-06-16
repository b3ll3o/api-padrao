import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UsuarioEmpresa } from './usuario-empresa.entity';
import { Exclude } from 'class-transformer';
import { BaseEntity } from '../../../shared/domain/entities/base.entity';

/**
 * Entidade de domínio `Usuario`.
 *
 * Após [MED-003], ganhou fábrica estática e métodos de transição.
 * `senha` **nunca** deve ser serializada em responses
 * (anotada com `@Exclude` e blindada pela factory).
 *
 * Invariantes protegidas:
 * - `email` é obrigatório e validado por regex.
 * - `senha` é sempre armazenada como **hash** (bcrypt/argon2);
 *   o setter é privado por design — use `trocarSenha(hash)`.
 * - Soft delete: `desativar()` zera `ativo` e seta `deletedAt`.
 * - Restauração: `restaurar()` reativa e zera `deletedAt`.
 *
 * @see Perfil e UsuarioEmpresa para o vínculo multi-tenant.
 */
// BDD: features/usuarios.feature:Funcionalidade: Usuários
// SDD: .openspec/changes/usuarios/design.md
export class Usuario extends BaseEntity {
  @ApiProperty({
    description: 'Email do usuário',
    example: 'usuario@exemplo.com',
  })
  email: string;

  @ApiPropertyOptional({
    description: 'Senha do usuário (não retornada nas consultas)',
    example: 'senha123',
    writeOnly: true,
  })
  @Exclude()
  senha?: string;

  @ApiPropertyOptional({
    description:
      'Lista de empresas e seus respectivos perfis associados ao usuário',
    type: [UsuarioEmpresa],
  })
  empresas?: UsuarioEmpresa[];

  /**
   * Fábrica de domínio: cria um `Usuario` válido.
   *
   * @param props.email Email (validado por regex)
   * @param props.senhaHash Hash bcrypt/argon2 (NUNCA plaintext)
   * @param props.id    Opcional — caller pode passar ID numérico
   *                    (autoincrement do DB). Se ausente, `id` fica
   *                    `undefined` e o repositório preenche após
   *                    o `create`.
   * @param props.empresas  Vínculos multi-tenant opcionais
   *
   * @throws Error se email inválido ou senhaHash ausente.
   */
  static criar(props: {
    email: string;
    senhaHash: string;
    id?: number;
    empresas?: UsuarioEmpresa[];
  }): Usuario {
    if (!props.email || !props.email.trim()) {
      throw new Error('Usuário: email é obrigatório.');
    }
    const emailNormalizado = props.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
      throw new Error('Usuário: email inválido.');
    }
    if (!props.senhaHash || typeof props.senhaHash !== 'string') {
      throw new Error('Usuário: senhaHash é obrigatório.');
    }
    const u = new Usuario();
    if (props.id !== undefined) {
      u.id = props.id;
    }
    u.email = emailNormalizado;
    u.senha = props.senhaHash;
    u.ativo = true;
    u.deletedAt = null;
    u.empresas = props.empresas ?? [];
    return u;
  }

  /**
   * Transição de estado: desativar o usuário (soft delete).
   * Idempotente — chamar de novo mantém o `deletedAt` original.
   */
  desativar(): void {
    if (this.ativo) {
      this.ativo = false;
      this.deletedAt = this.deletedAt ?? new Date();
    }
  }

  /**
   * Transição de estado: restaurar o usuário.
   * @throws Error se o usuário não estiver soft-deletado.
   */
  restaurar(): void {
    if (this.ativo || !this.deletedAt) {
      throw new Error('Usuário não está desativado.');
    }
    this.ativo = true;
    this.deletedAt = null;
  }

  /**
   * Troca a senha. Caller é responsável por aplicar o hash antes
   * (bcrypt/argon2). **NUNCA** chame com plaintext em produção.
   */
  trocarSenha(novoHash: string): void {
    if (!novoHash || typeof novoHash !== 'string') {
      throw new Error('Usuário: novoHash inválido.');
    }
    this.senha = novoHash;
  }

  /**
   * Atualiza o email. Re-valida formato e normaliza para lowercase.
   */
  atualizarEmail(novoEmail: string): void {
    if (!novoEmail || !novoEmail.trim()) {
      throw new Error('Usuário: email é obrigatório.');
    }
    const emailNormalizado = novoEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
      throw new Error('Usuário: email inválido.');
    }
    this.email = emailNormalizado;
  }
}
