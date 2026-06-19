import {
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
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
  private readonly logger = new Logger(PermissoesService.name);

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
    const permissao = await this.permissaoRepository.create(createPermissaoDto);
    this.logger.log(
      `Permissão criada: ${permissao.nome} (ID: ${permissao.id})`,
    );
    return permissao;
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

  // [PERF-004] Validação em batch — 1 round-trip para N IDs.
  // Lança NotFoundException se algum ID não existir.
  // Cache de 5min: a relação de permissões é cross-tenant, varia
  // raramente (não muda em runtime normal). TTL 5min reduz DB load
  // em picos de criação/atualização de perfis.
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;
  private static cache: { ts: number; map: Map<number, Permissao> } | null =
    null;

  async findManyByIds(ids: number[]): Promise<Permissao[]> {
    if (ids.length === 0) return [];
    const now = Date.now();
    const cache = PermissoesService.cache;
    const fresh = cache && now - cache.ts < PermissoesService.CACHE_TTL_MS;
    const map = fresh ? cache.map : new Map<number, Permissao>();

    // Sempre faz 1 query para os IDs pedidos (cache hit ou miss),
    // atualiza o cache com o resultado.
    const fetched = await this.permissaoRepository.findManyByIds(ids);
    for (const p of fetched) {
      map.set(p.id, p);
    }

    if (fetched.length < ids.length) {
      // Algum ID não existe → erro claro.
      const foundIds = new Set(fetched.map((p) => p.id));
      const notFound = ids.filter((id) => !foundIds.has(id));
      throw new NotFoundException(
        `Permissões não encontradas: ${notFound.join(', ')}`,
      );
    }

    // Atualiza o timestamp do cache após sucesso.
    PermissoesService.cache = { ts: now, map };
    return fetched;
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
          throw new ConflictException(
            `Permissão com ID ${id} não está deletada.`,
          );
        }
        if (!this.authorizationService.isAdmin(usuarioLogado)) {
          throw new ForbiddenException(
            'Você não tem permissão para restaurar esta permissão',
          );
        }
        const restoredPermissao = await this.permissaoRepository.restore(id);
        if (!restoredPermissao) {
          throw new NotFoundException(
            `Permissão com ID ${id} não encontrada após restauração.`,
          );
        }
        this.logger.log(
          `Permissão restaurada: ${restoredPermissao.nome} (ID: ${id})`,
        );
        return restoredPermissao;
      } else {
        if (permissao.deletedAt !== null) {
          throw new ConflictException(
            `Permissão com ID ${id} já está deletada.`,
          );
        }
        if (!this.authorizationService.isAdmin(usuarioLogado)) {
          throw new ForbiddenException(
            'Você não tem permissão para deletar esta permissão',
          );
        }
        const softDeletedPermissao = await this.permissaoRepository.remove(id);
        if (!softDeletedPermissao) {
          throw new NotFoundException(
            `Permissão com ID ${id} não encontrada após soft delete.`,
          );
        }
        this.logger.log(
          `Permissão removida: ${softDeletedPermissao.nome} (ID: ${id})`,
        );
        return softDeletedPermissao;
      }
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
    this.logger.log(
      `Permissão atualizada: ${updatedPermissao.nome} (ID: ${id})`,
    );
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
    this.logger.log(
      `Permissão removida: ${softDeletedPermissao.nome} (ID: ${id})`,
    );
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
    this.logger.log(
      `Permissão restaurada: ${restoredPermissao.nome} (ID: ${id})`,
    );
    return restoredPermissao;
  }
}
