import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Perfil } from '../src/perfis/domain/entities/perfil.entity';
import { Permissao } from '../src/permissoes/domain/entities/permissao.entity';
import { Usuario } from '../src/usuarios/domain/entities/usuario.entity';

interface TestUser {
  user: Usuario;
  token: string;
}

export class TestDataBuilder {
  private prisma: PrismaService;
  private jwtService: JwtService;
  private app: INestApplication;

  constructor(app: INestApplication) {
    this.app = app;
    this.prisma = app.get<PrismaService>(PrismaService);
    this.jwtService = app.get<JwtService>(JwtService);
  }

  async createPermission(
    nome: string,
    codigo: string,
    descricao: string,
  ): Promise<Permissao> {
    let permissao = await this.prisma.permissao.findUnique({
      where: { codigo },
    });
    if (!permissao) {
      permissao = await this.prisma.permissao.create({
        data: { nome, codigo, descricao },
      });
    }
    return permissao;
  }

  async createProfile(
    nome: string,
    codigo: string,
    descricao: string,
    permissionCodes: string[] = [],
  ): Promise<Perfil> {
    const permissions = await Promise.all(
      permissionCodes.map((code) =>
        this.prisma.permissao.findUniqueOrThrow({ where: { codigo: code } }),
      ),
    );

    let perfil = await this.prisma.perfil.findUnique({
      where: { codigo },
      include: { permissoes: true },
    });

    if (!perfil) {
      perfil = await this.prisma.perfil.create({
        data: {
          nome,
          codigo,
          descricao,
          permissoes: {
            connect: permissions.map((p) => ({ id: p.id })),
          },
        },
        include: { permissoes: true },
      });
    } else {
      // Ensure existing profile has all required permissions
      const existingPermissionIds = perfil.permissoes.map((p) => p.id);
      const permissionsToConnect = permissions.filter(
        (p) => !existingPermissionIds.includes(p.id),
      );
      if (permissionsToConnect.length > 0) {
        perfil = await this.prisma.perfil.update({
          where: { id: perfil.id },
          data: {
            permissoes: {
              connect: permissionsToConnect.map((p) => ({ id: p.id })),
            },
          },
          include: { permissoes: true },
        });
      }
    }
    return perfil;
  }

  async createUser(
    email: string,
    senha?: string,
    profileCodes: string[] = [],
  ): Promise<Usuario> {
    const profiles = await Promise.all(
      profileCodes.map((code) =>
        this.prisma.perfil.findUniqueOrThrow({ where: { codigo: code } }),
      ),
    );

    const hashedPassword = senha ? await bcrypt.hash(senha, 10) : undefined;

    let user = await this.prisma.usuario.findUnique({
      where: { email },
      include: { perfis: { include: { permissoes: true } } },
    });

    if (!user) {
      user = await this.prisma.usuario.create({
        data: {
          email,
          senha: hashedPassword,
          perfis: {
            connect: profiles.map((p) => ({ id: p.id })),
          },
        },
        include: { perfis: { include: { permissoes: true } } },
      });
    } else {
      // Ensure existing user has all required profiles
      const existingProfileIds = user.perfis.map((p) => p.id);
      const profilesToConnect = profiles.filter(
        (p) => !existingProfileIds.includes(p.id),
      );
      if (profilesToConnect.length > 0) {
        user = await this.prisma.usuario.update({
          where: { id: user.id },
          data: {
            perfis: {
              connect: profilesToConnect.map((p) => ({ id: p.id })),
            },
          },
          include: { perfis: { include: { permissoes: true } } },
        });
      }
    }
    return user;
  }

  generateToken(user: Usuario): string {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      perfis: user.perfis?.map((perfil) => ({
        id: perfil.id,
        nome: perfil.nome,
        codigo: perfil.codigo,
        descricao: perfil.descricao,
        permissoes: perfil.permissoes?.map((permissao) => ({
          id: permissao.id,
          nome: permissao.nome,
          codigo: permissao.codigo,
          descricao: permissao.descricao,
        })),
      })),
    });
  }

  async createAdminUserAndToken(): Promise<TestUser> {
    // Create all necessary permissions for admin
    const adminPermissionCodes = [
      'CREATE_PERFIL',
      'READ_PERFIS',
      'READ_PERFIL_BY_ID',
      'READ_PERFIL_BY_NOME',
      'UPDATE_PERFIL',
      'DELETE_PERFIL',
      'CREATE_PERMISSAO',
      'READ_PERMISSOES',
      'READ_PERMISSAO_BY_ID',
      'READ_PERMISSAO_BY_NOME',
      'UPDATE_PERMISSAO',
      'DELETE_PERMISSAO',
      'READ_USUARIO_BY_ID',
      'UPDATE_USUARIO',
      'DELETE_USUARIO',
      'RESTORE_USUARIO',
    ];

    await Promise.all(
      adminPermissionCodes.map((code) =>
        this.createPermission(
          code.toLowerCase().replace(/_/g, ':'),
          code,
          `Permissão para ${code.toLowerCase().replace(/_/g, ' ')}`,
        ),
      ),
    );

    // Create Admin profile with all permissions
    await this.createProfile(
      'Admin',
      'ADMIN',
      'Perfil de administrador',
      adminPermissionCodes,
    );

    // Create Admin user
    const adminUser = await this.createUser('admin@example.com', 'admin123', [
      'ADMIN',
    ]);

    const adminToken = this.generateToken(adminUser);

    return { user: adminUser, token: adminToken };
  }

  async createLimitedUserAndToken(): Promise<TestUser> {
    const limitedPermissionCode = 'READ_LIMITED_RESOURCE';
    await this.createPermission(
      limitedPermissionCode.toLowerCase().replace(/_/g, ':'),
      limitedPermissionCode,
      'Permissão para ler um recurso limitado',
    );

    await this.createProfile(
      'LimitedUser',
      'LIMITED_USER',
      'Perfil de usuário com acesso limitado',
      [limitedPermissionCode],
    );

    const limitedUser = await this.createUser(
      'limited@example.com',
      'Limited123!',
      ['LIMITED_USER'],
    );

    const limitedUserToken = this.generateToken(limitedUser);

    return { user: limitedUser, token: limitedUserToken };
  }
}
