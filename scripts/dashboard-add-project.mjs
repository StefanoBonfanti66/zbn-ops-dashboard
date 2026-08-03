#!/usr/bin/env node
/**
 * Aggiunge un nuovo progetto a projects-index.json
 * Uso: node dashboard-add-project.mjs <slug> [name] [phase] [state]
 *
 * Path risolti via config/zbn-data-layout.json (source of truth ZBN).
 * Ordine di precedenza:
 *   1. env ZBN_LAYOUT_FILE  → path esplicito dello spec
 *   2. env ZBN_CONFIG_REPO  → <ZBN_CONFIG_REPO>/config/zbn-data-layout.json
 *   3. sibling              → ../../opencode-config/config/zbn-data-layout.json
 * ZBN_PROJECTS_ROOT (env) ha priorità su roots.projects_root dello spec.
 * Fallback legacy ~/Scrivania/Progetti se lo spec non è disponibile.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CONFIG_REPO_NAME = 'opencode-config';
const DASHBOARD_NAME = 'zbn-ops-dashboard';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function resolveLayoutFile() {
  const candidates = [];
  if (process.env.ZBN_LAYOUT_FILE) candidates.push(process.env.ZBN_LAYOUT_FILE);
  if (process.env.ZBN_CONFIG_REPO) {
    candidates.push(resolve(process.env.ZBN_CONFIG_REPO, 'config/zbn-data-layout.json'));
  }
  candidates.push(resolve(SCRIPT_DIR, `../../${CONFIG_REPO_NAME}/config/zbn-data-layout.json`));
  return candidates.find((p) => existsSync(p)) || null;
}

function projectsRoot() {
  if (process.env.ZBN_PROJECTS_ROOT) return process.env.ZBN_PROJECTS_ROOT;
  const layoutFile = resolveLayoutFile();
  if (layoutFile) {
    try {
      const layout = readJson(layoutFile);
      if (layout.roots && layout.roots.projects_root) return layout.roots.projects_root;
    } catch {
      // spec non valido: fallback sotto
    }
  }
  return resolve(homedir(), 'Scrivania/Progetti'); // fallback legacy
}

function dashboardDir() {
  return resolve(projectsRoot(), DASHBOARD_NAME);
}

function slugToName(slug) {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function main() {
  const [,, slug, name, phase = 'Da avviare', state = 'pending'] = process.argv;

  if (!slug) {
    console.error('Uso: node dashboard-add-project.mjs <slug> [name] [phase] [state]');
    process.exit(1);
  }

  const displayName = name || slugToName(slug);
  const INDEX_PATH = resolve(dashboardDir(), 'app/data/projects-index.json');

  const index = readJson(INDEX_PATH);

  if (index.some((p) => p.slug === slug)) {
    console.log(`Progetto ${slug} già presente in projects-index.json`);
    process.exit(0);
  }

  const newEntry = {
    slug,
    name: displayName,
    phase,
    state,
    last_commit: '',
    last_commit_relative: '',
    next_action: 'Progetto appena creato — completare bootstrap e definire prossimo passo',
    revenue_eur: null,
    costs_eur: null,
    margin_eur: null,
    invoice_count: 0,
    ledger_status: 'template-only',
    commercial_risk: 'medium'
  };

  index.push(newEntry);
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + '\n');

  console.log(`✅ Aggiunto ${slug} a projects-index.json`);
  console.log(`   name: ${displayName}`);
  console.log(`   phase: ${phase}`);
  console.log(`   state: ${state}`);
}

main();
