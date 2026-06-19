// BDD: features/email-notifications.feature:Cenário: Aplicação não sobe se template obrigatório está ausente
// BDD: features/email-notifications.feature:Cenário: Rodapé LGPD presente em todos os 5 templates
// SDD: .openspec/changes/email-notifications/design.md:REQ-EM-08, REQ-EM-N04
// ATDD: test/email-notifications.e2e-spec.ts:TemplateLoaderService (boot) > AC-EM-07 + AC-EM-12
// TDD: cobertura do TemplateLoaderService
import { ConfigService } from '@nestjs/config';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { TemplateLoaderService } from './template-loader.service';

describe('TemplateLoaderService (REQ-EM-08, REQ-EM-N04)', () => {
  let tempDir: string;
  let loader: TemplateLoaderService;

  const makeConfig = (dir: string) =>
    ({
      get: jest.fn((key: string) => (key === 'TEMPLATES_DIR' ? dir : null)),
    }) as unknown as ConfigService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tpl-'));
    loader = new TemplateLoaderService(makeConfig(tempDir));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('deve ser definido', () => {
    expect(loader).toBeInstanceOf(TemplateLoaderService);
  });

  // REQ-EM-08
  it('loadAll deve carregar todos os arquivos .tpl do diretório', () => {
    writeFileSync(
      join(tempDir, 'auth.password_reset.tpl'),
      `Subject: Reset - {{APP_NAME}}

Body: Olá {{nome}}! Para descadastro acesse {{APP_LOGIN_URL}}/x. dpo@app`,
    );
    const map = loader.loadAll();
    expect(map.size).toBe(1);
    expect(map.get('auth.password_reset')?.subject).toBe(
      'Reset - {{APP_NAME}}',
    );
    expect(map.get('auth.password_reset')?.body).toContain('{{nome}}');
  });

  // REQ-EM-08
  it('loadAll deve fazer parse de subject/body no formato esperado', () => {
    writeFileSync(
      join(tempDir, 'a.tpl'),
      `Subject: Hello

Body: World {{x}}. Para descadastro, x. dpo@y`,
    );
    const map = loader.loadAll();
    expect(map.get('a')?.subject).toBe('Hello');
    expect(map.get('a')?.body).toMatch(/World \{\{x\}\}/);
  });

  // REQ-EM-08
  it('loadAll deve lançar erro se template está malformado (sem Subject: ou Body:)', () => {
    writeFileSync(join(tempDir, 'x.tpl'), 'apenas texto sem marcadores');
    expect(() => loader.loadAll()).toThrow(/malformado|formato/i);
  });

  // REQ-EM-08
  it('loadAll deve lançar erro se diretório não existe', () => {
    const missingLoader = new TemplateLoaderService(
      makeConfig('/nao/existe/v1'),
    );
    expect(() => missingLoader.loadAll()).toThrow();
  });

  // REQ-EM-N04
  it('loadAll deve aceitar template com rodapé LGPD válido (descadastro + dpo@)', () => {
    writeFileSync(
      join(tempDir, 'a.tpl'),
      `Subject: A

Body: Olá! Para descadastro, clique aqui. dpo@app`,
    );
    expect(() => loader.loadAll()).not.toThrow();
  });

  // REQ-EM-N04
  it('loadAll deve lançar erro se template não tem "descadastro" no body', () => {
    writeFileSync(
      join(tempDir, 'a.tpl'),
      `Subject: A

Body: Olá! dpo@app`,
    );
    expect(() => loader.loadAll()).toThrow(/descadastro/i);
  });

  // REQ-EM-N04
  it('loadAll deve lançar erro se template não tem "dpo@" no body', () => {
    writeFileSync(
      join(tempDir, 'a.tpl'),
      `Subject: A

Body: Olá! Para descadastro.`,
    );
    expect(() => loader.loadAll()).toThrow(/dpo@/i);
  });

  it('get deve retornar template do cache por templateId', () => {
    writeFileSync(
      join(tempDir, 'a.tpl'),
      `Subject: A-Subject

Body: Olá! descadastro. dpo@x`,
    );
    loader.loadAll();
    const template = loader.get('a');
    expect(template?.templateId).toBe('a');
    expect(template?.subject).toBe('A-Subject');
    expect(template?.body).toMatch(/dpo@/i);
  });

  it('get deve retornar undefined para templateId desconhecido', () => {
    writeFileSync(
      join(tempDir, 'a.tpl'),
      `Subject: A

Body: Olá! descadastro. dpo@x`,
    );
    loader.loadAll();
    expect(loader.get('nao_existe')).toBeUndefined();
  });

  it('list deve retornar templateIds carregados', () => {
    writeFileSync(
      join(tempDir, 'a.tpl'),
      `Subject: A

Body: Olá! descadastro. dpo@x`,
    );
    writeFileSync(
      join(tempDir, 'b.tpl'),
      `Subject: B

Body: Olá! descadastro. dpo@y`,
    );
    loader.loadAll();
    const ids = loader.list();
    expect(ids).toEqual(expect.arrayContaining(['a', 'b']));
    expect(ids).toHaveLength(2);
  });
});
