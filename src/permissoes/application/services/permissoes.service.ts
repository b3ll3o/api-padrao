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
import { PaginationDto } from '../../../dto/pagination.dto';
import { PaginatedResponseDto } from '../../../dto/paginated-response.dto';
import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';

type UsuarioLogado = JwtPayload;

@Injectable()
export class PermissoesService {
  constructor(private readonly permissaoRepository: PermissaoRepository) {}

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
  ): Promise<Permissao> {
    // Find including deleted to allow update on soft-deleted
    const permissao = await this.permissaoRepository.findOne(id, true);
    if (!permissao) {
      throw new NotFoundException(`Permissão com ID ${id} não encontrada.`);
    }
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

    const isAdmin = usuarioLogado.perfis?.some((p) => p.codigo === 'ADMIN');

    if (!isAdmin) {
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

    const isAdmin = usuarioLogado.perfis?.some((p) => p.codigo === 'ADMIN');

    if (!isAdmin) {
      throw new ForbiddenException(
        'Você não tem permissão para restaurar esta permissão',
      );
    }

    const restoredPermissao = await this.permissaoRepository.restore(id);
    return restoredPermissao;
  }
}
