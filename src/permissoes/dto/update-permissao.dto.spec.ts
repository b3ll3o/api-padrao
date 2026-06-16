import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePermissaoDto } from './update-permissao.dto';

// TDD: features/permissoes.feature:Cenário: Atualizar permissão (campos opcionais)

describe('UpdatePermissaoDto', () => {
  const validateDto = async (data: any) => {
    const dto = plainToInstance(UpdatePermissaoDto, data);
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

  it('deve aceitar atualização parcial de nome', async () => {
    const errors = await validateDto({ nome: 'update:users' });
    expect(errors).toHaveLength(0);
  });

  it('deve aceitar atualização de ativo=true', async () => {
    const errors = await validateDto({ ativo: true });
    expect(errors).toHaveLength(0);
  });

  it('deve aceitar atualização de ativo=false (soft delete)', async () => {
    const errors = await validateDto({ ativo: false });
    expect(errors).toHaveLength(0);
  });

  it('deve rejeitar ativo não-boolean', async () => {
    const errors = await validateDto({ ativo: 'sim' });
    expect(errors[0].property).toBe('ativo');
    expect(errors[0].constraints).toHaveProperty('isBoolean');
  });

  it('deve rejeitar nome vazio quando fornecido', async () => {
    const errors = await validateDto({ nome: '' });
    expect(errors[0].property).toBe('nome');
  });
});
