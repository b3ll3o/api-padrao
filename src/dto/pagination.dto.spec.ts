import { PaginationDto } from './pagination.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('PaginationDto', () => {
  it('should apply default values when no values are provided', async () => {
    const dto = plainToInstance(PaginationDto, {});
    const errors = await validate(dto);

    expect(errors.length).toBe(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(10);
  });

  it('should use provided values when they are valid', async () => {
    const dto = plainToInstance(PaginationDto, { page: 2, limit: 5 });
    const errors = await validate(dto);

    expect(errors.length).toBe(0);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(5);
  });

  it('should convert string numbers to actual numbers', async () => {
    const dto = plainToInstance(PaginationDto, { page: '3', limit: '15' });
    const errors = await validate(dto);

    expect(errors.length).toBe(0);
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(15);
  });

  it('should return validation errors for invalid page', async () => {
    const dto = plainToInstance(PaginationDto, { page: 0 });
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('page');
    expect(errors[0].constraints).toHaveProperty('min');
  });

  it('should return validation errors for invalid limit', async () => {
    const dto = plainToInstance(PaginationDto, { limit: 0 });
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('limit');
    expect(errors[0].constraints).toHaveProperty('min');
  });
});
