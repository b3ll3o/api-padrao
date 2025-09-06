import { Permissao } from 'src/permissoes/domain/entities/permissao.entity';

export class Perfil {
  id: number;
  nome: string;
  permissoes?: Permissao[];
}
