import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ResetPasswordDto } from './reset-password.dto';

// TDD: features/autenticacao.feature:Cenário: Resetar senha com token válido

describe('ResetPasswordDto', () => {
  const validateDto = async (data: any) => {
    const dto = plainToInstance(ResetPasswordDto, data);
    const errors = await validate(dto);
    return errors.map((e) => ({
      property: e.property,
      constraints: e.constraints,
    }));
  };

  it('deve aceitar payload válido (token + novaSenha >= 8 chars com requisitos)', async () => {
    const errors = await validateDto({
      token: 'a'.repeat(64),
      novaSenha: 'NovaSenha123!',
    });
    expect(errors).toHaveLength(0);
  });

  it('deve rejeitar token vazio', async () => {
    const errors = await validateDto({ token: '', novaSenha: 'NovaSenha123!' });
    expect(errors[0].property).toBe('token');
  });

  it('deve rejeitar token ausente', async () => {
    const errors = await validateDto({ novaSenha: 'NovaSenha123!' });
    expect(errors[0].property).toBe('token');
  });

  it('deve rejeitar novaSenha com menos de 8 caracteres', async () => {
    const errors = await validateDto({
      token: 'a'.repeat(64),
      novaSenha: 'Curta1',
    });
    expect(errors.some((e) => e.property === 'novaSenha')).toBe(true);
  });

  it('deve rejeitar novaSenha sem letra maiúscula', async () => {
    const errors = await validateDto({
      token: 'a'.repeat(64),
      novaSenha: 'novasenha123',
    });
    expect(errors[0].property).toBe('novaSenha');
  });

  it('deve rejeitar novaSenha sem letra minúscula', async () => {
    const errors = await validateDto({
      token: 'a'.repeat(64),
      novaSenha: 'NOVASENHA123',
    });
    expect(errors[0].property).toBe('novaSenha');
  });

  it('deve rejeitar novaSenha sem número', async () => {
    const errors = await validateDto({
      token: 'a'.repeat(64),
      novaSenha: 'NovaSenhaForte!',
    });
    expect(errors[0].property).toBe('novaSenha');
  });
});
