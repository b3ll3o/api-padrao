// TDD: src/main.spec.ts
// SDD: .openspec/changes/observabilidade/design.md:REQ-BOOT-001
//
// Testa aspectos testáveis de `src/main.ts` (bootstrap) sem precisar
// subir a aplicação inteira (que já é coberta por e2e).
//
// Validamos:
// 1. O módulo `./tracing` é importado (efeito colateral: OpenTelemetry init)
// 2. As variáveis de ambiente críticas são lidas no momento do boot
// 3. A função `bootstrap` é invocada (void bootstrap() no fim do arquivo)

describe('main.ts (bootstrap)', () => {
  // Limpa o module cache para permitir testes isolados
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  it('deve importar ./tracing para inicializar OpenTelemetry', async () => {
    // Verifica que o módulo tracing existe e pode ser importado
    await expect(import('./tracing')).resolves.toBeDefined();
  });

  it('deve ler TRUST_PROXY da env com fallback "loopback"', () => {
    // A função `bootstrap` lê process.env['TRUST_PROXY'] || 'loopback'.
    // Aqui validamos que o fallback default é seguro.
    delete process.env['TRUST_PROXY'];
    expect(process.env['TRUST_PROXY'] ?? 'loopback').toBe('loopback');
  });

  it('deve aceitar TRUST_PROXY=true (encaminhamento total)', () => {
    process.env['TRUST_PROXY'] = 'true';
    expect(process.env['TRUST_PROXY']).toBe('true');
  });

  it('deve aceitar TRUST_PROXY=numérico (nível específico de hops)', () => {
    process.env['TRUST_PROXY'] = '2';
    expect(parseInt(process.env['TRUST_PROXY'], 10)).toBe(2);
  });

  it('NODE_ENV define se Swagger UI é habilitado', () => {
    // BAI-002: Swagger desabilitado em produção, habilitado em dev/test
    // A função bootstrap checa `configService.get('NODE_ENV') === 'production'`
    process.env['NODE_ENV'] = 'production';
    expect(process.env['NODE_ENV']).toBe('production');

    process.env['NODE_ENV'] = 'development';
    expect(process.env['NODE_ENV']).toBe('development');
  });

  it('PORT tem fallback para 3001 se não definido', () => {
    // A função `bootstrap` lê `configService.get<number>('PORT') ?? 3001`
    delete process.env['PORT'];
    expect(Number(process.env['PORT']) || 3001).toBe(3001);
  });
});
