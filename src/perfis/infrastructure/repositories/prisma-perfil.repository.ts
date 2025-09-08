import { Injectable } from '@nestjs/common';
import { PerfilRepository } from '../../domain/repositories/perfil.repository';
import { Perfil } from '../../domain/entities/perfil.entity';
import { CreatePerfilDto } from '../../dto/create-perfil.dto';
import { UpdatePerfilDto } from '../../dto/update-perfil.dto';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class PrismaPerfilRepository implements PerfilRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreatePerfilDto): Promise<Perfil> {
    const { permissoesIds, ...perfilData } = data;
    return this.prisma.perfil.create({
      data: {
        ...perfilData,
        permissoes: {
          connect: permissoesIds?.map((id) => ({ id })),
        },
      },
      include: { permissoes: true },
    });
  }

  async findAll(skip: number, take: number): Promise<[Perfil[], number]> {
    const data = await this.prisma.perfil.findMany({
      skip,
      take,
      include: { permissoes: true },
    });
    const total = await this.prisma.perfil.count();
    return [data, total];
  }

  async findOne(id: number): Promise<Perfil | undefined> {
    const perfil = await this.prisma.perfil.findUnique({
      where: { id },
      include: { permissoes: true },
    });
    return perfil || undefined;
  }

  async update(id: number, data: UpdatePerfilDto): Promise<Perfil | undefined> {
    const { permissoesIds, ...perfilData } = data;
    try {
      return await this.prisma.perfil.update({
        where: { id },
        data: {
          ...perfilData,
          permissoes: {
            set: permissoesIds?.map((id) => ({ id })),
          },
        },
        include: { permissoes: true },
      });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (error.code === 'P2025') {
        return undefined;
      }
      throw error;
    }
  }

  async remove(id: number): Promise<void> {
    try {
      await this.prisma.perfil.delete({ where: { id } });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (error.code === 'P2025') {
        // If the record to delete is not found, do nothing, as the goal is to ensure it's removed.
        return;
      }
      throw error;
    }
  }

  async findByNome(nome: string): Promise<Perfil | null> {
    return this.prisma.perfil.findUnique({
      where: { nome },
      include: { permissoes: true },
    });
  }

  async findByNomeContaining(
    nome: string,
    skip: number,
    take: number,
  ): Promise<[Perfil[], number]> {
    const data = await this.prisma.perfil.findMany({
      skip,
      take,
      where: {
        nome: {
          contains: nome,
          mode: 'insensitive',
        },
      },
      include: { permissoes: true },
    });
    const total = await this.prisma.perfil.count({
      where: {
        nome: {
          contains: nome,
          mode: 'insensitive',
        },
      },
    });
    return [data, total];
  }
}
