import { IsString, IsNotEmpty, IsOptional, IsInt } from 'class-validator';

export class CreateEmpresaDto {
  /**
   * Nome da empresa
   * @example "Minha Empresa Ltda"
   */
  @IsNotEmpty({ message: 'O nome é obrigatório' })
  @IsString({ message: 'O nome deve ser uma string' })
  nome: string;

  /**
   * Descrição da empresa
   * @example "Empresa de tecnologia focada em soluções web"
   */
  @IsOptional()
  @IsString({ message: 'A descrição deve ser uma string' })
  descricao?: string;

  /**
   * ID do usuário responsável pela empresa
   * @example 1
   */
  @IsNotEmpty({ message: 'O ID do responsável é obrigatório' })
  @IsInt({ message: 'O ID do responsável deve ser um número inteiro' })
  responsavelId: number;
}
