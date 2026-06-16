import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RefreshTokenDto } from './refresh-token.dto';

// TDD: features/autenticacao.feature:Refresh token válido
//      + Cenários de validação (token vazio/ausente)

describe('RefreshTokenDto', () => {
  const validateDto = async (data: any) => {
    const dto = plainToInstance(RefreshTokenDto, data);
    const errors = await validate(dto);
    return errors.map((e) => ({
      property: e.property,
      constraints: e.constraints,
    }));
  };

  it('deve aceitar refresh_token válido (string não vazia)', async () => {
    const errors = await validateDto({ refresh_token: 'uuid-token-aqui' });
    expect(errors).toHaveLength(0);
  });

  it('deve rejeitar refresh_token vazio', async () => {
    const errors = await validateDto({ refresh_token: '' });
    expect(errors[0].property).toBe('refresh_token');
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('deve rejeitar refresh_token ausente', async () => {
    const errors = await validateDto({});
    expect(errors[0].property).toBe('refresh_token');
  });

  it('deve rejeitar refresh_token não-string', async () => {
    const errors = await validateDto({ refresh_token: 12345 });
    expect(errors[0].property).toBe('refresh_token');
    expect(errors[0].constraints).toHaveProperty('isString');
  });
});
