import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ForgotPasswordDto } from './forgot-password.dto';

// TDD: features/autenticacao.feature:Cenário: Solicitar recuperação de senha com e-mail válido

describe('ForgotPasswordDto', () => {
  const validateDto = async (data: any) => {
    const dto = plainToInstance(ForgotPasswordDto, data);
    const errors = await validate(dto);
    return errors.map((e) => ({
      property: e.property,
      constraints: e.constraints,
    }));
  };

  it('deve aceitar e-mail válido', async () => {
    const errors = await validateDto({ email: 'user@empresa.com' });
    expect(errors).toHaveLength(0);
  });

  it('deve rejeitar e-mail em formato inválido', async () => {
    const errors = await validateDto({ email: 'nao-eh-email' });
    expect(errors[0].property).toBe('email');
    expect(errors[0].constraints).toHaveProperty('isEmail');
  });

  it('deve rejeitar e-mail vazio', async () => {
    const errors = await validateDto({ email: '' });
    expect(errors[0].property).toBe('email');
  });

  it('deve rejeitar e-mail ausente', async () => {
    const errors = await validateDto({});
    expect(errors[0].property).toBe('email');
  });
});
