import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Usuario } from '../../domain/entities/usuario.entity';
import { UsuarioRepository } from '../../domain/repositories/usuario.repository';
import { Perfil } from 'src/perfis/domain/entities/perfil.entity';
import { Permissao } from 'src/permissoes/domain/entities/permissao.entity';

@Injectable()
export class PrismaUsuarioRepository implements UsuarioRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Partial<Usuario>): Promise<Usuario> {
    const { perfis, email, senha } = data;
    const usuario = await this.prisma.usuario.create({
      data: {
        email: email as string,
        senha: senha,
        perfis: {
          connect: perfis?.map((perfil) => ({ id: perfil.id })),
        },
      },
      include: { perfis: true }, // Include perfis in the creation result
    });
    const newUsuario = new Usuario();
    newUsuario.id = usuario.id;
    newUsuario.email = usuario.email;
    newUsuario.senha = usuario.senha === null ? undefined : usuario.senha;
    newUsuario.createdAt = usuario.createdAt;
    newUsuario.updatedAt = usuario.updatedAt;
    newUsuario.deletedAt = usuario.deletedAt;
    newUsuario.perfis = usuario.perfis?.map((perfil) => {
      // Map profiles to Perfil instances
      const newPerfil = new Perfil();
      newPerfil.id = perfil.id;
      newPerfil.nome = perfil.nome;
      newPerfil.codigo = perfil.codigo;
      newPerfil.descricao = perfil.descricao;
      return newPerfil;
    });
    return newUsuario;
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
      include: { perfis: true }, // Include perfis if needed
    });
    if (!usuario) return undefined;

    const newUsuario = new Usuario();
    newUsuario.id = usuario.id;
    newUsuario.email = usuario.email;
    newUsuario.senha = usuario.senha === null ? undefined : usuario.senha;
    newUsuario.createdAt = usuario.createdAt;
    newUsuario.updatedAt = usuario.updatedAt;
    newUsuario.deletedAt = usuario.deletedAt; // Include deletedAt
    // Map profiles to Perfil instances
    newUsuario.perfis = usuario.perfis?.map((perfil) => {
      const newPerfil = new Perfil();
      newPerfil.id = perfil.id;
      newPerfil.nome = perfil.nome;
      newPerfil.codigo = perfil.codigo;
      newPerfil.descricao = perfil.descricao;
      return newPerfil;
    });
    return newUsuario;
  }

  async findAll(includeDeleted: boolean = false): Promise<Usuario[]> {
    const whereClause: any = {};
    if (!includeDeleted) {
      whereClause.deletedAt = null;
    }

    const usuarios = await this.prisma.usuario.findMany({
      where: whereClause,
      include: { perfis: true }, // Include perfis if needed
    });

    return usuarios.map((usuario) => {
      const newUsuario = new Usuario();
      newUsuario.id = usuario.id;
      newUsuario.email = usuario.email;
      newUsuario.senha = usuario.senha === null ? undefined : usuario.senha;
      newUsuario.createdAt = usuario.createdAt;
      newUsuario.updatedAt = usuario.updatedAt;
      newUsuario.deletedAt = usuario.deletedAt; // Include deletedAt
      newUsuario.perfis = usuario.perfis?.map((perfil) => {
        const newPerfil = new Perfil();
        newPerfil.id = perfil.id;
        newPerfil.nome = perfil.nome;
        newPerfil.codigo = perfil.codigo;
        newPerfil.descricao = perfil.descricao;
        return newPerfil;
      });
      return newUsuario;
    });
  }

  async findByEmail(email: string): Promise<Usuario | null> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email, deletedAt: null },
    }); // Exclude soft-deleted
    if (!usuario) return null;
    const newUsuario = new Usuario();
    newUsuario.id = usuario.id;
    newUsuario.email = usuario.email;
    newUsuario.senha = usuario.senha === null ? undefined : usuario.senha;
    newUsuario.createdAt = usuario.createdAt;
    newUsuario.updatedAt = usuario.updatedAt;
    newUsuario.deletedAt = usuario.deletedAt; // Include deletedAt
    return newUsuario;
  }

  async findByEmailWithPerfisAndPermissoes(
    email: string,
  ): Promise<Usuario | null> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email, deletedAt: null }, // Exclude soft-deleted
      include: {
        perfis: {
          include: {
            permissoes: true,
          },
        },
      },
    });
    if (!usuario) return null;

    const newUsuario = new Usuario();
    newUsuario.id = usuario.id;
    newUsuario.email = usuario.email;
    newUsuario.senha = usuario.senha === null ? undefined : usuario.senha;
    newUsuario.createdAt = usuario.createdAt;
    newUsuario.updatedAt = usuario.updatedAt;
    newUsuario.deletedAt = usuario.deletedAt; // Include deletedAt

    newUsuario.perfis = usuario.perfis.map((perfil) => {
      const newPerfil = new Perfil();
      newPerfil.id = perfil.id;
      newPerfil.nome = perfil.nome;
      newPerfil.codigo = perfil.codigo;
      newPerfil.descricao = perfil.descricao;
      newPerfil.permissoes = perfil.permissoes.map((permissao) => {
        const newPermissao = new Permissao();
        newPermissao.id = permissao.id;
        newPermissao.nome = permissao.nome;
        newPermissao.codigo = permissao.codigo;
        newPermissao.descricao = permissao.descricao;
        return newPermissao;
      });
      return newPerfil;
    });

    return newUsuario;
  }

  async update(id: number, data: Partial<Usuario>): Promise<Usuario> {
    const { perfis, ...rest } = data;
    const updatedUsuario = await this.prisma.usuario.update({
      where: { id },
      data: {
        ...rest,
        perfis: perfis
          ? {
              set: perfis.map((perfil) => ({ id: perfil.id })),
            }
          : undefined,
      },
      include: { perfis: true },
    });

    const newUsuario = new Usuario();
    newUsuario.id = updatedUsuario.id;
    newUsuario.email = updatedUsuario.email;
    newUsuario.senha =
      updatedUsuario.senha === null ? undefined : updatedUsuario.senha;
    newUsuario.createdAt = updatedUsuario.createdAt;
    newUsuario.updatedAt = updatedUsuario.updatedAt;
    newUsuario.deletedAt = updatedUsuario.deletedAt; // Include deletedAt
    newUsuario.perfis = updatedUsuario.perfis?.map((perfil) => {
      const newPerfil = new Perfil();
      newPerfil.id = perfil.id;
      newPerfil.nome = perfil.nome;
      newPerfil.codigo = perfil.codigo;
      newPerfil.descricao = perfil.descricao;
      return newPerfil;
    });
    return newUsuario;
  }

  async remove(id: number): Promise<Usuario> {
    try {
      const softDeletedUsuario = await this.prisma.usuario.update({
        where: { id },
        data: { deletedAt: new Date() },
        include: { perfis: true }, // Include perfis if needed for mapping
      });

      const newUsuario = new Usuario();
      newUsuario.id = softDeletedUsuario.id;
      newUsuario.email = softDeletedUsuario.email;
      newUsuario.senha =
        softDeletedUsuario.senha === null ? undefined : softDeletedUsuario.senha;
      newUsuario.createdAt = softDeletedUsuario.createdAt;
      newUsuario.updatedAt = softDeletedUsuario.updatedAt;
      newUsuario.deletedAt = softDeletedUsuario.deletedAt;
      newUsuario.perfis = softDeletedUsuario.perfis?.map((perfil) => {
        const newPerfil = new Perfil();
        newPerfil.id = perfil.id;
        newPerfil.nome = perfil.nome;
        newPerfil.codigo = perfil.codigo;
        newPerfil.descricao = perfil.descricao;
        return newPerfil;
      });
      return newUsuario;
    } catch (error) {
      if (error.code === 'P2025') {
        throw new Error(`Usuário com ID ${id} não encontrado.`);
      }
      throw error;
    }
  }

  async restore(id: number): Promise<Usuario> {
    try {
      const restoredUsuario = await this.prisma.usuario.update({
        where: { id },
        data: { deletedAt: null },
        include: { perfis: true }, // Include perfis if needed for mapping
      });

      const newUsuario = new Usuario();
      newUsuario.id = restoredUsuario.id;
      newUsuario.email = restoredUsuario.email;
      newUsuario.senha =
        restoredUsuario.senha === null ? undefined : restoredUsuario.senha;
      newUsuario.createdAt = restoredUsuario.createdAt;
      newUsuario.updatedAt = restoredUsuario.updatedAt;
      newUsuario.deletedAt = restoredUsuario.deletedAt;
      newUsuario.perfis = restoredUsuario.perfis?.map((perfil) => {
        const newPerfil = new Perfil();
        newPerfil.id = perfil.id;
        newPerfil.nome = perfil.nome;
        newPerfil.codigo = perfil.codigo;
        newPerfil.descricao = perfil.descricao;
        return newPerfil;
      });
      return newUsuario;
    } catch (error) {
      if (error.code === 'P2025') {
        throw new Error(`Usuário com ID ${id} não encontrado.`);
      }
      throw error;
    }
  }
}
