#!/usr/bin/env node
/**
 * Adiciona cabeçalhos de rastreabilidade BDD/SDD/ATDD/TDD aos arquivos .ts
 * do src/ que ainda não os têm. Heurística:
 *   - Diretório `src/<feature>/`           → BDD/SDD = feature correspondente
 *   - Diretório `src/shared/...`           → BDD = N/A (cross-cutting)
 *   - Arquivo `src/main.ts`                → BDD = N/A (bootstrap)
 *   - Arquivo `src/tracing.ts`             → BDD = N/A (OpenTelemetry)
 *   - Arquivo `src/prisma/...`             → BDD = N/A (infraestrutura)
 *
 * Idempotente: pula arquivos que já têm `BDD:` ou `SDD:` no cabeçalho.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = '/home/leo/Documentos/projetos/padroes/api-padrao';

// Mapeamento diretório → feature BDD/SDD
const FEATURE_MAP = {
  'src/auth': 'autenticacao',
  'src/usuarios': 'usuarios',
  'src/perfis': 'perfis',
  'src/permissoes': 'permissoes',
  'src/empresas': 'empresas',
};

// SDD: alguns diretórios têm nome diferente
const SDD_OVERRIDE = {
  'src/auth': 'auth',
  'src/usuarios': 'usuarios',
  'src/perfis': 'perfis',
  'src/permissoes': 'permissoes',
  'src/empresas': 'empresas',
};

const ATDD_MAP = {
  'src/auth': 'test/auth.e2e-spec.ts',
  'src/usuarios': 'test/usuarios.e2e-spec.ts',
  'src/perfis': 'test/perfis.e2e-spec.ts',
  'src/permissoes': 'test/permissoes.e2e-spec.ts',
  'src/empresas': 'test/empresas.e2e-spec.ts',
};

const TDD_MAP = {}; // preenchido por convenção: arquivo.spec.ts ao lado

function detectFeature(filePath) {
  for (const [prefix, feature] of Object.entries(FEATURE_MAP)) {
    if (filePath.startsWith(`${ROOT}/${prefix}/`)) return feature;
  }
  return null;
}

function buildHeader(filePath) {
  const rel = relative(ROOT, filePath);
  const feature = detectFeature(filePath);
  const sdd = feature ? SDD_OVERRIDE[Object.keys(FEATURE_MAP).find((k) => filePath.startsWith(`${ROOT}/${k}/`))] : null;
  const atdd = feature ? ATDD_MAP[Object.keys(FEATURE_MAP).find((k) => filePath.startsWith(`${ROOT}/${k}/`))] : null;
  // TDD: convenção é o mesmo nome com .spec.ts
  const tdd = rel.endsWith('.ts') ? rel.replace(/\.ts$/, '.spec.ts') : null;

  if (feature) {
    return [
      `// BDD: features/${feature}.feature`,
      `// SDD: .openspec/changes/${sdd}/design.md`,
      atdd ? `// ATDD: ${atdd}` : null,
      tdd && tdd !== rel ? `// TDD: ${tdd}` : null,
    ].filter(Boolean).join('\n') + '\n';
  }
  // Cross-cutting / infra — sem BDD/SDD específico
  return [
    `// BDD: N/A (cross-cutting / infraestrutura)`,
    `// SDD: N/A`,
    tdd && tdd !== rel ? `// TDD: ${tdd}` : null,
  ].filter(Boolean).join('\n') + '\n';
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      out.push(...walk(p));
    } else if (name.endsWith('.ts') && !name.endsWith('.spec.ts') && !name.endsWith('.d.ts')) {
      out.push(p);
    }
  }
  return out;
}

const files = walk(join(ROOT, 'src'));
let updated = 0;
let skipped = 0;
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  // Idempotência: já tem header?
  if (/^(\/\/ BDD:|\/\* BDD:)/m.test(text.slice(0, 500))) {
    skipped++;
    continue;
  }
  const header = buildHeader(f) + '\n';
  writeFileSync(f, header + text);
  updated++;
  console.log(`+ ${relative(ROOT, f)}`);
}
console.log(`\nDone: ${updated} updated, ${skipped} skipped (already had header).`);
