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

  it('deve rejeitar token com mais de 128 caracteres', async () => {
    const errors = await validateDto({
      token: 'a'.repeat(129),
      novaSenha: 'NovaSenha123!',
    });
    expect(errors[0].property).toBe('token');
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });

  it('deve aceitar token com exatamente 128 caracteres (boundary)', async () => {
    const errors = await validateDto({
      token: 'a'.repeat(128),
      novaSenha: 'NovaSenha123!',
    });
    expect(errors).toHaveLength(0);
  });

  it('deve aceitar novaSenha com exatamente 8 caracteres válidos (boundary)', async () => {
    // 8 chars: "Abc12345" → 1 maiúscula, 1 minúscula, 1 número
    const errors = await validateDto({
      token: 'a'.repeat(64),
      novaSenha: 'Abc12345',
    });
    expect(errors).toHaveLength(0);
  });

  it('deve rejeitar novaSenha que não seja string (ex.: número)', async () => {
    const errors = await validateDto({
      token: 'a'.repeat(64),
      novaSenha: 12345678 as unknown as string,
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('novaSenha');
  });

  it('deve produzir constraint matches específica para cada requisito faltante (uppercase, lowercase, number)', async () => {
    // Senha sem uppercase
    const noUpper = await validateDto({
      token: 'a'.repeat(64),
      novaSenha: 'novasenha1',
    });
    expect(noUpper[0].property).toBe('novaSenha');
    expect(noUpper[0].constraints).toHaveProperty('matches');

    // Senha sem lowercase
    const noLower = await validateDto({
      token: 'a'.repeat(64),
      novaSenha: 'NOVASENHA1',
    });
    expect(noLower[0].property).toBe('novaSenha');
    expect(noLower[0].constraints).toHaveProperty('matches');

    // Senha sem número
    const noNumber = await validateDto({
      token: 'a'.repeat(64),
      novaSenha: 'NovaSenhaX',
    });
    expect(noNumber[0].property).toBe('novaSenha');
    expect(noNumber[0].constraints).toHaveProperty('matches');
  });

  it('deve rejeitar novaSenha com mais de 128 caracteres', async () => {
    const errors = await validateDto({
      token: 'a'.repeat(64),
      novaSenha: 'A1' + 'a'.repeat(127), // 129 chars total
    });
    expect(errors.some((e) => e.property === 'novaSenha')).toBe(true);
    const novaSenhaError = errors.find((e) => e.property === 'novaSenha');
    expect(novaSenhaError?.constraints).toHaveProperty('maxLength');
  });
});
