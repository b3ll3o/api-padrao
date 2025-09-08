import { Perfil } from 'src/perfis/domain/entities/perfil.entity';

declare namespace Express {
  interface Request {
    usuarioLogado?: {
      id: number;
      email: string;
      perfis?: Perfil[];
    };
    user?: {
      userId: number;
      email: string;
      perfis?: Perfil[];
    };
  }
}
