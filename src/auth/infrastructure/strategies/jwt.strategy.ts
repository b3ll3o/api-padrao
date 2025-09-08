import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { jwtConstants } from '../constants/jwt.constants';
import { UsuariosService } from '../../../usuarios/application/services/usuarios.service';

export interface JwtPayload {
  email: string;
  sub: number;
  perfis?: {
    id: number;
    nome: string;
    permissoes?: {
      id: number;
      nome: string;
    }[];
  }[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private usuariosService: UsuariosService) {
    super({
      jwtFromRequest: (ExtractJwt as any).fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConstants.secret,
    });
  }

  async validate(payload: JwtPayload) {
    return {
      userId: payload.sub,
      email: payload.email,
      perfis: payload.perfis,
    };
  }
}
