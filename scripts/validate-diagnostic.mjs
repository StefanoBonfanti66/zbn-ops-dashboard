import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const EXIT_OK = 0;
const EXIT_DATA = 1;
const EXIT_RUNTIME = 2;
const EXIT_SCHEMA = 3;

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCHEMA_DIR = resolve(__dirname, '../schema');
const DEFAULT_DATA_DIR = resolve(__dirname, '../app/data');

const SCHEMA_TO_DATA = {
  'projects-index.schema.json': 'projects-index.json',
  'followup-item.schema.json': 'followup-items.json',
  'portfolio-summary.schema.json': 'portfolio-summary.json',
  'commercial-flag.schema.json': 'commercial-flags.json',
};

const IS_ARRAY_SCHEMA = new Set([
  'projects-index.schema.json',
  'followup-item.schema.json',
  'commercial-flag.schema.json',
]);

function toJsonPointer(segments) {
  return '#' + segments.map(s => '/' + String(s).replace(/~/g, '~0').replace(/\//g, '~1')).join('');
}

function compileSchemas(schemaDir) {
  const ajv = new Ajv({ strict: false });
  addFormats(ajv);

  const compiled = {};
  const errors = [];

  for (const file of Object.keys(SCHEMA_TO_DATA)) {
    const path = join(schemaDir, file);
    let raw;
    try {
      raw = readFileSync(path, 'utf8');
    } catch (e) {
      errors.push({ file, pointer: '', message: `Impossibile leggere lo schema: ${e.message}`, code: EXIT_RUNTIME });
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      errors.push({ file, pointer: '', message: `Schema JSON non valido: ${e.message}`, code: EXIT_SCHEMA });
      continue;
    }

    // $schema è solo una dichiarazione; lo si rimuove per evitare che Ajv
    // tenti di risolvere il meta-schema draft-2020-12 non presente in Ajv v8.
    delete parsed.$schema;

    let validate;
    try {
      validate = ajv.compile(parsed);
    } catch (e) {
      errors.push({ file, pointer: '', message: `Schema non compilabile: ${e.message}`, code: EXIT_SCHEMA });
      continue;
    }

    compiled[file] = { validate, schema: parsed };
  }

  return { compiled, errors };
}

function loadData(dataDir) {
  const data = {};
  const errors = [];

  for (const [, dataFile] of Object.entries(SCHEMA_TO_DATA)) {
    const path = join(dataDir, dataFile);
    let raw;
    try {
      raw = readFileSync(path, 'utf8');
    } catch (e) {
      errors.push({ file: dataFile, pointer: '', message: `Impossibile leggere il file dati: ${e.message}`, code: EXIT_RUNTIME });
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      errors.push({ file: dataFile, pointer: '', message: `File dati JSON non valido: ${e.message}`, code: EXIT_RUNTIME });
      continue;
    }

    data[dataFile] = parsed;
  }

  return { data, errors };
}

function validateData(compiled, data) {
  const violations = [];

  for (const [schemaFile, entry] of Object.entries(compiled)) {
    const dataFile = SCHEMA_TO_DATA[schemaFile];
    const items = data[dataFile];

    if (items === undefined) continue;

    const isArray = IS_ARRAY_SCHEMA.has(schemaFile);
    const elements = isArray ? items : [items];

    for (let i = 0; i < elements.length; i++) {
      const valid = entry.validate(elements[i]);
      if (!valid) {
        const errs = entry.validate.errors || [];
        for (const err of errs) {
          const pathSegments = isArray ? [String(i), ...err.instancePath.split('/').filter(Boolean)] : err.instancePath.split('/').filter(Boolean);
          violations.push({
            file: dataFile,
            pointer: toJsonPointer(pathSegments),
            message: `${err.message} (campo: ${err.instancePath || 'root'})`,
            schema: schemaFile,
          });
        }
      }
    }
  }

  return violations;
}

function run(schemaDir = DEFAULT_SCHEMA_DIR, dataDir = DEFAULT_DATA_DIR) {
  let exitCode = EXIT_OK;
  const allResults = [];

  const { compiled, errors: schemaErrors } = compileSchemas(schemaDir);
  for (const e of schemaErrors) {
    allResults.push(e);
    exitCode = Math.max(exitCode, e.code);
  }

  if (exitCode === EXIT_SCHEMA) {
    printResults(allResults, exitCode);
    process.exit(exitCode);
  }

  const { data, errors: dataErrors } = loadData(dataDir);
  for (const e of dataErrors) {
    allResults.push(e);
    exitCode = Math.max(exitCode, e.code);
  }

  if (exitCode === EXIT_RUNTIME) {
    printResults(allResults, exitCode);
    process.exit(exitCode);
  }

  const violations = validateData(compiled, data);
  for (const v of violations) {
    allResults.push(v);
    exitCode = Math.max(exitCode, EXIT_DATA);
  }

  printResults(allResults, exitCode);
  process.exit(exitCode);
}

function printResults(results, code) {
  if (results.length === 0) {
    console.log(`validate-diagnostic: OK (codice ${code})`);
    return;
  }
  console.log(`validate-diagnostic: ${results.length} non conformità (codice ${code})`);
  for (const r of results) {
    console.log(`  ${r.file}${r.pointer}: ${r.message}`);
  }
}

export { compileSchemas, loadData, validateData, run, EXIT_OK, EXIT_DATA, EXIT_RUNTIME, EXIT_SCHEMA };

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let schemaDir = DEFAULT_SCHEMA_DIR;
  let dataDir = DEFAULT_DATA_DIR;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--schema-dir' && i + 1 < args.length) schemaDir = args[++i];
    else if (args[i] === '--data-dir' && i + 1 < args.length) dataDir = args[++i];
  }
  run(schemaDir, dataDir);
}
