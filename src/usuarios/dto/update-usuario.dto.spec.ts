import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUsuarioDto } from './update-usuario.dto';

// TDD: features/usuarios.feature:Cenário: Atualizar usuário (todos os campos opcionais)
// REQ-USER-002: email válido na atualização
// REQ-USER-003/004: senha com regras de validação herdadas
// REQ-USER-030: PATCH /usuarios/:id
// REQ-USER-035/036: aceitar ativo:true/false (soft delete/restore)

describe('UpdateUsuarioDto', () => {
  const validateDto = async (data: any) => {
    const dto = plainToInstance(UpdateUsuarioDto, data);
    const errors = await validate(dto);
    return errors.map((e) => ({
      property: e.property,
      constraints: e.constraints,
    }));
  };

  it('deve aceitar payload vazio (todos os campos opcionais)', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('deve aceitar atualização parcial de email', async () => {
    const errors = await validateDto({ email: 'novo@empresa.com' });
    expect(errors).toHaveLength(0);
  });

  it('deve aceitar atualização de ativo=true (reativação)', async () => {
    const errors = await validateDto({ ativo: true });
    expect(errors).toHaveLength(0);
  });

  it('deve aceitar atualização de ativo=false (soft delete)', async () => {
    const errors = await validateDto({ ativo: false });
    expect(errors).toHaveLength(0);
  });

  it('deve rejeitar email inválido (herdado de CreateUsuarioDto)', async () => {
    const errors = await validateDto({ email: 'nao-eh-email' });
    expect(errors[0].property).toBe('email');
    expect(errors[0].constraints).toHaveProperty('isEmail');
  });

  it('deve rejeitar ativo não-boolean', async () => {
    const errors = await validateDto({ ativo: 'sim' });
    expect(errors[0].property).toBe('ativo');
    expect(errors[0].constraints).toHaveProperty('isBoolean');
  });

  it('deve rejeitar senha fraca (herdado de CreateUsuarioDto)', async () => {
    const errors = await validateDto({ senha: 'fraca' });
    expect(errors.some((e) => e.property === 'senha')).toBe(true);
  });
});
