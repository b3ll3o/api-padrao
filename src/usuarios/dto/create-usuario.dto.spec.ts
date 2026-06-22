import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUsuarioDto } from './create-usuario.dto';

// TDD: features/usuarios.feature:Cenário: Criar usuário com dados válidos
// REQ-USER-001: POST /usuarios (endpoint público, auto-cadastro)
// REQ-USER-002: email sintaticamente válido (RFC 5322 subset)
// REQ-USER-003: senha >= 8 caracteres
// REQ-USER-004: senha com complexidade (maiusc, minusc, dígito/símbolo)
// REQ-USER-005: 400 com mensagem localizável em falhas de validação
// REQ-USER-006: 409 quando email já existe
// REQ-USER-007: persistir senha como bcrypt (custo 10)
// REQ-USER-008: 201 com id, email, timestamps (sem senha)

describe('CreateUsuarioDto', () => {
  const validateDto = async (data: any) => {
    const dto = plainToInstance(CreateUsuarioDto, data);
    const errors = await validate(dto);
    return errors.map((e) => ({
      property: e.property,
      constraints: e.constraints,
    }));
  };

  it('deve aceitar payload válido (email + senha forte)', async () => {
    const errors = await validateDto({
      email: 'user@empresa.com',
      senha: 'Password123!',
    });
    expect(errors).toHaveLength(0);
  });

  it('deve rejeitar email inválido', async () => {
    const errors = await validateDto({
      email: 'invalido',
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

  it('deve rejeitar senha sem complexidade (sem maiúscula, minúscula, número ou símbolo)', async () => {
    const errors = await validateDto({
      email: 'user@empresa.com',
      senha: 'completamenteminuscula',
    });
    expect(errors[0].property).toBe('senha');
    expect(errors[0].constraints).toHaveProperty('matches');
  });

  it('deve aceitar senha com complexidade mínima (8 chars, 1 maiúsc, 1 minúsc, 1 número/símbolo)', async () => {
    const errors = await validateDto({
      email: 'user@empresa.com',
      senha: 'Abcdef1!',
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
