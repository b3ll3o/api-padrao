import { IsString, IsNotEmpty } from 'class-validator';

export class CreatePermissaoDto {
  @IsString()
  @IsNotEmpty()
  nome: string;
}
