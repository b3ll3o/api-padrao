import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddUsuarioEmpresaDto } from './add-usuario-empresa.dto';

// TDD: features/empresas.feature:Cenário: Vincular usuário a empresa com perfis

describe('AddUsuarioEmpresaDto', () => {
  const validateDto = async (data: any) => {
    const dto = plainToInstance(AddUsuarioEmpresaDto, data);
    const errors = await validate(dto);
    return errors.map((e) => ({
      property: e.property,
      constraints: e.constraints,
    }));
  };

  it('deve aceitar payload válido (usuarioId + array de perfilIds)', async () => {
    const errors = await validateDto({ usuarioId: 1, perfilIds: [1, 2] });
    expect(errors).toHaveLength(0);
  });

  it('deve rejeitar usuarioId não-inteiro', async () => {
    const errors = await validateDto({ usuarioId: 'abc', perfilIds: [1] });
    expect(errors[0].property).toBe('usuarioId');
    expect(errors[0].constraints).toHaveProperty('isInt');
  });

  it('deve rejeitar usuarioId ausente', async () => {
    const errors = await validateDto({ perfilIds: [1] });
    expect(errors[0].property).toBe('usuarioId');
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('deve rejeitar perfilIds não-array', async () => {
    const errors = await validateDto({ usuarioId: 1, perfilIds: '1,2,3' });
    expect(errors[0].property).toBe('perfilIds');
    expect(errors[0].constraints).toHaveProperty('isArray');
  });

  it('deve aceitar perfilIds vazio (sem @ArrayNotEmpty no DTO; regra de negócio no service)', async () => {
    // NOTA: @IsNotEmpty no DTO não bloqueia arrays vazios (apenas strings/values vazios).
    // Se a regra for "perfilIds não pode ser vazio", considerar @ArrayNotEmpty.
    // Hoje a validação de array vazio é responsabilidade do service/regras de negócio.
    const errors = await validateDto({ usuarioId: 1, perfilIds: [] });
    expect(errors).toHaveLength(0);
  });

  it('deve rejeitar perfilIds com itens não-inteiros', async () => {
    const errors = await validateDto({
      usuarioId: 1,
      perfilIds: [1, 'abc', 3],
    });
    expect(errors[0].property).toBe('perfilIds');
    // erro de cada item é reportado no constraints
    expect(errors[0].constraints).toBeDefined();
    // class-validator reporta o erro como "isInt" para o item inválido
    expect(Object.keys(errors[0].constraints ?? {})).toContain('isInt');
  });

  it('deve rejeitar perfilIds ausente', async () => {
    const errors = await validateDto({ usuarioId: 1 });
    expect(errors[0].property).toBe('perfilIds');
  });
});
