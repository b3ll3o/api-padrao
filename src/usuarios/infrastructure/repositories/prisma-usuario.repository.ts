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

  async findOne(id: number): Promise<Usuario | undefined> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id },
      include: { perfis: true }, // Include profiles if needed
    });
    if (!usuario) return undefined;

    const newUsuario = new Usuario();
    newUsuario.id = usuario.id;
    newUsuario.email = usuario.email;
    newUsuario.senha = usuario.senha === null ? undefined : usuario.senha;
    newUsuario.createdAt = usuario.createdAt;
    newUsuario.updatedAt = usuario.updatedAt;
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

  async findByEmail(email: string): Promise<Usuario | null> {
    const usuario = await this.prisma.usuario.findUnique({ where: { email } });
    if (!usuario) return null;
    const newUsuario = new Usuario();
    newUsuario.id = usuario.id;
    newUsuario.email = usuario.email;
    newUsuario.senha = usuario.senha === null ? undefined : usuario.senha;
    newUsuario.createdAt = usuario.createdAt;
    newUsuario.updatedAt = usuario.updatedAt;
    return newUsuario;
  }

  async findByEmailWithPerfisAndPermissoes(
    email: string,
  ): Promise<Usuario | null> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email },
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
}
