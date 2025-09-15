import { TemPermissao, PERMISSAO_KEY } from './temPermissao.decorator';
import { Controller, Get } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';

describe('TemPermissao Decorator', () => {
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [Reflector],
    }).compile();

    reflector = module.get<Reflector>(Reflector);
  });

  it('deve definir e recuperar um único código de permissão', () => {
    const permission = 'admin';

    @Controller()
    class TestController {
      @TemPermissao(permission)
      @Get('test')
      testMethod() {}
    }

    const metadata = reflector.get<string>(
      PERMISSAO_KEY,
      TestController.prototype.testMethod,
    );
    expect(metadata).toBe(permission);
  });

  it('deve definir e recuperar um array de códigos de permissão', () => {
    const permissions = ['admin', 'user'];

    @Controller()
    class TestController {
      @TemPermissao(permissions)
      @Get('test')
      testMethod() {}
    }

    const metadata = reflector.get<string[]>(
      PERMISSAO_KEY,
      TestController.prototype.testMethod,
    );
    expect(metadata).toEqual(permissions);
  });

  it('deve expor a constante PERMISSAO_KEY', () => {
    expect(PERMISSAO_KEY).toBe('permissao');
  });
});
