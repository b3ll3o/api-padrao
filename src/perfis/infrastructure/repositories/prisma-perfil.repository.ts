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

  async findAll(): Promise<Perfil[]> {
    return this.prisma.perfil.findMany({ include: { permissoes: true } });
  }

  async findOne(id: number): Promise<Perfil | undefined> {
    const perfil = await this.prisma.perfil.findUnique({
      where: { id },
      include: { permissoes: true },
    });
    return perfil || undefined;
  }

  async update(id: number, data: UpdatePerfilDto): Promise<Perfil> {
    const { permissoesIds, ...perfilData } = data;
    return this.prisma.perfil.update({
      where: { id },
      data: {
        ...perfilData,
        permissoes: {
          set: permissoesIds?.map((id) => ({ id })),
        },
      },
      include: { permissoes: true },
    });
  }

  async remove(id: number): Promise<void> {
    await this.prisma.perfil.delete({ where: { id } });
  }
}
