import { Reflector } from '@nestjs/core';
import {
  IDEMPOTENT_KEY,
  Idempotent,
  IdempotentOptions,
} from './idempotent.decorator';

// TDD: REQ-CC-IDEMPOTENT-001.6 — Decorator @Idempotent() deve setar
// metadata consumida pelo IdempotencyInterceptor via Reflector.

describe('@Idempotent decorator', () => {
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
  });

  it('sem argumentos, seta metadata com ttlSeconds undefined', () => {
    class TestController {
      @Idempotent()
      handler() {}
    }
    const meta = reflector.get(
      IDEMPOTENT_KEY,
      TestController.prototype.handler,
    );
    expect(meta).toEqual({ ttlSeconds: undefined });
  });

  it('com ttlSeconds custom, propaga o valor', () => {
    class TestController {
      @Idempotent({ ttlSeconds: 3600 })
      handler() {}
    }
    const meta = reflector.get<IdempotentOptions>(
      IDEMPOTENT_KEY,
      TestController.prototype.handler,
    );
    expect(meta).toEqual({ ttlSeconds: 3600 });
  });

  it('IDEMPOTENT_KEY é "idempotent:enabled" (canônico)', () => {
    expect(IDEMPOTENT_KEY).toBe('idempotent:enabled');
  });
});
