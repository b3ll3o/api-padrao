import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEmpresaDto } from './create-empresa.dto';

// TDD: features/empresas.feature:Cenário: Criar empresa com dados válidos

describe('CreateEmpresaDto', () => {
  const validateDto = async (data: any) => {
    const dto = plainToInstance(CreateEmpresaDto, data);
    const errors = await validate(dto);
    return errors.map((e) => ({
      property: e.property,
      constraints: e.constraints,
    }));
  };

  it('deve aceitar payload válido (nome + responsavelId)', async () => {
    const errors = await validateDto({
      nome: 'Minha Empresa',
      responsavelId: 1,
    });
    expect(errors).toHaveLength(0);
  });

  it('deve aceitar payload com descricao opcional', async () => {
    const errors = await validateDto({
      nome: 'Minha Empresa',
      responsavelId: 1,
      descricao: 'Tecnologia',
    });
    expect(errors).toHaveLength(0);
  });

  it('deve rejeitar nome vazio', async () => {
    const errors = await validateDto({ nome: '', responsavelId: 1 });
    expect(errors[0].property).toBe('nome');
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('deve rejeitar nome não-string', async () => {
    const errors = await validateDto({ nome: 123, responsavelId: 1 });
    expect(errors[0].property).toBe('nome');
    expect(errors[0].constraints).toHaveProperty('isString');
  });

  it('deve rejeitar nome ausente', async () => {
    const errors = await validateDto({ responsavelId: 1 });
    expect(errors[0].property).toBe('nome');
  });

  it('deve rejeitar responsavelId não-inteiro', async () => {
    const errors = await validateDto({ nome: 'Empresa', responsavelId: 'abc' });
    expect(errors[0].property).toBe('responsavelId');
    expect(errors[0].constraints).toHaveProperty('isInt');
  });

  it('deve rejeitar responsavelId ausente', async () => {
    const errors = await validateDto({ nome: 'Empresa' });
    expect(errors[0].property).toBe('responsavelId');
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('deve rejeitar descricao não-string quando fornecida', async () => {
    const errors = await validateDto({
      nome: 'Empresa',
      responsavelId: 1,
      descricao: 999,
    });
    expect(errors[0].property).toBe('descricao');
    expect(errors[0].constraints).toHaveProperty('isString');
  });
});
