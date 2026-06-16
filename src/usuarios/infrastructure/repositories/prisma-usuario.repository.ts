import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Usuario } from '../../domain/entities/usuario.entity';
import { UsuarioRepository } from '../../domain/repositories/usuario.repository';
import { PaginationDto } from '../../../shared/dto/pagination.dto';
import { PaginatedResponseDto } from '../../../shared/dto/paginated-response.dto';
import { UsuarioEmpresa } from '../../domain/entities/usuario-empresa.entity';
import { Perfil } from '../../../perfis/domain/entities/perfil.entity';

@Injectable()
export class PrismaUsuarioRepository implements UsuarioRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Partial<Usuario>): Promise<Usuario> {
    const { email, senha } = data;
    const usuario = await this.prisma.extended.usuario.create({
      data: {
        email: email as string,
        senha: senha,
      },
      // [ALT-006] `select` específico.
      select: {
        id: true,
        email: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        ativo: true,
      },
    });
    return this.mapToEntity(usuario)!;
  }

  async findOne(
    id: number,
    includeDeleted: boolean = false,
  ): Promise<Usuario | undefined> {
    // [ALT-006] `select` explícito: nunca retornar `senha` em `findOne`
    // (LGPD). Caller que precisa autenticar deve usar `findByEmail*`.
    const selectFields = {
      id: true,
      email: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      ativo: true,
    } as const;

    const queryResult = includeDeleted
      ? await this.prisma.usuario.findUnique({
          where: { id },
          select: selectFields,
        })
      : await this.prisma.extended.usuario.findUnique({
          where: { id },
          select: selectFields,
        });

    if (!queryResult) return undefined;

    return this.mapToEntity(queryResult) ?? undefined;
  }

  async findAll(
    paginationDto: PaginationDto,
    includeDeleted: boolean = false,
  ): Promise<PaginatedResponseDto<Usuario>> {
    const { page = 1, limit = 10 } = paginationDto;
    const skip = (page - 1) * limit;

    const client = includeDeleted
      ? this.prisma.usuario
      : this.prisma.extended.usuario;

    // [ALT-006] `select` explícito: NUNCA retornar `senha` em listagens
    // (LGPD + segurança). Apenas campos públicos.
    const [items, total] = await Promise.all([
      client.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          ativo: true,
        },
      }),
      client.count(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: items.map((usuario: any) => this.mapToEntity(usuario)!),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async findByEmail(email: string): Promise<Usuario | null> {
    const usuario = await this.prisma.extended.usuario.findUnique({
      where: { email },
    });
    if (!usuario) return null;
    return this.mapToEntity(usuario)!;
  }

  async findByEmailWithPerfisAndPermissoes(
    email: string,
  ): Promise<Usuario | null> {
    const usuario = await this.prisma.extended.usuario.findUnique({
      where: { email },
      include: {
        empresas: {
          include: {
            perfis: {
              include: {
                permissoes: true,
              },
            },
          },
        },
      },
    });
    if (!usuario) return null;

    return this.mapToEntity(usuario)!;
  }

  async update(id: number, data: Partial<Usuario>): Promise<Usuario> {
    const { email, senha, ativo } = data;
    const updatedUsuario = await this.prisma.extended.usuario.update({
      where: { id },
      data: {
        email,
        senha,
        ativo,
      },
      // [ALT-006] `select` específico.
      select: {
        id: true,
        email: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        ativo: true,
      },
    });

    return this.mapToEntity(updatedUsuario)!;
  }

  async remove(id: number): Promise<Usuario> {
    try {
      // The extension will turn this 'delete' into an 'update' automatically
      const softDeletedUsuario = await this.prisma.extended.usuario.delete({
        where: { id },
        // [ALT-006] `select` específico.
        select: {
          id: true,
          email: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          ativo: true,
        },
      });

      return this.mapToEntity(softDeletedUsuario)!;
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Usuário com ID ${id} não encontrado.`);
      }
      throw error;
    }
  }

  async restore(id: number): Promise<Usuario> {
    try {
      const restoredUsuario = await this.prisma.usuario.update({
        where: { id },
        data: { deletedAt: null, ativo: true },
        // [ALT-006] `select` específico.
        select: {
          id: true,
          email: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          ativo: true,
        },
      });

      return this.mapToEntity(restoredUsuario)!;
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Usuário com ID ${id} não encontrado.`);
      }
      throw error;
    }
  }

  private mapToEntity(prismaUsuario: any): Usuario | null {
    if (!prismaUsuario) return null;

    const newUsuario = new Usuario();
    newUsuario.id = prismaUsuario.id;
    newUsuario.email = prismaUsuario.email;
    newUsuario.senha =
      prismaUsuario.senha === null ? undefined : prismaUsuario.senha;
    newUsuario.createdAt = prismaUsuario.createdAt;
    newUsuario.updatedAt = prismaUsuario.updatedAt;
    newUsuario.deletedAt = prismaUsuario.deletedAt;
    newUsuario.ativo = prismaUsuario.ativo;

    if (prismaUsuario.empresas) {
      newUsuario.empresas = prismaUsuario.empresas.map((ue: any) => {
        return new UsuarioEmpresa({
          id: ue.id,
          usuarioId: ue.usuarioId,
          empresaId: ue.empresaId,
          createdAt: ue.createdAt,
          updatedAt: ue.updatedAt,
          perfis: ue.perfis
            ? ue.perfis.map((p: any) => {
                const perfil = new Perfil();
                perfil.id = p.id;
                perfil.nome = p.nome;
                perfil.codigo = p.codigo;
                perfil.descricao = p.descricao;
                perfil.ativo = p.ativo;
                perfil.permissoes = p.permissoes;
                return perfil;
              })
            : [],
        });
      });
    } else {
      newUsuario.empresas = [];
    }

    return newUsuario;
  }
}
