import { Injectable } from '@nestjs/common';
import { PermissaoRepository } from '../../domain/repositories/permissao.repository';
import { Permissao } from '../../domain/entities/permissao.entity';
import { CreatePermissaoDto } from '../../dto/create-permissao.dto';
import { UpdatePermissaoDto } from '../../dto/update-permissao.dto';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class PrismaPermissaoRepository implements PermissaoRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toDomain(permissao: any): Permissao {
    const newPermissao = new Permissao();
    newPermissao.id = permissao.id;
    newPermissao.nome = permissao.nome;
    newPermissao.codigo = permissao.codigo;
    newPermissao.descricao = permissao.descricao;
    newPermissao.deletedAt = permissao.deletedAt;
    newPermissao.ativo = permissao.ativo;
    return newPermissao;
  }

  async create(data: CreatePermissaoDto): Promise<Permissao> {
    const permissao = await this.prisma.extended.permissao.create({ data });
    return this.toDomain(permissao);
  }

  async findAll(
    skip: number,
    take: number,
    includeDeleted: boolean = false,
  ): Promise<[Permissao[], number]> {
    const client = includeDeleted
      ? this.prisma.permissao
      : this.prisma.extended.permissao;

    const data = await client.findMany({
      skip,
      take,
    });
    const total = await client.count();
    return [data.map((p: any) => this.toDomain(p)), total];
  }

  async findOne(
    id: number,
    includeDeleted: boolean = false,
  ): Promise<Permissao | undefined> {
    const client = includeDeleted
      ? this.prisma.permissao
      : this.prisma.extended.permissao;

    const permissao = await client.findFirst({
      where: { id },
    });
    return permissao ? this.toDomain(permissao) : undefined;
  }

  async update(
    id: number,
    data: UpdatePermissaoDto,
  ): Promise<Permissao | undefined> {
    try {
      // Allow updating soft-deleted permissions
      const existingPermissao = await this.prisma.permissao.findFirst({
        where: { id },
      });
      if (!existingPermissao) {
        return undefined; // Or throw NotFoundException
      }

      const permissao = await this.prisma.extended.permissao.update({
        where: { id },
        data,
      });
      return this.toDomain(permissao);
    } catch (error) {
      if (error.code === 'P2025') {
        return undefined;
      }
      throw error;
    }
  }

  async remove(id: number): Promise<Permissao> {
    try {
      const softDeletedPermissao = await this.prisma.extended.permissao.delete({
        where: { id },
      });
      return this.toDomain(softDeletedPermissao);
    } catch (error) {
      if (error.code === 'P2025') {
        throw new Error(`Permissão com ID ${id} não encontrada.`); // Or throw NotFoundException
      }
      throw error;
    }
  }

  async restore(id: number): Promise<Permissao> {
    try {
      const restoredPermissao = await this.prisma.permissao.update({
        where: { id },
        data: { deletedAt: null, ativo: true },
      });
      return this.toDomain(restoredPermissao);
    } catch (error) {
      if (error.code === 'P2025') {
        throw new Error(`Permissão com ID ${id} não encontrada.`); // Or throw NotFoundException
      }
      throw error;
    }
  }

  async findByNome(
    nome: string,
    includeDeleted: boolean = false,
  ): Promise<Permissao | null> {
    const client = includeDeleted
      ? this.prisma.permissao
      : this.prisma.extended.permissao;

    const permissao = await client.findFirst({
      where: { nome },
    });
    return permissao ? this.toDomain(permissao) : null;
  }

  async findByNomeContaining(
    nome: string,
    skip: number,
    take: number,
    includeDeleted: boolean = false,
  ): Promise<[Permissao[], number]> {
    const client = includeDeleted
      ? this.prisma.permissao
      : this.prisma.extended.permissao;

    const data = await client.findMany({
      skip,
      take,
      where: {
        nome: {
          contains: nome,
          mode: 'insensitive',
        },
      },
    });
    const total = await client.count({
      where: {
        nome: {
          contains: nome,
          mode: 'insensitive',
        },
      },
    });
    return [data.map((p: any) => this.toDomain(p)), total];
  }
}
