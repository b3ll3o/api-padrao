import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateEmpresaDto } from './update-empresa.dto';

// TDD: features/empresas.feature:Cenário: Atualizar dados da empresa (campos opcionais)

describe('UpdateEmpresaDto', () => {
  const validateDto = async (data: any) => {
    const dto = plainToInstance(UpdateEmpresaDto, data);
    const errors = await validate(dto);
    return errors.map((e) => ({
      property: e.property,
      constraints: e.constraints,
    }));
  };

  it('deve aceitar payload vazio (todos os campos opcionais via PartialType)', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('deve aceitar atualização parcial de nome', async () => {
    const errors = await validateDto({ nome: 'Empresa Renomeada' });
    expect(errors).toHaveLength(0);
  });

  it('deve aceitar atualização parcial de descricao', async () => {
    const errors = await validateDto({ descricao: 'Nova descrição' });
    expect(errors).toHaveLength(0);
  });

  it('deve aceitar atualização parcial de responsavelId', async () => {
    const errors = await validateDto({ responsavelId: 2 });
    expect(errors).toHaveLength(0);
  });

  it('deve rejeitar nome vazio quando fornecido', async () => {
    const errors = await validateDto({ nome: '' });
    expect(errors[0].property).toBe('nome');
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('deve rejeitar responsavelId não-inteiro quando fornecido', async () => {
    const errors = await validateDto({ responsavelId: 'abc' });
    expect(errors[0].property).toBe('responsavelId');
    expect(errors[0].constraints).toHaveProperty('isInt');
  });
});
