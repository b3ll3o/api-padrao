import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LoginUsuarioDto } from '../../dto/login-usuario.dto';
import { UsuarioRepository } from '../../../usuarios/domain/repositories/usuario.repository';
import { ConfigService } from '@nestjs/config';
import { PasswordHasher } from 'src/shared/domain/services/password-hasher.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AuthService {
  constructor(
    private usuarioRepository: UsuarioRepository,
    private jwtService: JwtService,
    private passwordHasher: PasswordHasher,
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  async login(
    loginUsuarioDto: LoginUsuarioDto,
    ip?: string,
    userAgent?: string,
  ) {
    const user =
      await this.usuarioRepository.findByEmailWithPerfisAndPermissoes(
        loginUsuarioDto.email,
      );

    if (
      !user ||
      !user.senha ||
      !loginUsuarioDto.senha ||
      !(await this.passwordHasher.compare(loginUsuarioDto.senha, user.senha))
    ) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    // Grava histórico de login
    await this.prisma.loginHistory.create({
      data: {
        userId: user.id,
        ip,
        userAgent,
      },
    });

    return this.generateTokens(user.id, user.email, user.empresas);
  }

  async generateTokens(userId: number, email: string, empresas: any) {
    const mappedEmpresas = empresas?.map((ue: any) => ({
      id: ue.empresaId,
      perfis: ue.perfis?.map((perfil: any) => ({
        id: perfil.id,
        nome: perfil.nome,
        codigo: perfil.codigo,
        descricao: perfil.descricao,
        permissoes: perfil.permissoes?.map((permissao: any) => ({
          id: permissao.id,
          nome: permissao.nome,
          codigo: permissao.codigo,
          descricao: permissao.descricao,
        })),
      })),
    }));

    const payload = { email, sub: userId, empresas: mappedEmpresas };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m', // Curta duração para segurança
      secret: this.configService.getOrThrow<string>('JWT_SECRET'),
    });

    // Gera um UUID único para o Refresh Token
    const refreshTokenValue = uuidv4();
    const expiresInDays = 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    // Armazena no banco de dados
    await this.prisma.refreshToken.create({
      data: {
        token: refreshTokenValue,
        userId: userId,
        expiresAt,
      },
    });

    return {
      access_token: accessToken,
      refresh_token: refreshTokenValue,
    };
  }

  async refreshTokens(refreshToken: string) {
    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: {
        user: {
          include: {
            empresas: {
              include: { perfis: { include: { permissoes: true } } },
            },
          },
        },
      },
    });

    if (!tokenRecord) {
      throw new UnauthorizedException('Refresh token inválido.');
    }

    // Detecção de Reuso de Token (Ataque Detectado)
    if (tokenRecord.revokedAt) {
      // Se um token já revogado for usado, revogamos TODOS os tokens do usuário por precaução
      await this.prisma.refreshToken.updateMany({
        where: { userId: tokenRecord.userId },
        data: { revokedAt: new Date() },
      });
      throw new ForbiddenException(
        'Atividade suspeita detectada. Todos os tokens revogados.',
      );
    }

    if (new Date() > tokenRecord.expiresAt) {
      throw new UnauthorizedException('Refresh token expirado.');
    }

    // Revoga o token atual (rotação)
    await this.prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { revokedAt: new Date() },
    });

    // Gera novo par
    return this.generateTokens(
      tokenRecord.user.id,
      tokenRecord.user.email,
      tokenRecord.user.empresas,
    );
  }
}
