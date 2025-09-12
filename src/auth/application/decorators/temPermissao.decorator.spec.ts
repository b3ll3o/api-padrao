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

  it('should set and retrieve a single permission code', () => {
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

  it('should set and retrieve an array of permission codes', () => {
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

  it('should expose PERMISSAO_KEY constant', () => {
    expect(PERMISSAO_KEY).toBe('permissao');
  });
});
