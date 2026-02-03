import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsuariosService } from '../../../usuarios/application/services/usuarios.service';

export interface JwtPayload {
  email: string;
  userId?: number;
  sub?: number;
  empresas?: {
    id: string;
    perfis?: {
      codigo: string;
      permissoes?: {
        codigo: string;
      }[];
    }[];
  }[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private usuariosService: UsuariosService,
    private configService: ConfigService,
  ) {
    super({
      jwtFromRequest: (ExtractJwt as any).fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const mappedEmpresas = payload.empresas?.map((empresa) => ({
      id: empresa.id,
      perfis: empresa.perfis?.map((perfil) => ({
        codigo: perfil.codigo,
        permissoes: perfil.permissoes?.map((permissao) => ({
          codigo: permissao.codigo,
        })),
      })),
    }));

    return {
      userId: payload.sub,
      email: payload.email,
      empresas: mappedEmpresas,
    };
  }
}
