import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Usuario } from '../../domain/entities/usuario.entity';
import { UsuarioRepository } from '../../domain/repositories/usuario.repository';

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
    });
    const newUsuario = new Usuario();
    newUsuario.id = usuario.id;
    newUsuario.email = usuario.email;
    newUsuario.senha = usuario.senha === null ? undefined : usuario.senha;
    newUsuario.createdAt = usuario.createdAt;
    newUsuario.updatedAt = usuario.updatedAt;
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

  async findByEmailWithPerfisAndPermissoes(email: string): Promise<Usuario | null> {
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
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    newUsuario.perfis = usuario.perfis;
    return newUsuario;
  }
}
