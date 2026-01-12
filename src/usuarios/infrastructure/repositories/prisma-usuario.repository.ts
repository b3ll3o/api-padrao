import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Usuario } from '../../domain/entities/usuario.entity';
import { UsuarioRepository } from '../../domain/repositories/usuario.repository';
import { PaginationDto } from '../../../shared/dto/pagination.dto';
import { PaginatedResponseDto } from '../../../shared/dto/paginated-response.dto';

@Injectable()
export class PrismaUsuarioRepository implements UsuarioRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Partial<Usuario>): Promise<Usuario> {
    const { email, senha } = data;
    const usuario = await this.prisma.usuario.create({
      data: {
        email: email as string,
        senha: senha,
      },
    });
    return this.mapToEntity(usuario);
  }

  async findOne(
    id: number,
    includeDeleted: boolean = false,
  ): Promise<Usuario | undefined> {
    const whereClause: any = { id };
    if (!includeDeleted) {
      whereClause.deletedAt = null;
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: whereClause,
    });
    if (!usuario) return undefined;

    return this.mapToEntity(usuario);
  }

  async findAll(
    paginationDto: PaginationDto,
    includeDeleted: boolean = false,
  ): Promise<PaginatedResponseDto<Usuario>> {
    const { page = 1, limit = 10 } = paginationDto;
    const skip = (page - 1) * limit;

    const whereClause: any = {};
    if (!includeDeleted) {
      whereClause.deletedAt = null;
    }

    const [items, total] = await Promise.all([
      this.prisma.usuario.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.usuario.count({ where: whereClause }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: items.map((usuario) => this.mapToEntity(usuario)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async findByEmail(email: string): Promise<Usuario | null> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email, deletedAt: null },
    });
    if (!usuario) return null;
    return this.mapToEntity(usuario);
  }

  // TODO: This method needs to be refactored to support Company context.
  // For now, it returns the user without profiles to avoid build errors.
  // Profiles are now loaded via UsuarioEmpresa.
  async findByEmailWithPerfisAndPermissoes(
    email: string,
  ): Promise<Usuario | null> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email, deletedAt: null },
    });
    if (!usuario) return null;

    const entity = this.mapToEntity(usuario);
    entity.perfis = []; // Empty profiles as they are now context-dependent
    return entity;
  }

  async update(id: number, data: Partial<Usuario>): Promise<Usuario> {
    const { email, senha, ativo } = data;
    const updatedUsuario = await this.prisma.usuario.update({
      where: { id },
      data: {
        email,
        senha,
        ativo,
      },
    });

    return this.mapToEntity(updatedUsuario);
  }

  async remove(id: number): Promise<Usuario> {
    try {
      const softDeletedUsuario = await this.prisma.usuario.update({
        where: { id },
        data: { deletedAt: new Date(), ativo: false },
      });

      return this.mapToEntity(softDeletedUsuario);
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2025'
      ) {
        throw new Error(`Usuário com ID ${id} não encontrado.`);
      }
      throw error;
    }
  }

  async restore(id: number): Promise<Usuario> {
    try {
      const restoredUsuario = await this.prisma.usuario.update({
        where: { id },
        data: { deletedAt: null, ativo: true },
      });

      return this.mapToEntity(restoredUsuario);
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2025'
      ) {
        throw new Error(`Usuário com ID ${id} não encontrado.`);
      }
      throw error;
    }
  }

  private mapToEntity(prismaUsuario: any): Usuario {
    const newUsuario = new Usuario();
    newUsuario.id = prismaUsuario.id;
    newUsuario.email = prismaUsuario.email;
    newUsuario.senha =
      prismaUsuario.senha === null ? undefined : prismaUsuario.senha;
    newUsuario.createdAt = prismaUsuario.createdAt;
    newUsuario.updatedAt = prismaUsuario.updatedAt;
    newUsuario.deletedAt = prismaUsuario.deletedAt;
    newUsuario.ativo = prismaUsuario.ativo;
    newUsuario.perfis = []; // Default to empty
    return newUsuario;
  }
}
