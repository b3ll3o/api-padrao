import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'O refresh token obtido no login',
    example: 'uuid-do-token',
  })
  @IsNotEmpty({ message: 'O refresh token não pode ser vazio' })
  @IsString()
  refresh_token: string;
}
