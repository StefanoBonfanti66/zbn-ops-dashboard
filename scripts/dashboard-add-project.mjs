#!/usr/bin/env node
/**
 * Aggiunge un nuovo progetto a projects-index.json
 * Uso: node dashboard-add-project.mjs <slug> [name] [phase] [state]
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const DASHBOARD_DIR = resolve('/home/sbonfanti/Scrivania/Progetti/zbn-ops-dashboard');
const INDEX_PATH = resolve(DASHBOARD_DIR, 'app/data/projects-index.json');

function slugToName(slug) {
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function main() {
  const [,, slug, name, phase = 'Da avviare', state = 'pending'] = process.argv;
  
  if (!slug) {
    console.error('Uso: node dashboard-add-project.mjs <slug> [name] [phase] [state]');
    process.exit(1);
  }

  const displayName = name || slugToName(slug);

  const index = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));

  if (index.some(p => p.slug === slug)) {
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