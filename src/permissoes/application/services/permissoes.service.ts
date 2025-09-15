import {
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CreatePermissaoDto } from '../../dto/create-permissao.dto';
import { UpdatePermissaoDto } from '../../dto/update-permissao.dto';
import { PermissaoRepository } from '../../domain/repositories/permissao.repository';
import { Permissao } from '../../domain/entities/permissao.entity';
import { PaginationDto } from '../../../shared/dto/pagination.dto';
import { PaginatedResponseDto } from '../../../shared/dto/paginated-response.dto';
import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';
import { AuthorizationService } from 'src/shared/domain/services/authorization.service'; // Added

type UsuarioLogado = JwtPayload;

@Injectable()
export class PermissoesService {
  constructor(
    private readonly permissaoRepository: PermissaoRepository,
    private readonly authorizationService: AuthorizationService, // Added
  ) {}

  async create(createPermissaoDto: CreatePermissaoDto): Promise<Permissao> {
    const existingPermissao = await this.permissaoRepository.findByNome(
      createPermissaoDto.nome,
    );
    if (existingPermissao) {
      throw new ConflictException(
        `Permissão com o nome '${createPermissaoDto.nome}' já existe.`,
      );
    }
    return this.permissaoRepository.create(createPermissaoDto);
  }

  async findAll(
    paginationDto: PaginationDto,
    includeDeleted: boolean = false,
  ): Promise<PaginatedResponseDto<Permissao>> {
    const page = paginationDto.page ?? 1;
    const limit = paginationDto.limit ?? 10;
    const skip = (page - 1) * limit;
    const take = limit;
    const [data, total] = await this.permissaoRepository.findAll(
      skip,
      take,
      includeDeleted,
    );
    const totalPages = Math.ceil(total / limit);
    return {
      data,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async findOne(
    id: number,
    includeDeleted: boolean = false,
  ): Promise<Permissao> {
    const permissao = await this.permissaoRepository.findOne(
      id,
      includeDeleted,
    );
    if (!permissao) {
      throw new NotFoundException(`Permissão com ID ${id} não encontrada.`);
    }
    return permissao;
  }

  async findByNome(
    nome: string,
    paginationDto: PaginationDto,
    includeDeleted: boolean = false,
  ): Promise<PaginatedResponseDto<Permissao>> {
    return this.findByNomeContaining(nome, paginationDto, includeDeleted);
  }

  async findByNomeContaining(
    nome: string,
    paginationDto: PaginationDto,
    includeDeleted: boolean = false,
  ): Promise<PaginatedResponseDto<Permissao>> {
    const page = paginationDto.page ?? 1;
    const limit = paginationDto.limit ?? 10;
    const skip = (page - 1) * limit;
    const take = limit;
    const [data, total] = await this.permissaoRepository.findByNomeContaining(
      nome,
      skip,
      take,
      includeDeleted,
    );
    const totalPages = Math.ceil(total / limit);
    return {
      data,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async update(
    id: number,
    updatePermissaoDto: UpdatePermissaoDto,
    usuarioLogado: UsuarioLogado, // Add usuarioLogado parameter
  ): Promise<Permissao> {
    const permissao = await this.permissaoRepository.findOne(id, true); // Find including deleted to allow update on soft-deleted
    if (!permissao) {
      throw new NotFoundException(`Permissão com ID ${id} não encontrada.`);
    }

    // Handle 'ativo' flag for soft delete/restore
    if (updatePermissaoDto.ativo !== undefined) {
      if (updatePermissaoDto.ativo === true) {
        // Attempt to restore
        if (permissao.deletedAt === null) {
          throw new ConflictException(`Permissão com ID ${id} não está deletada.`);
        }
        if (!this.authorizationService.isAdmin(usuarioLogado)) {
          throw new ForbiddenException('Você não tem permissão para restaurar esta permissão');
        }
        await this.permissaoRepository.restore(id);
        // After restore, update the local 'permissao' object to reflect the change
        permissao.deletedAt = null;
      } else { // updatePermissaoDto.ativo === false
        // Attempt to soft delete
        if (permissao.deletedAt !== null) {
          throw new ConflictException(`Permissão com ID ${id} já está deletada.`);
        }
        if (!this.authorizationService.isAdmin(usuarioLogado)) {
          throw new ForbiddenException('Você não tem permissão para deletar esta permissão');
        }
        await this.permissaoRepository.remove(id);
        // After soft delete, update the local 'permissao' object to reflect the change
        permissao.deletedAt = new Date(); // Set a dummy date for local object consistency
      }
      // Remove 'ativo' from DTO to prevent it from being passed to repository update
      delete updatePermissaoDto.ativo;
    }

    // If there are no other fields to update besides 'ativo', return the locally modified 'permissao'
    if (Object.keys(updatePermissaoDto).length === 0) {
      return permissao;
    }

    // The existing update logic for other fields
    const updatedPermissao = await this.permissaoRepository.update(
      id,
      updatePermissaoDto,
    );
    if (!updatedPermissao) {
      throw new NotFoundException(
        `Permissão com ID ${id} não encontrada após atualização.`,
      );
    }
    return updatedPermissao;
  }

  async remove(id: number, usuarioLogado: UsuarioLogado): Promise<Permissao> {
    const permissao = await this.permissaoRepository.findOne(id); // Find only non-deleted
    if (!permissao) {
      throw new NotFoundException(`Permissão com ID ${id} não encontrada.`);
    }

    if (!this.authorizationService.isAdmin(usuarioLogado)) {
      throw new ForbiddenException(
        'Você não tem permissão para deletar esta permissão',
      );
    }

    const softDeletedPermissao = await this.permissaoRepository.remove(id);
    return softDeletedPermissao;
  }

  async restore(id: number, usuarioLogado: UsuarioLogado): Promise<Permissao> {
    const permissao = await this.permissaoRepository.findOne(id, true); // Find including deleted
    if (!permissao) {
      throw new NotFoundException(`Permissão com ID ${id} não encontrada.`);
    }

    if (permissao.deletedAt === null) {
      throw new ConflictException(`Permissão com ID ${id} não está deletada.`);
    }

    if (!this.authorizationService.isAdmin(usuarioLogado)) {
      throw new ForbiddenException(
        'Você não tem permissão para restaurar esta permissão',
      );
    }

    const restoredPermissao = await this.permissaoRepository.restore(id);
    return restoredPermissao;
  }
}
