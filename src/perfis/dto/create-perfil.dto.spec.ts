import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePerfilDto } from './create-perfil.dto';

// TDD: features/perfis.feature:Cenário: Criar perfil com dados válidos
// REQ-PERFIL-001: persistir Perfil escopado por empresaId
// REQ-PERFIL-003: validar campos obrigatórios (nome, codigo, descricao, empresaId)
// REQ-PERFIL-004: permitir criar Perfil sem permissoesIds (array vazio)

describe('CreatePerfilDto', () => {
  const validateDto = async (data: any) => {
    const dto = plainToInstance(CreatePerfilDto, data);
    const errors = await validate(dto);
    return errors.map((e) => ({
      property: e.property,
      constraints: e.constraints,
    }));
  };

  it('deve aceitar payload válido (nome + codigo + descricao + empresaId)', async () => {
    const errors = await validateDto({
      nome: 'Admin',
      codigo: 'ADMIN',
      descricao: 'Administrador',
      empresaId: 'uuid-empresa',
    });
    expect(errors).toHaveLength(0);
  });

  it('deve aceitar permissoesIds como array de números', async () => {
    const errors = await validateDto({
      nome: 'Admin',
      codigo: 'ADMIN',
      descricao: 'Administrador',
      empresaId: 'uuid-empresa',
      permissoesIds: [1, 2, 3],
    });
    expect(errors).toHaveLength(0);
  });

  it('deve rejeitar nome vazio', async () => {
    const errors = await validateDto({
      nome: '',
      codigo: 'X',
      descricao: 'd',
      empresaId: 'uuid',
    });
    expect(errors[0].property).toBe('nome');
  });

  it('deve rejeitar nome não-string', async () => {
    const errors = await validateDto({
      nome: 123,
      codigo: 'X',
      descricao: 'd',
      empresaId: 'uuid',
    });
    expect(errors[0].property).toBe('nome');
  });

  it('deve rejeitar codigo vazio', async () => {
    const errors = await validateDto({
      nome: 'Admin',
      codigo: '',
      descricao: 'd',
      empresaId: 'uuid',
    });
    expect(errors[0].property).toBe('codigo');
  });

  it('deve rejeitar descricao vazia', async () => {
    const errors = await validateDto({
      nome: 'Admin',
      codigo: 'ADMIN',
      descricao: '',
      empresaId: 'uuid',
    });
    expect(errors[0].property).toBe('descricao');
  });

  it('deve rejeitar empresaId vazio', async () => {
    const errors = await validateDto({
      nome: 'Admin',
      codigo: 'ADMIN',
      descricao: 'd',
      empresaId: '',
    });
    expect(errors[0].property).toBe('empresaId');
  });

  it('deve rejeitar permissoesIds com itens não-numéricos', async () => {
    const errors = await validateDto({
      nome: 'Admin',
      codigo: 'ADMIN',
      descricao: 'd',
      empresaId: 'uuid',
      permissoesIds: ['a', 'b'],
    });
    expect(errors[0].property).toBe('permissoesIds');
  });

  it('deve rejeitar todos os campos obrigatórios ausentes', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(4);
  });
});
