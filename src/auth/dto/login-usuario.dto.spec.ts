import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginUsuarioDto } from './login-usuario.dto';

// TDD: features/autenticacao.feature:Login com credenciais válidas
//      + Cenários de validação (email/senha)

describe('LoginUsuarioDto', () => {
  const validateDto = async (data: any) => {
    const dto = plainToInstance(LoginUsuarioDto, data);
    const errors = await validate(dto);
    return errors.map((e) => ({
      property: e.property,
      constraints: e.constraints,
    }));
  };

  it('deve aceitar payload válido (email + senha >= 8 chars)', async () => {
    const errors = await validateDto({
      email: 'user@empresa.com',
      senha: 'Password123!',
    });
    expect(errors).toHaveLength(0);
  });

  it('deve rejeitar email inválido', async () => {
    const errors = await validateDto({
      email: 'nao-eh-email',
      senha: 'Password123!',
    });
    expect(errors[0].property).toBe('email');
    expect(errors[0].constraints).toHaveProperty('isEmail');
  });

  it('deve rejeitar email vazio', async () => {
    const errors = await validateDto({ email: '', senha: 'Password123!' });
    expect(errors[0].property).toBe('email');
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('deve rejeitar email ausente', async () => {
    const errors = await validateDto({ senha: 'Password123!' });
    expect(errors[0].property).toBe('email');
  });

  it('deve rejeitar senha com menos de 8 caracteres', async () => {
    const errors = await validateDto({
      email: 'user@empresa.com',
      senha: 'curta',
    });
    expect(errors[0].property).toBe('senha');
    expect(errors[0].constraints).toHaveProperty('minLength');
  });

  it('deve aceitar senha com exatamente 8 caracteres (boundary)', async () => {
    const errors = await validateDto({
      email: 'user@empresa.com',
      senha: '12345678',
    });
    expect(errors).toHaveLength(0);
  });

  it('deve rejeitar senha vazia', async () => {
    const errors = await validateDto({ email: 'user@empresa.com', senha: '' });
    expect(errors[0].property).toBe('senha');
  });

  it('deve rejeitar senha ausente', async () => {
    const errors = await validateDto({ email: 'user@empresa.com' });
    expect(errors[0].property).toBe('senha');
  });
});
