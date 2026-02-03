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
import { Roles } from '../../../shared/domain/constants/auth.constants';

type UsuarioLogado = JwtPayload;

@Injectable()
export class UsuariosService {
  private readonly logger = new Logger(UsuariosService.name);

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

    // perfisIds logic removed as profiles are now company-scoped.

    const usuario = await this.usuarioRepository.create(newUsuario);

    this.logger.log(`Usuário criado com sucesso: ${usuario.email}`);

    return usuario;
  }

  async findAll(
    paginationDto: PaginationDto,
    usuarioLogado: UsuarioLogado,
    includeDeleted: boolean = false,
    empresaId?: string,
  ): Promise<PaginatedResponseDto<Usuario>> {
    const isAdminGlobal = usuarioLogado.empresas?.some((e) =>
      e.perfis?.some((p) => p.codigo === Roles.ADMIN),
    );

    const isAdminInEmpresa =
      empresaId &&
      usuarioLogado.empresas?.some(
        (e) =>
          e.id === empresaId && e.perfis?.some((p) => p.codigo === Roles.ADMIN),
      );

    if (!isAdminGlobal && !isAdminInEmpresa) {
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

    return usuario;
  }

  async update(
    id: number,
    updateUsuarioDto: UpdateUsuarioDto,
    usuarioLogado: UsuarioLogado,
    empresaId?: string,
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
        await this.usuarioRepository.restore(id);
        usuario.deletedAt = null;
        usuario.ativo = true;
      } else {
        // updateUsuarioDto.ativo === false
        // Attempt to soft delete
        if (usuario.deletedAt !== null) {
          throw new ConflictException(`Usuário com ID ${id} já está deletado.`);
        }

        const isAdminInEmpresa =
          empresaId &&
          usuarioLogado.empresas?.some(
            (e) =>
              e.id === empresaId && e.perfis?.some((p) => p.codigo === 'ADMIN'),
          );

        if (!isAdminInEmpresa) {
          throw new ForbiddenException(
            'Você não tem permissão para deletar este usuário',
          );
        }

        await this.usuarioRepository.remove(id);
        usuario.deletedAt = new Date();
        usuario.ativo = false;
        this.logger.log(`Usuário removido (soft-delete): ${usuario.email}`);
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

    return updatedUsuario;
  }
}
