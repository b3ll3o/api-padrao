import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsNumber,
} from 'class-validator';

export class CreatePerfilDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  permissoesIds?: number[];
}
