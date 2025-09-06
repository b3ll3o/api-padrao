import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LoginUsuarioDto } from '../../dto/login-usuario.dto';
import { UsuarioRepository } from '../../../usuarios/domain/repositories/usuario.repository';

@Injectable()
export class AuthService {
  constructor(
    private usuarioRepository: UsuarioRepository,
    private jwtService: JwtService,
  ) {}

  async validateUser(
    email: string,
    pass: string,
  ): Promise<{
    id: number;
    email: string;
    createdAt: Date;
    updatedAt: Date;
  } | null> {
    const user = await this.usuarioRepository.findByEmail(email);
    if (user && (await user.comparePassword(pass))) {
      const { id, email, createdAt, updatedAt } = user;
      return { id, email, createdAt, updatedAt };
    }
    return null;
  }

  async login(loginUsuarioDto: LoginUsuarioDto) {
    const user = await this.validateUser(
      loginUsuarioDto.email,
      loginUsuarioDto.senha,
    );
    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    const payload = { email: user.email, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
