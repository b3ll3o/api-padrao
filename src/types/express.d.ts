import { Perfil } from 'src/perfis/domain/entities/perfil.entity';

declare namespace Express {
  interface Request {
    usuarioLogado?: any; // You can replace 'any' with a more specific type for your user object
  }
}