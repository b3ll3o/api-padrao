import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { jwtConstants } from '../constants/jwt.constants';
import { UsuariosService } from '../../../usuarios/application/services/usuarios.service';

interface JwtPayload {
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    super({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      jwtFromRequest: (ExtractJwt as any).fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConstants.secret,
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async validate(payload: JwtPayload) {
    return { userId: payload.sub, email: payload.email, perfis: payload.perfis };
  }
}
