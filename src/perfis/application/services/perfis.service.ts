import {
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CreatePerfilDto } from '../../dto/create-perfil.dto';
import { UpdatePerfilDto } from '../../dto/update-perfil.dto';
import { PerfilRepository } from '../../domain/repositories/perfil.repository';
import { Perfil } from '../../domain/entities/perfil.entity';
import { PermissoesService } from '../../../permissoes/application/services/permissoes.service';
import { PaginationDto } from '../../../shared/dto/pagination.dto';
import { PaginatedResponseDto } from '../../../shared/dto/paginated-response.dto';
import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';

type UsuarioLogado = JwtPayload;

@Injectable()
export class PerfisService {
  constructor(
    private readonly perfilRepository: PerfilRepository,
    private readonly permissoesService: PermissoesService,
  ) {}

  async create(createPerfilDto: CreatePerfilDto): Promise<Perfil> {
    if (
      createPerfilDto.permissoesIds &&
      createPerfilDto.permissoesIds.length > 0
    ) {
      for (const id of createPerfilDto.permissoesIds) {
        await this.permissoesService.findOne(id); // Validate if permission exists
      }
    }
    const existingPerfil = await this.perfilRepository.findByNome(
      createPerfilDto.nome,
    );
    if (existingPerfil) {
      throw new ConflictException(
        `Perfil com o nome '${createPerfilDto.nome}' já existe.`,
      );
    }
    return this.perfilRepository.create(createPerfilDto);
  }

  async findAll(
    paginationDto: PaginationDto,
    includeDeleted: boolean = false,
  ): Promise<PaginatedResponseDto<Perfil>> {
    const page = paginationDto.page ?? 1;
    const limit = paginationDto.limit ?? 10;
    const skip = (page - 1) * limit;
    const take = limit;
    const [data, total] = await this.perfilRepository.findAll(
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

  async findOne(id: number, includeDeleted: boolean = false): Promise<Perfil> {
    const perfil = await this.perfilRepository.findOne(id, includeDeleted);
    if (!perfil) {
      throw new NotFoundException(`Perfil com ID ${id} não encontrado.`);
    }
    return perfil;
  }

  async findByNome(
    nome: string,
    paginationDto: PaginationDto,
    includeDeleted: boolean = false,
  ): Promise<PaginatedResponseDto<Perfil>> {
    return this.findByNomeContaining(nome, paginationDto, includeDeleted);
  }

  async findByNomeContaining(
    nome: string,
    paginationDto: PaginationDto,
    includeDeleted: boolean = false,
  ): Promise<PaginatedResponseDto<Perfil>> {
    const page = paginationDto.page ?? 1;
    const limit = paginationDto.limit ?? 10;
    const skip = (page - 1) * limit;
    const take = limit;
    const [data, total] = await this.perfilRepository.findByNomeContaining(
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
    updatePerfilDto: UpdatePerfilDto,
    usuarioLogado: UsuarioLogado, // Add usuarioLogado parameter
  ): Promise<Perfil> {
    if (updatePerfilDto.permissoesIds) {
      for (const permId of updatePerfilDto.permissoesIds) {
        await this.permissoesService.findOne(permId); // Validate if permission exists
      }
    }
    // Find including deleted to allow update on soft-deleted
    const perfil = await this.perfilRepository.findOne(id, true);
    if (!perfil) {
      throw new NotFoundException(`Perfil com ID ${id} não encontrado.`);
    }

    // Handle 'ativo' flag for soft delete/restore
    if (updatePerfilDto.ativo !== undefined) {
      const isAdmin = usuarioLogado.perfis?.some((p) => p.codigo === 'ADMIN');
      if (!isAdmin) {
        throw new ForbiddenException('Você não tem permissão para alterar o status de ativo/inativo deste perfil');
      }

      if (updatePerfilDto.ativo === true) {
        // Attempt to restore
        if (perfil.deletedAt === null) {
          throw new ConflictException(`Perfil com ID ${id} não está deletado.`);
        }
        await this.perfilRepository.restore(id);
        // After restore, update the local 'perfil' object to reflect the change
        perfil.deletedAt = null;
      } else { // updatePerfilDto.ativo === false
        // Attempt to soft delete
        if (perfil.deletedAt !== null) {
          throw new ConflictException(`Perfil com ID ${id} já está deletado.`);
        }
        await this.perfilRepository.remove(id);
        // After soft delete, update the local 'perfil' object to reflect the change
        perfil.deletedAt = new Date(); // Set a dummy date for local object consistency
      }
      // Remove 'ativo' from DTO to prevent it from being passed to repository update
      delete updatePerfilDto.ativo;
    }

    const updatedPerfil = await this.perfilRepository.update(
      id,
      updatePerfilDto,
    );
    if (!updatedPerfil) {
      throw new NotFoundException(
        `Perfil com ID ${id} não encontrado após atualização.`,
      );
    }
    return updatedPerfil;
  }

  
}
