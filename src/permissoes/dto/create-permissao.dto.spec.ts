import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePermissaoDto } from './create-permissao.dto';

// TDD: features/permissoes.feature:Cenário: Criar permissão com dados válidos

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
