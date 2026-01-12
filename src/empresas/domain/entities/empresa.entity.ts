export class Empresa {
  id: string;
  nome: string;
  descricao?: string | null;
  ativo: boolean;
  responsavelId: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;

  constructor(partial: Partial<Empresa>) {
    Object.assign(this, partial);
  }
}
