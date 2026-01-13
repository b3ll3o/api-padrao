import {
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { CreateUsuarioDto } from '../../dto/create-usuario.dto';
import { UpdateUsuarioDto } from '../../dto/update-usuario.dto';

import { PasswordHasher } from 'src/shared/domain/services/password-hasher.service';
import { UsuarioRepository } from '../../domain/repositories/usuario.repository';
import { Usuario } from '../../domain/entities/usuario.entity';
import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';
import { IUsuarioAuthorizationService } from './usuario-authorization.service';
import { PaginationDto } from '../../../shared/dto/pagination.dto';
import { PaginatedResponseDto } from '../../../shared/dto/paginated-response.dto';
import { EmpresaRepository } from '../../../empresas/domain/repositories/empresa.repository';

type UsuarioLogado = JwtPayload;

@Injectable()
export class UsuariosService {
  private readonly logger = new Logger(UsuariosService.name);

  constructor(
    private readonly usuarioRepository: UsuarioRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly usuarioAuthorizationService: IUsuarioAuthorizationService,
    private readonly empresaRepository: EmpresaRepository,
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

    // perfisIds logic removed as profiles are now company-scoped.

    const usuario = await this.usuarioRepository.create(newUsuario);

    this.logger.log(`Usuário criado com sucesso: ${usuario.email}`);

    delete usuario.senha;
    return usuario;
  }

  async findAll(
    paginationDto: PaginationDto,
    usuarioLogado: UsuarioLogado,
    includeDeleted: boolean = false,
  ): Promise<PaginatedResponseDto<Usuario>> {
    // Basic admin check for listing all users - Check if admin in ANY company
    const isAdmin = usuarioLogado.empresas?.some((e: any) =>
      e.perfis?.some((p: any) => p.codigo === 'ADMIN'),
    );
    if (!isAdmin) {
      throw new ForbiddenException(
        'Você não tem permissão para listar usuários',
      );
    }

    return this.usuarioRepository.findAll(paginationDto, includeDeleted);
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
    // delete usuario.perfis; // perfis property removed from direct usage
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
          throw new ConflictException(
            `Usuário com ID ${id} não está deletado.`,
          );
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
        const restoredUsuario = await this.usuarioRepository.restore(id);
        delete restoredUsuario.senha;
        return restoredUsuario; // Return immediately after restore
      } else {
        // updateUsuarioDto.ativo === false
        // Attempt to soft delete
        if (usuario.deletedAt !== null) {
          throw new ConflictException(`Usuário com ID ${id} já está deletado.`);
        }

        // Check if user is admin (restored check) - Check if admin in ANY company
        const isAdmin = usuarioLogado.empresas?.some((e: any) =>
          e.perfis?.some((p: any) => p.codigo === 'ADMIN'),
        );
        if (!isAdmin) {
          throw new ForbiddenException(
            'Você não tem permissão para deletar este usuário',
          );
        }

        const softDeletedUsuario = await this.usuarioRepository.remove(id);
        this.logger.log(
          `Usuário removido (soft-delete): ${softDeletedUsuario.email}`,
        );
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

    // Profiles update logic removed

    const updatedUsuario = await this.usuarioRepository.update(id, usuario);
    this.logger.log(`Usuário atualizado: ${updatedUsuario.email}`);

    delete updatedUsuario.senha;
    return updatedUsuario;
  }

  async findCompaniesByUser(usuarioId: number, paginationDto: PaginationDto) {
    const usuario = await this.usuarioRepository.findOne(usuarioId);
    if (!usuario) {
      throw new NotFoundException(`Usuário com ID ${usuarioId} não encontrado`);
    }
    return this.empresaRepository.findCompaniesByUser(usuarioId, paginationDto);
  }
}
