import { Logger } from '@nestjs/common';
import { EmpresaContext } from './empresa-context.service';
import { contextStorage } from './context.storage';

const VALID_UUID_V4 = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_V4_2 = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

describe('EmpresaContext', () => {
  let context: EmpresaContext;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    context = new EmpresaContext();
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('deve ser definido', () => {
    expect(context).toBeInstanceOf(EmpresaContext);
  });

  it('deve permitir setar e recuperar o empresaId', () => {
    contextStorage.run({}, () => {
      context.empresaId = VALID_UUID_V4;
      expect(context.empresaId).toBe(VALID_UUID_V4);
    });
  });

  it('deve lançar erro ao acessar empresaId não definido', () => {
    contextStorage.run({}, () => {
      expect(() => context.empresaId).toThrow(
        'Contexto de empresa não definido',
      );
    });
  });

  it('deve permitir setar e recuperar o usuarioId', () => {
    contextStorage.run({}, () => {
      const id = 123;
      context.usuarioId = id;
      expect(context.usuarioId).toBe(id);
    });
  });

  it('deve lançar erro ao acessar usuarioId não definido', () => {
    contextStorage.run({}, () => {
      expect(() => context.usuarioId).toThrow(
        'Contexto de usuário não definido',
      );
    });
  });

  it('deve retornar verdadeiro se possuir empresaId', () => {
    contextStorage.run({}, () => {
      expect(context.possuiEmpresa()).toBe(false);
      context.empresaId = VALID_UUID_V4;
      expect(context.possuiEmpresa()).toBe(true);
    });
  });

  describe('validação UUID v4 no setter empresaId', () => {
    it('deve aceitar UUID v4 válido (lowercase)', () => {
      contextStorage.run({}, () => {
        context.empresaId = VALID_UUID_V4;
        expect(context.empresaId).toBe(VALID_UUID_V4);
        expect(warnSpy).not.toHaveBeenCalled();
      });
    });

    it('deve aceitar UUID v4 válido (uppercase)', () => {
      contextStorage.run({}, () => {
        const upper = VALID_UUID_V4.toUpperCase();
        context.empresaId = upper;
        expect(context.empresaId).toBe(upper);
        expect(warnSpy).not.toHaveBeenCalled();
      });
    });

    it('deve aceitar dois UUIDs v4 distintos sequencialmente', () => {
      contextStorage.run({}, () => {
        context.empresaId = VALID_UUID_V4;
        expect(context.empresaId).toBe(VALID_UUID_V4);
        context.empresaId = VALID_UUID_V4_2;
        expect(context.empresaId).toBe(VALID_UUID_V4_2);
      });
    });

    it('deve aceitar string vazia (rotas públicas) sem warning', () => {
      contextStorage.run({}, () => {
        context.empresaId = VALID_UUID_V4;
        context.empresaId = '';
        expect(warnSpy).not.toHaveBeenCalled();
      });
    });

    it('deve aceitar undefined (clear de contexto) sem warning', () => {
      contextStorage.run({}, () => {
        context.empresaId = VALID_UUID_V4;
        context.empresaId = undefined;
        expect(warnSpy).not.toHaveBeenCalled();
        expect(context.possuiEmpresa()).toBe(false);
      });
    });

    it('deve rejeitar UUID v3 (versão incorreta) com warn', () => {
      // UUID v3 começa com '3' no terceiro grupo (version nibble = 3)
      const uuidV3 = '3b241101-e2bb-3255-8caf-4136c566a962';
      contextStorage.run({}, () => {
        context.empresaId = VALID_UUID_V4;
        context.empresaId = uuidV3;
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0][0]).toContain('empresaId inválido');
        // Valor anterior preservado (não foi sobrescrito)
        expect(context.empresaId).toBe(VALID_UUID_V4);
      });
    });

    it('deve rejeitar UUID v1 (versão incorreta) com warn', () => {
      // UUID v1 começa com '1' no terceiro grupo
      const uuidV1 = 'c232ab00-9414-11ec-b909-0242ac120002';
      contextStorage.run({}, () => {
        context.empresaId = VALID_UUID_V4;
        context.empresaId = uuidV1;
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(context.empresaId).toBe(VALID_UUID_V4);
      });
    });

    it('deve rejeitar UUID v4 com variant byte inválido (não-8/9/a/b) com warn', () => {
      // Variant nibble deve ser 8, 9, a ou b — 'c' é inválido
      const badVariant = '550e8400-e29b-41d4-c716-446655440000';
      contextStorage.run({}, () => {
        context.empresaId = VALID_UUID_V4;
        context.empresaId = badVariant;
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(context.empresaId).toBe(VALID_UUID_V4);
      });
    });

    it('deve rejeitar string malformada com caracteres especiais', () => {
      contextStorage.run({}, () => {
        context.empresaId = VALID_UUID_V4;
        context.empresaId = 'not-a-uuid@with!special#chars';
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(context.empresaId).toBe(VALID_UUID_V4);
      });
    });

    it('deve rejeitar UUID sem hifens (formato não canônico)', () => {
      const noHyphens = '550e8400e29b41d4a716446655440000';
      contextStorage.run({}, () => {
        context.empresaId = VALID_UUID_V4;
        context.empresaId = noHyphens;
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(context.empresaId).toBe(VALID_UUID_V4);
      });
    });

    it('deve rejeitar UUID com tamanho incorreto', () => {
      const tooShort = '550e8400-e29b-41d4-a716-44665544000';
      contextStorage.run({}, () => {
        context.empresaId = VALID_UUID_V4;
        context.empresaId = tooShort;
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(context.empresaId).toBe(VALID_UUID_V4);
      });
    });

    it('deve rejeitar UUID contendo caracteres não-hex (g-z)', () => {
      const nonHex = 'zzzzzzzz-zzzz-4zzz-azzz-zzzzzzzzzzzz';
      contextStorage.run({}, () => {
        context.empresaId = VALID_UUID_V4;
        context.empresaId = nonHex;
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(context.empresaId).toBe(VALID_UUID_V4);
      });
    });
  });
});
