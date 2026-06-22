import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePermissaoDto } from './create-permissao.dto';

// TDD: features/permissoes.feature:Cenário: Criar permissão com dados válidos
// REQ-PERM-001: nome único global (case-sensitive) — 409 em duplicidade
// REQ-PERM-002: codigo único global (case-sensitive) — 409 em duplicidade
// REQ-PERM-003: validar nome/codigo/descricao como strings não vazias (HTTP 400)
// REQ-PERM-004: codigo SCREAMING_SNAKE_CASE (alerta, não bloqueia)
// REQ-PERM-005: Permissao é entidade global (sem empresaId)
// REQ-PERM-010: POST /permissoes (autorização CREATE_PERMISSAO)

describe('CreatePermissaoDto', () => {
  const validateDto = async (data: any) => {
    const dto = plainToInstance(CreatePermissaoDto, data);
    const errors = await validate(dto);
    return errors.map((e) => ({
      property: e.property,
      constraints: e.constraints,
    }));
  };

  it('deve aceitar payload válido (nome + codigo + descricao)', async () => {
    const errors = await validateDto({
      nome: 'read:users',
      codigo: 'READ_USERS',
      descricao: 'Ler usuários',
    });
    expect(errors).toHaveLength(0);
  });

  it('deve rejeitar nome vazio', async () => {
    const errors = await validateDto({ nome: '', codigo: 'X', descricao: 'd' });
    expect(errors[0].property).toBe('nome');
  });

  it('deve rejeitar nome não-string', async () => {
    const errors = await validateDto({
      nome: 123,
      codigo: 'X',
      descricao: 'd',
    });
    expect(errors[0].property).toBe('nome');
    expect(errors[0].constraints).toHaveProperty('isString');
  });

  it('deve rejeitar codigo vazio', async () => {
    const errors = await validateDto({ nome: 'n', codigo: '', descricao: 'd' });
    expect(errors[0].property).toBe('codigo');
  });

  it('deve rejeitar descricao vazia', async () => {
    const errors = await validateDto({ nome: 'n', codigo: 'X', descricao: '' });
    expect(errors[0].property).toBe('descricao');
  });

  it('deve rejeitar todos os campos obrigatórios ausentes', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(3);
  });
});
