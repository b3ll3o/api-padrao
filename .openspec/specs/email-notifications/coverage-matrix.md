# Coverage Matrix + TDD Plan — email-notifications

> **Status inicial**: 🔴 (Red Phase) — testes planejados, **não escritos**.
> Após TDD Green Phase, mudar para 🟢 e marcar `npm run test` verde.
>
> **Gerado por**: `analista-qualidade` em 2026-06-16.
> **Source**: `.openspec/changes/email-notifications/{design,tasks}.md` (10 REQ + 6 NFR).

## Legenda

- **🔴** Red Phase — teste ainda não escrito OU falha de propósito
- **🟡** Em revisão — teste escrito, aguardando TDD Green
- **🟢** Green Phase — teste passa
- **REQ-F** = Requisito Funcional; **REQ-NF** = Requisito Não-Funcional

## Matriz de Rastreabilidade (RTM)

| REQ | Descrição resumida | BDD Scenario | ATDD Test | TDD Spec | Status |
|-----|-------------------|--------------|-----------|----------|--------|
| REQ-EM-01 | `POST /auth/forgot-password` → `auth.password_reset` | `email-notifications.feature:Cenário: E-mail de recuperação de senha continua sendo enviado via template auth.password_reset` | `test/email-notifications.e2e-spec.ts:POST /auth/forgot-password > AC-EM-04` | `src/auth/application/services/password-recovery.service.spec.ts:forgotPassword > deve chamar emailSenderService.send('auth.password_reset', ...)` | 🔴 |
| REQ-EM-02 | `POST /usuarios` → `usuarios.welcome` | `email-notifications.feature:Cenário: E-mail de boas-vindas enviado ao criar usuário` | `test/email-notifications.e2e-spec.ts:POST /usuarios > AC-EM-01` | `src/usuarios/application/services/usuarios.service.spec.ts:create > deve chamar emailSenderService.send('usuarios.welcome', ...) após repository.create` | 🔴 |
| REQ-EM-03 | `POST /auth/reset-password` → `usuarios.password_changed` | `email-notifications.feature:Cenário: E-mail de confirmação enviado após reset de senha` | `test/email-notifications.e2e-spec.ts:POST /auth/reset-password > AC-EM-03` | `src/auth/application/services/password-recovery.service.spec.ts:resetPassword > deve chamar emailSenderService.send('usuarios.password_changed', ...) após unitOfWork.execute` | 🔴 |
| REQ-EM-04 | `POST /empresas/:id/usuarios` → `empresas.user_added` (perfis resolvidos) | `email-notifications.feature:Cenário: E-mail de vínculo a empresa lista os perfis atribuídos` | `test/email-notifications.e2e-spec.ts:POST /empresas/:id/usuarios > AC-EM-02` | `src/empresas/application/services/empresas.service.spec.ts:addUser > deve resolver nomes dos perfis via perfilRepository.findMany e chamar emailSender.send` | 🔴 |
| REQ-EM-05 | `PATCH /usuarios/:id` (ativo:false) → `usuarios.account_disabled` (SHOULD) | `email-notifications.feature:Cenário: E-mail de desativação enviado quando usuário é desativado` | `test/email-notifications.e2e-spec.ts:PATCH /usuarios/:id > AC-EM-05` | `src/usuarios/application/services/usuarios.service.spec.ts:update (ativo=true→false) > deve chamar emailSenderService.send('usuarios.account_disabled', ...)` | 🔴 |
| REQ-EM-06 | Anti-enumeração no `forgot-password` preservada | `email-notifications.feature:Cenário: E-mail de recuperação preserva anti-enumeração` | `test/email-notifications.e2e-spec.ts:POST /auth/forgot-password > AC-EM-04b` | `src/auth/application/services/password-recovery.service.spec.ts:forgotPassword > deve retornar void sem chamar emailSender para e-mail inexistente` | 🔴 |
| REQ-EM-07 | Envio **não bloqueia** a request (try/catch + warn) | `email-notifications.feature:Cenário: Falha no envio NÃO bloqueia a request` | `test/email-notifications.e2e-spec.ts:POST /usuarios > AC-EM-06` | `src/shared/application/services/email-sender.service.spec.ts:send > deve capturar erro do emailService, logar warn e retornar void sem throw` | 🔴 |
| REQ-EM-08 | Templates versionados em `v1/*.tpl` carregados no boot (fail-fast) | `email-notifications.feature:Cenário: Aplicação não sobe se template obrigatório está ausente` | `test/email-notifications.e2e-spec.ts:TemplateLoaderService (boot) > AC-EM-07` | `src/shared/infrastructure/services/template-loader.service.spec.ts:loadAll > deve carregar todos os templates v1/*.tpl; template ausente → throw` | 🔴 |
| REQ-EM-09 | Renderer substitui `{{var}}` por valores; injeta `{{APP_NAME}}`, `{{APP_LOGIN_URL}}`, `{{ano_atual}}` | `email-notifications.feature:Cenário: Renderer de template substitui placeholders corretamente` + `Cenário: Renderer lança erro se placeholder obrigatório está ausente` | `test/email-notifications.e2e-spec.ts:EmailSenderService (orquestrador) > AC-EM-08+` + `AC-EM-08` | `src/shared/application/services/email-sender.service.spec.ts:send > deve substituir placeholders; placeholder faltando → throw; deve injetar APP_NAME/APP_LOGIN_URL/ano_atual` | 🔴 |
| REQ-EM-10 | `templateId` validado por regex `^[a-z0-9_]+$` + whitelist `KNOWN_TEMPLATES` (no-op + warn) | `email-notifications.feature:Cenário: templateId inválido é rejeitado e logado` + `Cenário: templateId fora da whitelist é rejeitado e logado` | `test/email-notifications.e2e-spec.ts:EmailSenderService (orquestrador) > AC-EM-09` + `AC-EM-10` | `src/shared/application/services/email-sender.service.spec.ts:send > deve fazer no-op e logar warn para templateId com caracteres inválidos / templateId não em KNOWN_TEMPLATES` | 🔴 |
| REQ-EM-N01 | Latência p95 do envio síncrono ≤ 50ms (mock) | (implícito — NFR verificado no ATDD) | `test/email-notifications.e2e-spec.ts:EmailSenderService (orquestrador) > AC-EM-08+` (assertiva de tempo total) | `src/shared/application/services/email-sender.service.spec.ts:send > deve completar em ≤ 50ms (mock)` | 🔴 |
| REQ-EM-N02 | `LoggerEmailService` NÃO loga `body` em `NODE_ENV=production` | `email-notifications.feature:Cenário: LoggerEmailService NÃO loga body em NODE_ENV=production` | `test/email-notifications.e2e-spec.ts:LoggerEmailService (adapter Pino) > AC-EM-11` | `src/shared/infrastructure/services/logger-email.service.spec.ts:send > NÃO deve logar body em production` | 🔴 |
| REQ-EM-N03 | DIP estrito — services de feature só conhecem `EmailSenderService` (nunca `EmailService`) | (implícito — verificado por inspeção) | (N/A — refactor) | `src/shared/infrastructure/services/logger-email.service.spec.ts:send > smoke test do adapter` | 🔴 |
| REQ-EM-N04 | Rodapé LGPD (`descadastro` + `dpo@`) em todos os 5 templates | `email-notifications.feature:Cenário: Rodapé LGPD presente em todos os 5 templates` | `test/email-notifications.e2e-spec.ts:TemplateLoaderService (boot) > AC-EM-12` | `src/shared/infrastructure/services/template-loader.service.spec.ts:loadAll > deve validar rodapé LGPD em todos os templates` | 🔴 |
| REQ-EM-N05 | Cobertura Jest ≥ 80% em todas as métricas (transversal) | (transversal) | `npm run test:cov` (≥ 80% global) | (transversal) | 🔴 |
| REQ-EM-N06 | Métrica OTel `email_sent_total` com label `template`+`status` | (implícito) | `test/email-notifications.e2e-spec.ts:EmailSenderService (orquestrador) > AC-EM-08+` (verificar span OTel) | `src/shared/application/services/email-sender.service.spec.ts:send > deve incrementar counter via OTel meter` | 🔴 |

**Total**: 16 REQ/NFR (10 funcionais + 6 não-funcionais). 100% rastreáveis.

---

## TDD Plan — Especificação de Testes Unitários

> **REGRA**: cada teste abaixo é escrito **antes** da implementação (Red Phase).
> Implementação TDD = Red → Green → Refactor.
> Padrão: `it('deve X quando Y', ...)`, idioma **pt-BR**, com comentários `// BDD:` / `// SDD:` / `// ATDD:`.

### Arquivo 1: `src/shared/infrastructure/services/logger-email.service.spec.ts` (existente — complementar)

> **Status**: arquivo já existe com 2 testes básicos (em `src/auth/infrastructure/services/`).
> Após refactor (Phase 2 do `tasks.md`), o spec é movido para `src/shared/infrastructure/services/`.
> Cobertura adicional necessária:

```typescript
// BDD: features/email-notifications.feature:LoggerEmailService NÃO loga body em NODE_ENV=production
// SDD: .openspec/changes/email-notifications/design.md:REQ-EM-N02
// ATDD: test/email-notifications.e2e-spec.ts:LoggerEmailService (adapter Pino) > AC-EM-11
describe('LoggerEmailService (REQ-EM-N02)', () => {
  let service: LoggerEmailService;
  let logSpy: jest.SpyInstance;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    service = new LoggerEmailService();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    originalNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    logSpy.mockRestore();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('deve logar to, subject e body em development', async () => {
    process.env.NODE_ENV = 'development';
    await service.send({ to: 'a@b.c', subject: 's', body: 'body' });
    const calls = logSpy.mock.calls.flat().map(String).join(' ');
    expect(calls).toContain('a@b.c');
    expect(calls).toContain('s');
    expect(calls).toContain('body');
  });

  it('NÃO deve logar body em production (apenas to + subject)', async () => {
    process.env.NODE_ENV = 'production';
    await service.send({
      to: 'user@example.com',
      subject: 'S',
      body: 'CORPO_SECRETO_TOKEN',
    });
    const calls = logSpy.mock.calls.flat().map(String).join(' ');
    expect(calls).not.toContain('CORPO_SECRETO_TOKEN');
    expect(calls).toContain('user@example.com');
    expect(calls).toContain('S');
  });

  it('NÃO deve logar body em test (semelhante a production por default)', async () => {
    process.env.NODE_ENV = 'test';
    await service.send({ to: 'a@b.c', subject: 's', body: 'SECRET' });
    const calls = logSpy.mock.calls.flat().map(String).join(' ');
    // Em test, body PODE ser logado (DX) — mas NUNCA dados sensíveis.
    // Documentado: tokens, senhas e PII nunca devem aparecer no body.
    expect(calls).not.toContain('SECRET');
  });

  it('deve aceitar EmailMessage com todos os campos opcionais ausentes sem crash', async () => {
    process.env.NODE_ENV = 'test';
    await expect(
      service.send({ to: 'a@b.c', subject: '', body: '' }),
    ).resolves.toBeUndefined();
  });
});
```

### Arquivo 2: `src/shared/application/services/email-sender.service.spec.ts` (novo — ≥ 12 testes)

```typescript
// BDD: features/email-notifications.feature:EmailSenderService
// SDD: .openspec/changes/email-notifications/design.md:REQ-EM-07, REQ-EM-09, REQ-EM-10, REQ-EM-N01
// ATDD: test/email-notifications.e2e-spec.ts:EmailSenderService (orquestrador)
describe('EmailSenderService', () => {
  let service: DefaultEmailSenderService;
  let emailService: jest.Mocked<EmailService>;
  let templateLoader: jest.Mocked<TemplateLoaderService>;
  let configService: jest.Mocked<ConfigService>;
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  const fakeTemplate: EmailTemplate = {
    templateId: 'auth.password_reset',
    subject: 'Recuperação — {{APP_NAME}}',
    body: 'Olá {{nome}}, link: {{link}}, validade: {{validade}}. descadastro: {{APP_LOGIN_URL}}/account/unsubscribe, dpo@{{APP_NAME}}',
  };

  beforeEach(() => {
    emailService = { send: jest.fn().mockResolvedValue(undefined) };
    templateLoader = {
      loadAll: jest.fn(),
      get: jest.fn().mockReturnValue(fakeTemplate),
    };
    configService = {
      get: jest.fn((key: string) => {
        const map: Record<string, string> = {
          APP_NAME: 'API Padrão',
          APP_LOGIN_URL: 'http://localhost:3000',
        };
        return map[key];
      }),
    } as any;

    service = new DefaultEmailSenderService(
      emailService,
      templateLoader,
      configService,
    );

    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  // REQ-EM-09
  it('deve renderizar placeholders e chamar emailService.send', async () => {
    await service.send('auth.password_reset', 'a@b.c', {
      nome: 'João',
      link: 'https://...',
      validade: '1h',
    });
    expect(emailService.send).toHaveBeenCalledTimes(1);
    const [message] = emailService.send.mock.calls[0];
    expect(message.to).toBe('a@b.c');
    expect(message.subject).toContain('API Padrão');
    expect(message.body).toContain('João');
    expect(message.body).toContain('https://...');
    expect(message.body).toContain('1h');
  });

  // REQ-EM-09
  it('deve injetar automaticamente {{APP_NAME}}, {{APP_LOGIN_URL}} e {{ano_atual}}', async () => {
    await service.send('auth.password_reset', 'a@b.c', {
      nome: 'X',
      link: 'L',
      validade: 'V',
    });
    const [message] = emailService.send.mock.calls[0];
    expect(message.body).toContain('API Padrão');
    expect(message.body).toContain('http://localhost:3000/account/unsubscribe');
    expect(message.body).toMatch(new Date().getFullYear().toString());
  });

  // REQ-EM-09 (fail-fast authoring)
  it('deve lançar erro se placeholder do template está faltando em variables', async () => {
    await expect(
      service.send('auth.password_reset', 'a@b.c', {
        nome: 'X',
        link: 'L',
        // validade FALTANDO
      }),
    ).rejects.toThrow(/Placeholder \{\{validade\}\}/);
    expect(emailService.send).not.toHaveBeenCalled();
  });

  // REQ-EM-07
  it('deve capturar exceção do emailService e retornar void sem throw', async () => {
    emailService.send.mockRejectedValue(new Error('SMTP down'));
    await expect(
      service.send('auth.password_reset', 'a@b.c', {
        nome: 'X',
        link: 'L',
        validade: 'V',
      }),
    ).resolves.toBeUndefined();
    const warnCalls = warnSpy.mock.calls.flat().map(String).join(' ');
    expect(warnCalls).toMatch(/email\.failed/);
  });

  // REQ-EM-10
  it('deve fazer no-op + warn para templateId com caracteres inválidos', async () => {
    await service.send('../../etc/passwd', 'a@b.c', {});
    expect(emailService.send).not.toHaveBeenCalled();
    const warnCalls = warnSpy.mock.calls.flat().map(String).join(' ');
    expect(warnCalls).toMatch(/templateId inválido|whitelist/i);
  });

  // REQ-EM-10
  it('deve fazer no-op + warn para templateId não em KNOWN_TEMPLATES', async () => {
    await service.send('template_inexistente', 'a@b.c', {});
    expect(emailService.send).not.toHaveBeenCalled();
    const warnCalls = warnSpy.mock.calls.flat().map(String).join(' ');
    expect(warnCalls).toMatch(/template.*não.*whitelist|inválido/i);
  });

  it('deve fazer no-op quando EMAIL_NOTIFICATIONS_ENABLED=false', async () => {
    configService.get = jest.fn((key: string) => {
      if (key === 'EMAIL_NOTIFICATIONS_ENABLED') return false;
      return 'API Padrão';
    }) as any;
    await service.send('auth.password_reset', 'a@b.c', { nome: 'X', link: 'L', validade: 'V' });
    expect(emailService.send).not.toHaveBeenCalled();
  });

  it('deve validar "to" como e-mail (regex); inválido → no-op', async () => {
    await service.send('auth.password_reset', 'nao-eh-email', {
      nome: 'X',
      link: 'L',
      validade: 'V',
    });
    expect(emailService.send).not.toHaveBeenCalled();
  });

  it('deve logar evento estruturado { event: "email.sent", template, to }', async () => {
    await service.send('auth.password_reset', 'a@b.c', {
      nome: 'X',
      link: 'L',
      validade: 'V',
    });
    const logCalls = logSpy.mock.calls.flat().map(String).join(' ');
    expect(logCalls).toMatch(/email\.sent/);
    // Garante que o body NÃO aparece no log
    expect(logCalls).not.toMatch(/Olá/);
  });

  // REQ-EM-N01
  it('deve completar em ≤ 50ms (mock)', async () => {
    const start = Date.now();
    await service.send('auth.password_reset', 'a@b.c', {
      nome: 'X',
      link: 'L',
      validade: 'V',
    });
    const duration = Date.now() - start;
    expect(duration).toBeLessThanOrEqual(50);
  });

  // render interno
  it('render deve substituir {{var}} por valor de variables', () => {
    const result = (service as any).render('Olá {{nome}}!', { nome: 'João' });
    expect(result).toBe('Olá João!');
  });

  // render interno
  it('render deve filtrar valores undefined/vazios antes da substituição', () => {
    const result = (service as any).render('{{a}}-{{b}}-{{c}}', {
      a: '1',
      b: undefined,
      c: '3',
    });
    expect(result).toBe('1--3');
  });
});
```

### Arquivo 3: `src/shared/infrastructure/services/template-loader.service.spec.ts` (novo — ≥ 6 testes)

```typescript
// BDD: features/email-notifications.feature:TemplateLoaderService
// SDD: .openspec/changes/email-notifications/design.md:REQ-EM-08, REQ-EM-N04
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('TemplateLoaderService', () => {
  let tempDir: string;
  let loader: FileSystemTemplateLoaderService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tpl-'));
    loader = new FileSystemTemplateLoaderService(`${tempDir}/v1`);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('loadAll deve carregar todos os arquivos .tpl do diretório', () => {
    writeFileSync(
      join(tempDir, 'auth.password_reset.tpl'),
      'subject: Reset\n\nbody: Olá {{nome}}! descadastro em {{APP_LOGIN_URL}}. dpo@{{APP_NAME}}',
    );
    const map = loader.loadAll();
    expect(map.size).toBe(1);
    expect(map.get('auth.password_reset')?.subject).toBe('Reset');
    expect(map.get('auth.password_reset')?.body).toContain('{{nome}}');
  });

  it('loadAll deve lançar erro se arquivo está malformado (sem subject ou body)', () => {
    writeFileSync(join(tempDir, 'x.tpl'), 'apenas texto sem marcadores');
    expect(() => loader.loadAll()).toThrow(/malformado|formato/i);
  });

  // REQ-EM-08
  it('loadAll deve lançar erro se diretório não existe', () => {
    const missingLoader = new FileSystemTemplateLoaderService('/nao/existe/v1');
    expect(() => missingLoader.loadAll()).toThrow();
  });

  // REQ-EM-N04
  it('loadAll deve validar rodapé LGPD (descadastro + dpo@) em todos os templates', () => {
    writeFileSync(
      join(tempDir, 'a.tpl'),
      'subject: A\n\nbody: Olá! Para descadastro, clique aqui. dpo@app',
    );
    expect(() => loader.loadAll()).not.toThrow();
  });

  it('loadAll deve lançar erro se template não tem "descadastro"', () => {
    writeFileSync(
      join(tempDir, 'a.tpl'),
      'subject: A\n\nbody: Olá! dpo@app',
    );
    expect(() => loader.loadAll()).toThrow(/descadastro/i);
  });

  it('loadAll deve lançar erro se template não tem "dpo@"', () => {
    writeFileSync(
      join(tempDir, 'a.tpl'),
      'subject: A\n\nbody: Olá! Para descadastro.',
    );
    expect(() => loader.loadAll()).toThrow(/dpo@/i);
  });

  it('get deve retornar template do cache por templateId', () => {
    writeFileSync(
      join(tempDir, 'a.tpl'),
      'subject: A\n\nbody: Olá! descadastro. dpo@',
    );
    loader.loadAll();
    expect(loader.get('a')).toBeDefined();
  });

  it('get deve retornar undefined para templateId desconhecido', () => {
    writeFileSync(
      join(tempDir, 'a.tpl'),
      'subject: A\n\nbody: Olá! descadastro. dpo@',
    );
    loader.loadAll();
    expect(loader.get('nao_existe')).toBeUndefined();
  });
});
```

### Arquivo 4: `src/auth/application/services/password-recovery.service.spec.ts` (existente — estender)

> Adicionar 3 testes ao spec existente:

```typescript
// BDD: features/email-notifications.feature:PasswordRecoveryService
// SDD: .openspec/changes/email-notifications/design.md:REQ-EM-01, REQ-EM-03, REQ-EM-06

describe('PasswordRecoveryService (email-notifications)', () => {
  // ... setup existente, trocando o mock de EmailService por EmailSenderService ...

  it('forgotPassword: deve chamar emailSenderService.send("auth.password_reset", ...) em vez de emailService.send', async () => {
    // mock: emailSenderService.send é jest.fn().mockResolvedValue(undefined)
    // mock: usuarioRepository.findByEmail retorna usuário ativo
    // ação: await service.forgotPassword({ email: 'a@b.c' })
    // asserção: emailSenderService.send foi chamado 1x com ('auth.password_reset', 'a@b.c', { nome, link, validade })
    // asserção: emailService.send NÃO foi chamado (refactor)
  });

  it('forgotPassword: deve retornar void sem chamar emailSender para e-mail inexistente (anti-enumeração)', async () => {
    // mock: usuarioRepository.findByEmail retorna null
    // ação: await service.forgotPassword({ email: 'naoexiste@b.c' })
    // asserção: emailSenderService.send NÃO foi chamado
    // asserção: retorno é undefined
  });

  it('resetPassword: deve chamar emailSenderService.send("usuarios.password_changed", ...) após unitOfWork.execute', async () => {
    // mock: resetTokenRepository.findValidByHash retorna token válido
    // mock: unitOfWork.execute executa callback
    // mock: usuarioRepository.findOne retorna user ativo
    // ação: await service.resetPassword({ token: 'X', novaSenha: 'Y' })
    // asserção: emailSenderService.send foi chamado 1x com ('usuarios.password_changed', user.email, { nome, dataHora, ip })
    // asserção: chamada foi APÓS unitOfWork.execute (verificar ordem via mock.invocationCallOrder)
  });
});
```

### Arquivo 5: `src/usuarios/application/services/usuarios.service.spec.ts` (existente — estender)

> Adicionar 7 testes ao spec existente:

```typescript
// BDD: features/email-notifications.feature:UsuariosService
// SDD: .openspec/changes/email-notifications/design.md:REQ-EM-02, REQ-EM-05

describe('UsuariosService (email-notifications)', () => {
  // ... setup existente ...

  it('create: deve chamar emailSenderService.send("usuarios.welcome", ...) após repository.create', async () => {
    // mock: usuarioRepository.findByEmail retorna null
    // mock: usuarioRepository.create retorna user criado
    // mock: configService.get retorna 'http://localhost:3000'
    // ação: await service.create({ email: 'novo@b.c', senha: 'X' })
    // asserção: emailSenderService.send foi chamado 1x com ('usuarios.welcome', 'novo@b.c', { nome: 'novo', link: '...' })
  });

  it('create: NÃO deve chamar emailSender se repository.create lançar erro', async () => {
    // mock: usuarioRepository.create lança erro
    // asserção: emailSenderService.send NÃO foi chamado + erro propagado
  });

  it('create: NÃO deve chamar emailSender se e-mail já existe (caller lança Conflict)', async () => {
    // mock: usuarioRepository.findByEmail retorna user existente
    // asserção: ConflictException lançado + emailSenderService.send NÃO foi chamado
  });

  it('update (ativo=true→false): deve chamar emailSenderService.send("usuarios.account_disabled", ...)', async () => {
    // mock: usuarioRepository.findOne retorna user com ativo=true
    // mock: usuarioRepository.update retorna user com ativo=false
    // ação: await service.update(userId, { ativo: false })
    // asserção: emailSenderService.send foi chamado 1x com ('usuarios.account_disabled', user.email, { nome, dataHora })
  });

  it('update (ativo=false→true) restore: NÃO deve chamar emailSender', async () => {
    // asserção: emailSenderService.send NÃO foi chamado
  });

  it('update (ativo=true→true) no-op: NÃO deve chamar emailSender', async () => {
    // asserção: emailSenderService.send NÃO foi chamado
  });

  it('update (ativo=false→false) já inativo: NÃO deve chamar emailSender', async () => {
    // asserção: emailSenderService.send NÃO foi chamado
  });
});
```

### Arquivo 6: `src/empresas/application/services/empresas.service.spec.ts` (existente — estender)

> Adicionar 4 testes ao spec existente:

```typescript
// BDD: features/email-notifications.feature:EmpresasService
// SDD: .openspec/changes/email-notifications/design.md:REQ-EM-04

describe('EmpresasService (email-notifications)', () => {
  // ... setup existente ...

  it('addUser: deve resolver nomes dos perfis via perfilRepository.findMany em 1 chamada', async () => {
    // mock: perfilRepository.findMany retorna [{ id: 1, nome: 'Admin' }, { id: 2, nome: 'Operador' }]
    // asserção: perfilRepository.findMany foi chamado 1x com [1, 2]
  });

  it('addUser: deve chamar emailSenderService.send("empresas.user_added", ..., { perfis: "Admin, Operador" })', async () => {
    // mock: empresaRepository.findOne retorna empresa
    // mock: usuarioRepository.findOne retorna user
    // mock: empresaRepository.addUserToCompany retorna sucesso
    // ação: await service.addUser(empresaId, { usuarioId, perfilIds: [1, 2] })
    // asserção: emailSenderService.send foi chamado 1x com subject/body contendo 'Admin' e 'Operador' concatenados
  });

  it('addUser: NÃO deve chamar emailSender se empresaRepository.addUserToCompany falhar', async () => {
    // mock: empresaRepository.addUserToCompany lança erro
    // asserção: emailSenderService.send NÃO foi chamado
  });

  it('addUser: NÃO deve chamar emailSender se validação de perfilIds falhar (NotFoundException)', async () => {
    // mock: perfilRepository.findOne retorna null para algum perfilId
    // asserção: NotFoundException + emailSenderService.send NÃO foi chamado
  });
});
```

---

## Resumo do TDD Plan

| Arquivo | Status | Testes | REQ cobertas |
|---------|--------|--------|--------------|
| `src/shared/infrastructure/services/logger-email.service.spec.ts` | Existe (estender) | 4 | REQ-EM-N02 |
| `src/shared/application/services/email-sender.service.spec.ts` | Novo | 12 | REQ-EM-07, REQ-EM-09, REQ-EM-10, REQ-EM-N01 |
| `src/shared/infrastructure/services/template-loader.service.spec.ts` | Novo | 8 | REQ-EM-08, REQ-EM-N04 |
| `src/auth/application/services/password-recovery.service.spec.ts` | Existe (estender) | 3 | REQ-EM-01, REQ-EM-03, REQ-EM-06 |
| `src/usuarios/application/services/usuarios.service.spec.ts` | Existe (estender) | 7 | REQ-EM-02, REQ-EM-05 |
| `src/empresas/application/services/empresas.service.spec.ts` | Existe (estender) | 4 | REQ-EM-04 |
| **Total** | | **38** | **16 REQ/NFR** |

**Métrica de cobertura planejada**: 38 testes unitários + 14 testes E2E (ATDD) = 52 testes para a feature `email-notifications`.

---

## Próximos Passos (após aprovação)

1. **Phase 4 do tasks.md**: escrever os 6 arquivos de spec acima (Red Phase). Rodar `npm run test` — esperado: falhar.
2. **Phase 5 do tasks.md**: implementar `EmailSenderService`, `TemplateLoaderService` (Green Phase). Rodar `npm run test` — esperado: passar.
3. Atualizar esta matriz: 🔴 → 🟢 conforme testes ficam verdes.
4. **Phase 14 do tasks.md**: rodar `npm run validate:quick` + `npm run test:cov` — cobertura global deve permanecer ≥ 80%.
