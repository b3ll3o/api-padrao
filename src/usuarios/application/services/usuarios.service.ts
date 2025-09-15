import {
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateUsuarioDto } from '../../dto/create-usuario.dto';
import { UpdateUsuarioDto } from '../../dto/update-usuario.dto';

import { PasswordHasher } from 'src/shared/domain/services/password-hasher.service';
import { UsuarioRepository } from '../../domain/repositories/usuario.repository';
import { Usuario } from '../../domain/entities/usuario.entity';
import { Perfil } from 'src/perfis/domain/entities/perfil.entity';
import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';
import { IUsuarioAuthorizationService } from './usuario-authorization.service';

type UsuarioLogado = JwtPayload;

@Injectable()
export class UsuariosService {
  constructor(
    private readonly usuarioRepository: UsuarioRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly usuarioAuthorizationService: IUsuarioAuthorizationService,
  ) {}

  async create(createUsuarioDto: CreateUsuarioDto) {
    const usuarioExistente = await this.usuarioRepository.findByEmail(
      createUsuarioDto.email,
    );

    if (usuarioExistente) {
      throw new ConflictException('Usuário com este e-mail já cadastrado.');
    }

    const newUsuario = new Usuario();
    newUsuario.email = createUsuarioDto.email;
    newUsuario.senha = undefined; // Initialize senha to undefined

    if (createUsuarioDto.senha) {
      newUsuario.senha = await this.passwordHasher.hash(createUsuarioDto.senha);
    }

    // Assign perfilId if provided
    if (createUsuarioDto.perfisIds) {
      newUsuario.perfis = createUsuarioDto.perfisIds.map(
        (id) => ({ id }) as Perfil,
      );
    }

    const usuario = await this.usuarioRepository.create(newUsuario);

    delete usuario.senha;
    return usuario;
  }

  async findOne(
    id: number,
    usuarioLogado: UsuarioLogado,
    includeDeleted: boolean = false,
  ): Promise<Usuario> {
    const usuario = await this.usuarioRepository.findOne(id, includeDeleted); // Pass includeDeleted
    if (!usuario) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    if (
      !this.usuarioAuthorizationService.canAccessUsuario(
        usuario.id,
        usuarioLogado,
      )
    ) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar os dados deste usuário',
      );
    }

    // Remove sensitive data
    delete usuario.senha;
    delete usuario.perfis;
    return usuario;
  }

  async update(
    id: number,
    updateUsuarioDto: UpdateUsuarioDto,
    usuarioLogado: UsuarioLogado,
  ): Promise<Usuario> {
    const usuario = await this.usuarioRepository.findOne(id, true); // Find including deleted to allow update on soft-deleted
    if (!usuario) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    // Handle 'ativo' flag for soft delete/restore
    if (updateUsuarioDto.ativo !== undefined) {
      if (updateUsuarioDto.ativo === true) {
        // Attempt to restore
        if (usuario.deletedAt === null) {
          throw new ConflictException(`Usuário com ID ${id} não está deletado.`);
        }
        if (!this.usuarioAuthorizationService.canRestoreUsuario(usuario.id, usuarioLogado)) {
          throw new ForbiddenException('Você não tem permissão para restaurar este usuário');
        }
        const restoredUsuario = await this.usuarioRepository.restore(id);
        delete restoredUsuario.senha;
        return restoredUsuario; // Return immediately after restore
      } else { // updateUsuarioDto.ativo === false
        // Attempt to soft delete
        if (usuario.deletedAt !== null) {
          throw new ConflictException(`Usuário com ID ${id} já está deletado.`);
        }
        if (!this.usuarioAuthorizationService.canDeleteUsuario(usuario.id, usuarioLogado)) {
          throw new ForbiddenException('Você não tem permissão para deletar este usuário');
        }
        const softDeletedUsuario = await this.usuarioRepository.remove(id);
        delete softDeletedUsuario.senha;
        return softDeletedUsuario; // Return immediately after soft delete
      }
    }

    if (
      !this.usuarioAuthorizationService.canUpdateUsuario(
        usuario.id,
        usuarioLogado,
      )
    ) {
      throw new ForbiddenException(
        'Você não tem permissão para atualizar os dados deste usuário',
      );
    }

    // Prevent non-admins from changing their own roles/permissions
    if (
      !this.usuarioAuthorizationService.canUpdateUsuario(
        usuario.id,
        usuarioLogado,
      ) &&
      updateUsuarioDto.perfisIds
    ) {
      throw new ForbiddenException(
        'Você não tem permissão para alterar perfis de usuário',
      );
    }

    // Update email if provided and different
    if (updateUsuarioDto.email && updateUsuarioDto.email !== usuario.email) {
      const usuarioExistente = await this.usuarioRepository.findByEmail(
        updateUsuarioDto.email,
      );
      if (usuarioExistente && usuarioExistente.id !== id) {
        throw new ConflictException(
          'Este e-mail já está em uso por outro usuário.',
        );
      }
      usuario.email = updateUsuarioDto.email;
    }

    // Update password if provided
    if (updateUsuarioDto.senha) {
      usuario.senha = await this.passwordHasher.hash(updateUsuarioDto.senha);
    }

    // Update profiles if provided and user is admin
    if (
      this.usuarioAuthorizationService.canUpdateUsuario(
        usuario.id,
        usuarioLogado,
      ) &&
      updateUsuarioDto.perfisIds
    ) {
      usuario.perfis = updateUsuarioDto.perfisIds.map(
        (perfilId) => ({ id: perfilId }) as Perfil,
      );
    }

    const updatedUsuario = await this.usuarioRepository.update(id, usuario);

    delete updatedUsuario.senha;
    return updatedUsuario;
  }

  async remove(id: number, usuarioLogado: UsuarioLogado): Promise<Usuario> {
    // Changed return type to Usuario
    const usuario = await this.usuarioRepository.findOne(id); // Find only non-deleted
    if (!usuario) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    if (
      !this.usuarioAuthorizationService.canDeleteUsuario(
        usuario.id,
        usuarioLogado,
      )
    ) {
      throw new ForbiddenException(
        'Você não tem permissão para deletar este usuário',
      );
    }

    // Prevent a user from deleting themselves if they are the only admin
    // (This is a more complex rule and might require additional logic,
    // for now, just allow admin to delete any user, and user to delete self)
    // Consider adding a check if the user is trying to delete the last admin account.

    const softDeletedUsuario = await this.usuarioRepository.remove(id); // Call repository's soft delete
    delete softDeletedUsuario.senha;
    return softDeletedUsuario;
  }

  async restore(id: number, usuarioLogado: UsuarioLogado): Promise<Usuario> {
    // New restore method
    const usuario = await this.usuarioRepository.findOne(id, true); // Find including deleted
    if (!usuario) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    if (usuario.deletedAt === null) {
      throw new ConflictException(`Usuário com ID ${id} não está deletado.`);
    }

    if (
      !this.usuarioAuthorizationService.canRestoreUsuario(
        usuario.id,
        usuarioLogado,
      )
    ) {
      throw new ForbiddenException(
        'Você não tem permissão para restaurar este usuário',
      );
    }

    const restoredUsuario = await this.usuarioRepository.restore(id); // Call repository's restore
    delete restoredUsuario.senha;
    return restoredUsuario;
  }
}
