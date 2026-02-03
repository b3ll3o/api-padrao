import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LoginUsuarioDto } from '../../dto/login-usuario.dto';
import { UsuarioRepository } from '../../../usuarios/domain/repositories/usuario.repository';
import { ConfigService } from '@nestjs/config';
import { PasswordHasher } from 'src/shared/domain/services/password-hasher.service';

@Injectable()
export class AuthService {
  constructor(
    private usuarioRepository: UsuarioRepository,
    private jwtService: JwtService,
    private passwordHasher: PasswordHasher,
    private configService: ConfigService,
  ) {}

  async login(loginUsuarioDto: LoginUsuarioDto) {
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

    const empresas = user.empresas?.map((ue) => ({
      id: ue.empresaId,
      perfis: ue.perfis?.map((perfil) => ({
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
    }));

    const payload = { email: user.email, sub: user.id, empresas };
    return {
      access_token: this.jwtService.sign(
        payload as any,
        {
          expiresIn: this.configService.get<string>('JWT_EXPIRES_IN'),
        } as any,
      ),
    };
  }
}
