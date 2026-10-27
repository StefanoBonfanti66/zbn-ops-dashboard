import { test } from 'node:test';
import { ok, equal, deepEqual } from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DIAGNOSTIC = join(process.cwd(), 'scripts/validate-diagnostic.mjs');

function runDiagnostic(schemaDir, dataDir, env = {}) {
  const args = [DIAGNOSTIC, '--schema-dir', schemaDir, '--data-dir', dataDir];
  try {
    const result = execFileSync('node', args, { encoding: 'utf8', env: { ...process.env, ...env } });
    return { code: 0, stdout: result, stderr: '' };
  } catch (err) {
    return { code: err.status || 1, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

const DEFAULT_SCHEMA = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
});

const DEFAULT_DATA_ARRAY = JSON.stringify([]);
const DEFAULT_DATA_OBJECT = JSON.stringify({});

const ALL_SCHEMA_FILES = [
  'projects-index.schema.json',
  'followup-item.schema.json',
  'portfolio-summary.schema.json',
  'commercial-flag.schema.json',
];

const ALL_DATA_FILES = [
  'projects-index.json',
  'followup-items.json',
  'portfolio-summary.json',
  'commercial-flags.json',
];

function makeFixture(schemaFiles = {}, dataFiles = {}) {
  const root = mkdtempSync(join(tmpdir(), 'zbn-diagnostic-'));
  const schemaDir = join(root, 'schema');
  const dataDir = join(root, 'data');
  for (const d of [schemaDir, dataDir]) {
    mkdirSync(d, { recursive: true });
  }

  // Crea tutti e quattro i file schema (default validi) e dati (default vuoti)
  // affinché il diagnostico non fallisca per file mancanti; i test sovrascrivono quelli rilevanti.
  // Valore null in dataFiles significa "non creare il file" (per test code 2).
  for (const name of ALL_SCHEMA_FILES) {
    writeFileSync(join(schemaDir, name), schemaFiles[name] || DEFAULT_SCHEMA, { recursive: true });
  }
  for (const name of ALL_DATA_FILES) {
    if (dataFiles[name] === null) continue; // file assente intenzionalmente
    const isArray = name.endsWith('-items.json') || name === 'projects-index.json' || name === 'commercial-flags.json';
    writeFileSync(join(dataDir, name), dataFiles[name] ?? (isArray ? DEFAULT_DATA_ARRAY : DEFAULT_DATA_OBJECT), { recursive: true });
  }

  return { root, schemaDir, dataDir, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const VALID_PROJECTS_INDEX_SCHEMA = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['slug', 'name', 'state'],
  properties: {
    slug: { type: 'string' },
    name: { type: 'string' },
    state: { type: 'string', enum: ['active', 'blocked', 'closed', 'archived', 'unknown'] },
  },
  additionalProperties: false,
});

const VALID_PROJECTS_INDEX_DATA = JSON.stringify([
  { slug: 'x', name: 'X', state: 'active' },
  { slug: 'y', name: 'Y', state: 'blocked' },
]);

const INVALID_ENUM_DATA = JSON.stringify([
  { slug: 'x', name: 'X', state: 'pending' },
]);

const MISSING_REQUIRED_DATA = JSON.stringify([
  { slug: 'x', name: 'X' },
]);

const EXTRA_PROP_DATA = JSON.stringify([
  { slug: 'x', name: 'X', state: 'active', extra: 'nope' },
]);

const NUMERIC_CONSTRAINT_SCHEMA = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['count'],
  properties: { count: { type: 'integer', minimum: 0 } },
  additionalProperties: false,
});

const NUMERIC_VIOLATION_DATA = JSON.stringify({ count: -1 });

const FORMAT_SCHEMA = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['d'],
  properties: { d: { type: 'string', format: 'date' } },
  additionalProperties: false,
});

const FORMAT_VIOLATION_DATA = JSON.stringify({ d: 'not-a-date' });

const VALID_REF_SCHEMA = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $defs: { item: { type: 'object', required: ['id'], properties: { id: { type: 'string' } }, additionalProperties: false } },
  type: 'object',
  required: ['ref'],
  properties: { ref: { $ref: '#/$defs/item' } },
  additionalProperties: false,
});

const VALID_REF_DATA = JSON.stringify({ ref: { id: 'abc' } });

const INVALID_REF_DATA = JSON.stringify({ ref: { id: 123 } });

const UNRESOLVABLE_REF_SCHEMA = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: { x: { $ref: '#/nonexistent' } },
});

const MALFORMED_JSON = '{ not valid json ';

const INVALID_SCHEMA = JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'nope' });

test('dati validi restituiscono codice 0', (t) => {
  const f = makeFixture(
    { 'projects-index.schema.json': VALID_PROJECTS_INDEX_SCHEMA },
    { 'projects-index.json': VALID_PROJECTS_INDEX_DATA }
  );
  try {
    const r = runDiagnostic(f.schemaDir, f.dataDir);
    equal(r.code, 0);
    ok(r.stdout.includes('OK'));
  } finally { f.cleanup(); }
});

test('enum invalido restituisce codice 1 con JSON Pointer', (t) => {
  const f = makeFixture(
    { 'projects-index.schema.json': VALID_PROJECTS_INDEX_SCHEMA },
    { 'projects-index.json': INVALID_ENUM_DATA }
  );
  try {
    const r = runDiagnostic(f.schemaDir, f.dataDir);
    equal(r.code, 1);
    ok(r.stdout.includes('/0/state'));
  } finally { f.cleanup(); }
});

test('required mancante restituisce codice 1', (t) => {
  const f = makeFixture(
    { 'projects-index.schema.json': VALID_PROJECTS_INDEX_SCHEMA },
    { 'projects-index.json': MISSING_REQUIRED_DATA }
  );
  try {
    const r = runDiagnostic(f.schemaDir, f.dataDir);
    equal(r.code, 1);
    ok(r.stdout.includes('required'));
  } finally { f.cleanup(); }
});

test('proprietà extra vietata restituisce codice 1', (t) => {
  const f = makeFixture(
    { 'projects-index.schema.json': VALID_PROJECTS_INDEX_SCHEMA },
    { 'projects-index.json': EXTRA_PROP_DATA }
  );
  try {
    const r = runDiagnostic(f.schemaDir, f.dataDir);
    equal(r.code, 1);
    ok(r.stdout.includes('/0'));
  } finally { f.cleanup(); }
});

test('vincolo numerico minimo restituisce codice 1', (t) => {
  const f = makeFixture(
    { 'portfolio-summary.schema.json': NUMERIC_CONSTRAINT_SCHEMA },
    { 'portfolio-summary.json': NUMERIC_VIOLATION_DATA }
  );
  try {
    const r = runDiagnostic(f.schemaDir, f.dataDir);
    equal(r.code, 1);
  } finally { f.cleanup(); }
});

test('format date non valido restituisce codice 1', (t) => {
  const f = makeFixture(
    { 'portfolio-summary.schema.json': FORMAT_SCHEMA },
    { 'portfolio-summary.json': FORMAT_VIOLATION_DATA }
  );
  try {
    const r = runDiagnostic(f.schemaDir, f.dataDir);
    equal(r.code, 1);
  } finally { f.cleanup(); }
});

test('$ref valido restituisce codice 0', (t) => {
  const f = makeFixture(
    { 'portfolio-summary.schema.json': VALID_REF_SCHEMA },
    { 'portfolio-summary.json': VALID_REF_DATA }
  );
  try {
    const r = runDiagnostic(f.schemaDir, f.dataDir);
    equal(r.code, 0);
  } finally { f.cleanup(); }
});

test('$ref non valido restituisce codice 1', (t) => {
  const f = makeFixture(
    { 'portfolio-summary.schema.json': VALID_REF_SCHEMA },
    { 'portfolio-summary.json': INVALID_REF_DATA }
  );
  try {
    const r = runDiagnostic(f.schemaDir, f.dataDir);
    equal(r.code, 1);
  } finally { f.cleanup(); }
});

test('$ref irrisolvibile nello schema restituisce codice 3', (t) => {
  const f = makeFixture(
    { 'portfolio-summary.schema.json': UNRESOLVABLE_REF_SCHEMA },
    { 'portfolio-summary.json': JSON.stringify({ x: 1 }) }
  );
  try {
    const r = runDiagnostic(f.schemaDir, f.dataDir);
    equal(r.code, 3);
  } finally { f.cleanup(); }
});

test('JSON dati malformato restituisce codice 2', (t) => {
  const f = makeFixture(
    { 'projects-index.schema.json': VALID_PROJECTS_INDEX_SCHEMA },
    { 'projects-index.json': MALFORMED_JSON }
  );
  try {
    const r = runDiagnostic(f.schemaDir, f.dataDir);
    equal(r.code, 2);
  } finally { f.cleanup(); }
});

test('file dati assente restituisce codice 2', (t) => {
  const f = makeFixture(
    { 'projects-index.schema.json': VALID_PROJECTS_INDEX_SCHEMA },
    { 'projects-index.json': null }
  );
  try {
    const r = runDiagnostic(f.schemaDir, f.dataDir);
    equal(r.code, 2);
  } finally { f.cleanup(); }
});

test('schema non valido restituisce codice 3', (t) => {
  const f = makeFixture(
    { 'projects-index.schema.json': INVALID_SCHEMA },
    { 'projects-index.json': VALID_PROJECTS_INDEX_DATA }
  );
  try {
    const r = runDiagnostic(f.schemaDir, f.dataDir);
    equal(r.code, 3);
  } finally { f.cleanup(); }
});

test('precedenza: schema invalido (3) batte dati non conformi (1)', (t) => {
  const f = makeFixture(
    { 'projects-index.schema.json': INVALID_SCHEMA },
    { 'projects-index.json': INVALID_ENUM_DATA }
  );
  try {
    const r = runDiagnostic(f.schemaDir, f.dataDir);
    equal(r.code, 3);
  } finally { f.cleanup(); }
});

test('precedenza: file mancante (2) batte dati non conformi (1)', (t) => {
  const f = makeFixture(
    { 'projects-index.schema.json': VALID_PROJECTS_INDEX_SCHEMA },
    { 'projects-index.json': null }
  );
  try {
    const r = runDiagnostic(f.schemaDir, f.dataDir);
    equal(r.code, 2);
  } finally { f.cleanup(); }
});

test('precedenza: schema invalido (3) batte file mancante (2)', (t) => {
  const f = makeFixture(
    { 'projects-index.schema.json': INVALID_SCHEMA },
    { 'projects-index.json': null }
  );
  try {
    const r = runDiagnostic(f.schemaDir, f.dataDir);
    equal(r.code, 3);
  } finally { f.cleanup(); }
});

test('nessuna scrittura sui file esaminati', (t) => {
  const f = makeFixture(
    { 'projects-index.schema.json': VALID_PROJECTS_INDEX_SCHEMA },
    { 'projects-index.json': INVALID_ENUM_DATA }
  );
  try {
    const beforeSchema = readFileSync(join(f.schemaDir, 'projects-index.schema.json'), 'utf8');
    const beforeData = readFileSync(join(f.dataDir, 'projects-index.json'), 'utf8');
    runDiagnostic(f.schemaDir, f.dataDir);
    const afterSchema = readFileSync(join(f.schemaDir, 'projects-index.schema.json'), 'utf8');
    const afterData = readFileSync(join(f.dataDir, 'projects-index.json'), 'utf8');
    equal(afterSchema, beforeSchema);
    equal(afterData, beforeData);
  } finally { f.cleanup(); }
});

test('schemi reali: rileva state=pending fuori enum su progetti reali', (t) => {
  const r = runDiagnostic(
    join(process.cwd(), 'schema'),
    join(process.cwd(), 'app/data')
  );
  equal(r.code, 1);
  ok(r.stdout.includes('projects-index.json'));
  ok(r.stdout.includes('/state'));
});
