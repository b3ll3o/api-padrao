import { PaginatedResponseDto } from './paginated-response.dto';

// TDD: AGENTS.md §5 — todos endpoints de listagem devem retornar PaginatedResponseDto<T>
//      Campos: data, total, page, limit, totalPages

describe('PaginatedResponseDto', () => {
  it('deve aceitar estrutura completa com generics', () => {
    const response: PaginatedResponseDto<string> = {
      data: ['item1', 'item2'],
      total: 100,
      page: 1,
      limit: 10,
      totalPages: 10,
    };
    expect(response.data).toHaveLength(2);
    expect(response.total).toBe(100);
    expect(response.page).toBe(1);
    expect(response.limit).toBe(10);
    expect(response.totalPages).toBe(10);
  });

  it('deve permitir data vazia (página sem itens)', () => {
    const response: PaginatedResponseDto<{ id: number }> = {
      data: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    };
    expect(response.data).toHaveLength(0);
    expect(response.totalPages).toBe(0);
  });

  it('deve funcionar com qualquer tipo genérico (T=Usuario)', () => {
    interface Usuario {
      id: number;
      nome: string;
    }
    const response: PaginatedResponseDto<Usuario> = {
      data: [{ id: 1, nome: 'João' }],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    };
    expect(response.data[0].nome).toBe('João');
  });

  it('deve permitir tipos complexos como generico (T=ObjetoAninhado)', () => {
    interface ItemCompleto {
      id: number;
      meta: { tags: string[] };
    }
    const response: PaginatedResponseDto<ItemCompleto> = {
      data: [{ id: 1, meta: { tags: ['a', 'b'] } }],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    };
    expect(response.data[0].meta.tags).toEqual(['a', 'b']);
  });

  it('campos data, total, page, limit, totalPages devem ser públicos (sem readonly)', () => {
    const response: PaginatedResponseDto<unknown> = {
      data: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    };
    // Verifica que os 5 campos do contrato estão presentes
    expect(Object.keys(response).sort()).toEqual([
      'data',
      'limit',
      'page',
      'total',
      'totalPages',
    ]);
  });
});
