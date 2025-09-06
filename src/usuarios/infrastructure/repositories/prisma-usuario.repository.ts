import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Usuario } from '../../domain/entities/usuario.entity';
import { UsuarioRepository } from '../../domain/repositories/usuario.repository';

@Injectable()
export class PrismaUsuarioRepository implements UsuarioRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Usuario): Promise<Usuario> {
    const usuario = await this.prisma.usuario.create({ data });
    return {
      ...usuario,
      senha: usuario.senha === null ? undefined : usuario.senha,
    };
  }

  async findByEmail(email: string): Promise<Usuario | null> {
    const usuario = await this.prisma.usuario.findUnique({ where: { email } });
    if (!usuario) return null;
    return {
      ...usuario,
      senha: usuario.senha === null ? undefined : usuario.senha,
    };
  }
}
