import { PaginationDto } from './pagination.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('PaginationDto', () => {
  it('deve aplicar valores padrão quando nenhum valor for fornecido', async () => {
    const dto = plainToInstance(PaginationDto, {});
    const errors = await validate(dto);

    expect(errors.length).toBe(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(10);
  });

  it('deve usar os valores fornecidos quando forem válidos', async () => {
    const dto = plainToInstance(PaginationDto, { page: 2, limit: 5 });
    const errors = await validate(dto);

    expect(errors.length).toBe(0);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(5);
  });

  it('deve converter números em string para números reais', async () => {
    const dto = plainToInstance(PaginationDto, { page: '3', limit: '15' });
    const errors = await validate(dto);

    expect(errors.length).toBe(0);
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(15);
  });

  it('deve retornar erros de validação para página inválida', async () => {
    const dto = plainToInstance(PaginationDto, { page: 0 });
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('page');
    expect(errors[0].constraints).toHaveProperty('min');
  });

  it('deve retornar erros de validação para limite inválido', async () => {
    const dto = plainToInstance(PaginationDto, { limit: 0 });
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('limit');
    expect(errors[0].constraints).toHaveProperty('min');
  });
});
