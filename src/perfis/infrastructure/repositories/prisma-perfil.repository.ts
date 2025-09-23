import { Injectable } from '@nestjs/common';
import { PerfilRepository } from '../../domain/repositories/perfil.repository';
import { Perfil } from '../../domain/entities/perfil.entity';
import { CreatePerfilDto } from '../../dto/create-perfil.dto';
import { UpdatePerfilDto } from '../../dto/update-perfil.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import { Permissao } from '../../../permissoes/domain/entities/permissao.entity';

@Injectable()
export class PrismaPerfilRepository implements PerfilRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toPermissaoDomain(permissao: any): Permissao {
    const newPermissao = new Permissao();
    newPermissao.id = permissao.id;
    newPermissao.nome = permissao.nome;
    newPermissao.codigo = permissao.codigo;
    newPermissao.descricao = permissao.descricao;
    newPermissao.deletedAt = permissao.deletedAt;
    newPermissao.ativo = permissao.ativo;
    return newPermissao;
  }

  private toDomain(perfil: any): Perfil {
    const newPerfil = new Perfil();
    newPerfil.id = perfil.id;
    newPerfil.nome = perfil.nome;
    newPerfil.codigo = perfil.codigo;
    newPerfil.descricao = perfil.descricao;
    newPerfil.deletedAt = perfil.deletedAt;
    newPerfil.ativo = perfil.ativo;
    newPerfil.permissoes = perfil.permissoes?.map((p) =>
      this.toPermissaoDomain(p),
    );
    return newPerfil;
  }

  async create(data: CreatePerfilDto): Promise<Perfil> {
    const { permissoesIds, ...perfilData } = data;
    const perfil = await this.prisma.perfil.create({
      data: {
        ...perfilData,
        permissoes: {
          connect: permissoesIds?.map((id) => ({ id })),
        },
      },
      include: { permissoes: true },
    });
    return this.toDomain(perfil);
  }

  async findAll(
    skip: number,
    take: number,
    includeDeleted: boolean = false,
  ): Promise<[Perfil[], number]> {
    const whereClause: any = {};
    if (!includeDeleted) {
      whereClause.deletedAt = null;
    }

    const data = await this.prisma.perfil.findMany({
      skip,
      take,
      where: whereClause,
      include: { permissoes: true },
    });
    const total = await this.prisma.perfil.count({ where: whereClause });
    return [data.map((p) => this.toDomain(p)), total];
  }

  async findOne(
    id: number,
    includeDeleted: boolean = false,
  ): Promise<Perfil | undefined> {
    const whereClause: any = { id };
    if (!includeDeleted) {
      whereClause.deletedAt = null;
    }

    const perfil = await this.prisma.perfil.findFirst({
      where: whereClause,
      include: { permissoes: true },
    });
    return perfil ? this.toDomain(perfil) : undefined;
  }

  async update(id: number, data: UpdatePerfilDto): Promise<Perfil | undefined> {
    const { permissoesIds, ...perfilData } = data;
    try {
      // Allow updating soft-deleted profiles
      const existingPerfil = await this.prisma.perfil.findFirst({
        where: { id },
      });
      if (!existingPerfil) {
        return undefined; // Or throw NotFoundException
      }

      const perfil = await this.prisma.perfil.update({
        where: { id },
        data: {
          ...perfilData,
          permissoes: {
            set: permissoesIds?.map((id) => ({ id })),
          },
        },
        include: { permissoes: true },
      });
      return this.toDomain(perfil);
    } catch (error) {
      if (error.code === 'P2025') {
        return undefined;
      }
      throw error;
    }
  }

  async remove(id: number): Promise<Perfil> {
    try {
      const softDeletedPerfil = await this.prisma.perfil.update({
        where: { id },
        data: { deletedAt: new Date(), ativo: false },
        include: { permissoes: true },
      });
      return this.toDomain(softDeletedPerfil);
    } catch (error) {
      if (error.code === 'P2025') {
        throw new Error(`Perfil com ID ${id} não encontrado.`); // Or throw NotFoundException
      }
      throw error;
    }
  }

  async restore(id: number): Promise<Perfil> {
    try {
      const restoredPerfil = await this.prisma.perfil.update({
        where: { id },
        data: { deletedAt: null, ativo: true },
        include: { permissoes: true },
      });
      return this.toDomain(restoredPerfil);
    } catch (error) {
      if (error.code === 'P2025') {
        throw new Error(`Perfil com ID ${id} não encontrado.`); // Or throw NotFoundException
      }
      throw error;
    }
  }

  async findByNome(
    nome: string,
    includeDeleted: boolean = false,
  ): Promise<Perfil | null> {
    const whereClause: any = { nome };
    if (!includeDeleted) {
      whereClause.deletedAt = null;
    }
    const perfil = await this.prisma.perfil.findFirst({
      where: whereClause,
      include: { permissoes: true },
    });
    return perfil ? this.toDomain(perfil) : null;
  }

  async findByNomeContaining(
    nome: string,
    skip: number,
    take: number,
    includeDeleted: boolean = false,
  ): Promise<[Perfil[], number]> {
    const whereClause: any = {
      nome: {
        contains: nome,
        mode: 'insensitive',
      },
    };
    if (!includeDeleted) {
      whereClause.deletedAt = null;
    }

    const data = await this.prisma.perfil.findMany({
      skip,
      take,
      where: whereClause,
      include: { permissoes: true },
    });
    const total = await this.prisma.perfil.count({
      where: whereClause,
    });
    return [data.map((p) => this.toDomain(p)), total];
  }
}
