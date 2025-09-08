import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LoginUsuarioDto } from '../../dto/login-usuario.dto';
import { UsuarioRepository } from '../../../usuarios/domain/repositories/usuario.repository';
import { jwtConstants } from '../../infrastructure/constants/jwt.constants';

@Injectable()
export class AuthService {
  constructor(
    private usuarioRepository: UsuarioRepository,
    private jwtService: JwtService,
  ) {}

  async login(loginUsuarioDto: LoginUsuarioDto) {
    const user =
      await this.usuarioRepository.findByEmailWithPerfisAndPermissoes(
        loginUsuarioDto.email,
      );

    if (!user || !(await user.comparePassword(loginUsuarioDto.senha))) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const perfis = user.perfis?.map((perfil) => ({
      id: perfil.id,
      nome: perfil.nome,
      permissoes: perfil.permissoes?.map((permissao) => ({
        id: permissao.id,
        nome: permissao.nome,
      })),
    }));

    const payload = { email: user.email, sub: user.id, perfis };
    return {
      access_token: this.jwtService.sign(payload, { expiresIn: jwtConstants.expiresIn }),
    };
  }
}