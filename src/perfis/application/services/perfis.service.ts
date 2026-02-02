import {
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
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
  private readonly logger = new Logger(PerfisService.name);

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
      false,
      createPerfilDto.empresaId,
    );
    if (existingPerfil) {
      throw new ConflictException(
        `Perfil com o nome '${createPerfilDto.nome}' já existe para esta empresa.`,
      );
    }
    return this.perfilRepository.create(createPerfilDto);
  }

  async findAll(
    paginationDto: PaginationDto,
    includeDeleted: boolean = false,
    empresaId?: string,
  ): Promise<PaginatedResponseDto<Perfil>> {
    const page = paginationDto.page ?? 1;
    const limit = paginationDto.limit ?? 10;
    const skip = (page - 1) * limit;
    const take = limit;
    const [data, total] = await this.perfilRepository.findAll(
      skip,
      take,
      includeDeleted,
      empresaId,
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
    empresaId?: string,
  ): Promise<Perfil> {
    const perfil = await this.perfilRepository.findOne(
      id,
      includeDeleted,
      empresaId,
    );
    if (!perfil) {
      throw new NotFoundException(`Perfil com ID ${id} não encontrado.`);
    }
    return perfil;
  }

  async findByNomeContaining(
    nome: string,
    paginationDto: PaginationDto,
    includeDeleted: boolean = false,
    empresaId?: string,
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
      empresaId,
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
    usuarioLogado: UsuarioLogado,
  ): Promise<Perfil> {
    if (updatePerfilDto.permissoesIds) {
      for (const permId of updatePerfilDto.permissoesIds) {
        await this.permissoesService.findOne(permId);
      }
    }
    const perfil = await this.perfilRepository.findOne(id, true);
    if (!perfil) {
      throw new NotFoundException(`Perfil com ID ${id} não encontrado.`);
    }

    if (updatePerfilDto.ativo !== undefined) {
      const isAdmin = usuarioLogado.empresas?.some((e: any) =>
        e.perfis?.some((p: any) => p.codigo === 'ADMIN'),
      );
      if (!isAdmin) {
        throw new ForbiddenException(
          'Você não tem permissão para alterar o status de ativo/inativo deste perfil',
        );
      }

      if (updatePerfilDto.ativo === true) {
        if (perfil.deletedAt === null) {
          throw new ConflictException(`Perfil with ID ${id} is not deleted.`);
        }
        const restoredPerfil = await this.perfilRepository.restore(id);
        if (!restoredPerfil) {
          throw new NotFoundException(
            `Perfil with ID ${id} not found after restore.`,
          );
        }
        return restoredPerfil;
      } else {
        if (perfil.deletedAt !== null) {
          throw new ConflictException(
            `Perfil with ID ${id} is already deleted.`,
          );
        }
        const softDeletedPerfil = await this.perfilRepository.remove(id);
        if (!softDeletedPerfil) {
          throw new NotFoundException(
            `Perfil with ID ${id} not found after removal.`,
          );
        }
        return softDeletedPerfil;
      }
    }

    const updatedPerfil = await this.perfilRepository.update(
      id,
      updatePerfilDto,
    );
    if (!updatedPerfil) {
      throw new NotFoundException(
        `Perfil with ID ${id} not found after update.`,
      );
    }
    return updatedPerfil;
  }
}
