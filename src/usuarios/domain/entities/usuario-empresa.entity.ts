import { Empresa } from '../../../empresas/domain/entities/empresa.entity';
import { Perfil } from '../../../perfis/domain/entities/perfil.entity';

export class UsuarioEmpresa {
  id: number;
  usuarioId: number;
  empresaId: string;
  empresa?: Empresa;
  perfis?: Perfil[];
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<UsuarioEmpresa>) {
    Object.assign(this, partial);
  }
}
