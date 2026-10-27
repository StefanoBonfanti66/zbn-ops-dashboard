import assert from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateSummary } from "../generate-summary.mjs";
import { syncFromProjects } from "../sync-from-projects.mjs";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`FAIL: ${name} - ${e.message}`);
    failed++;
  }
}

const FIXTURE = "/tmp/opencode/fixture-1793106704";
const OUT_SUMMARY = join(FIXTURE, "portfolio-summary.json");
const OUT_ALL_PROJECTS = join(FIXTURE, "all-projects.json");
const OUT_FOLLOWUPS = join(FIXTURE, "followup-items.json");

// Copie pristine dei fixture (prima di ogni esecuzione)
const projectsPristine = readFileSync(join(FIXTURE, "projects-index.json"), "utf8");
const followupsPristine = readFileSync(join(FIXTURE, "followup-items.json"), "utf8");
const commercialFlagsPristine = readFileSync(join(FIXTURE, "commercial-flags.json"), "utf8");
const allProjectsPristine = readFileSync(join(FIXTURE, "all-projects.json"), "utf8");

function resetFixture() {
  writeFileSync(join(FIXTURE, "projects-index.json"), projectsPristine);
  writeFileSync(join(FIXTURE, "followup-items.json"), followupsPristine);
  writeFileSync(join(FIXTURE, "commercial-flags.json"), commercialFlagsPristine);
  writeFileSync(join(FIXTURE, "all-projects.json"), allProjectsPristine);
}

// ---------- generateSummary ----------

test("generateSummary esportato e importabile senza effetti collaterali all'import", () => {
  assert.strictEqual(typeof generateSummary, "function");
});

test("generateSummary esclude solo is_test:true dai KPI economici", () => {
  resetFixture();
  const summary = generateSummary({
    projectsPath: join(FIXTURE, "projects-index.json"),
    followupsPath: join(FIXTURE, "followup-items.json"),
    outPath: OUT_SUMMARY,
  });
  // is_test:true ha revenue_eur 5000, invoice_count 3 -> esclusi
  // is_test:false ha revenue_eur 12000, invoice_count 2 -> inclusi
  // legacy senza is_test ha revenue_eur 8000, invoice_count 1 -> inclusi
  assert.strictEqual(summary.revenue_total_eur, 20000, "revenue deve essere 12000+8000=20000");
  assert.strictEqual(summary.invoices_total, 3, "invoices deve essere 2+1=3");
  assert.strictEqual(summary.projects_test_count, 1, "un solo progetto is_test:true");
});

test("generateSummary include is_test:false e legacy nei conteggi economici", () => {
  resetFixture();
  const summary = generateSummary({
    projectsPath: join(FIXTURE, "projects-index.json"),
    followupsPath: join(FIXTURE, "followup-items.json"),
    outPath: OUT_SUMMARY,
  });
  assert.strictEqual(summary.projects_active, 2, "test+produzione sono attivi");
  assert.strictEqual(summary.projects_closed, 2, "valore hardcoded nel codice attuale");
  assert.strictEqual(summary.commercial_flags_high, 1, "solo produzione è high");
  assert.strictEqual(summary.commercial_flags_medium, 1, "solo test è medium");
});

test("generateSummary scrivi file output conforme a portfolio-summary schema (campi required presenti)", () => {
  resetFixture();
  const summary = generateSummary({
    projectsPath: join(FIXTURE, "projects-index.json"),
    followupsPath: join(FIXTURE, "followup-items.json"),
    outPath: OUT_SUMMARY,
  });
  const written = JSON.parse(readFileSync(OUT_SUMMARY, "utf8"));
  const required = [
    "generated_at", "projects_active", "projects_closed", "projects_unclassified",
    "followup_urgent", "followup_pending", "followup_snooze",
    "commercial_flags_high", "commercial_flags_medium", "revenue_total_eur",
    "invoices_total", "ledger_template_only_count", "projects_test_count",
  ];
  for (const key of required) {
    assert.ok(key in written, `campo required mancante: ${key}`);
  }
  assert.strictEqual(typeof written.generated_at, "string");
  assert.strictEqual(typeof written.revenue_total_eur, "number");
  assert.strictEqual(Number.isInteger(written.invoices_total), true);
  assert.strictEqual(Number.isInteger(written.projects_test_count), true);
});

test("generateSummary conserva dati economici originali nelle entry (non le modifica)", () => {
  resetFixture();
  generateSummary({
    projectsPath: join(FIXTURE, "projects-index.json"),
    followupsPath: join(FIXTURE, "followup-items.json"),
    outPath: OUT_SUMMARY,
  });
  const after = JSON.parse(readFileSync(join(FIXTURE, "projects-index.json"), "utf8"));
  const testProj = after.find((p) => p.slug === "progetto-test");
  const prodProj = after.find((p) => p.slug === "progetto-produzione");
  const legacyProj = after.find((p) => p.slug === "progetto-legacy");
  assert.strictEqual(testProj.revenue_eur, 5000);
  assert.strictEqual(testProj.invoice_count, 3);
  assert.strictEqual(prodProj.revenue_eur, 12000);
  assert.strictEqual(prodProj.invoice_count, 2);
  assert.strictEqual(legacyProj.revenue_eur, 8000);
  assert.strictEqual(legacyProj.invoice_count, 1);
});

// ---------- syncFromProjects ----------

test("syncFromProjects esportato e importabile senza effetti collaterali all'import", () => {
  assert.strictEqual(typeof syncFromProjects, "function");
});

test("syncFromProjects propaga _is_test su all-projects.json", () => {
  resetFixture();
  const result = syncFromProjects({
    data: {
      followups: join(FIXTURE, "followup-items.json"),
      projects: join(FIXTURE, "projects-index.json"),
      flags: join(FIXTURE, "commercial-flags.json"),
      summary: OUT_SUMMARY,
      allProjects: OUT_ALL_PROJECTS,
    },
  });
  const allProjects = JSON.parse(readFileSync(OUT_ALL_PROJECTS, "utf8"));
  // all-projects era [], quindi non ci sono entry da arricchire
  assert.strictEqual(allProjects.length, 0);
  assert.strictEqual(result.allProjects.length, 0);
});

test("syncFromProjects rigenera portfolio-summary con esclusione is_test", () => {
  resetFixture();
  const result = syncFromProjects({
    data: {
      followups: join(FIXTURE, "followup-items.json"),
      projects: join(FIXTURE, "projects-index.json"),
      flags: join(FIXTURE, "commercial-flags.json"),
      summary: OUT_SUMMARY,
      allProjects: OUT_ALL_PROJECTS,
    },
  });
  assert.strictEqual(result.summary.revenue_total_eur, 20000);
  assert.strictEqual(result.summary.invoices_total, 3);
  assert.strictEqual(result.summary.projects_test_count, 1);
});

test("syncFromProjects equivalenza aggregati comuni con generateSummary", () => {
  resetFixture();
  const s1 = generateSummary({
    projectsPath: join(FIXTURE, "projects-index.json"),
    followupsPath: join(FIXTURE, "followup-items.json"),
    outPath: OUT_SUMMARY,
  });
  resetFixture();
  const s2 = syncFromProjects({
    data: {
      followups: join(FIXTURE, "followup-items.json"),
      projects: join(FIXTURE, "projects-index.json"),
      flags: join(FIXTURE, "commercial-flags.json"),
      summary: OUT_SUMMARY,
      allProjects: OUT_ALL_PROJECTS,
    },
  }).summary;
  assert.strictEqual(s1.revenue_total_eur, s2.revenue_total_eur);
  assert.strictEqual(s1.invoices_total, s2.invoices_total);
  assert.strictEqual(s1.projects_test_count, s2.projects_test_count);
  assert.strictEqual(s1.projects_active, s2.projects_active);
});

test("syncFromProjects lascia follow-up curati invariati (contenuto prima/dopo)", () => {
  resetFixture();
  const before = readFileSync(join(FIXTURE, "followup-items.json"), "utf8");
  syncFromProjects({
    data: {
      followups: join(FIXTURE, "followup-items.json"),
      projects: join(FIXTURE, "projects-index.json"),
      flags: join(FIXTURE, "commercial-flags.json"),
      summary: OUT_SUMMARY,
      allProjects: OUT_ALL_PROJECTS,
    },
  });
  const after = readFileSync(join(FIXTURE, "followup-items.json"), "utf8");
  assert.strictEqual(before, after, "followup-items.json modificato");
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
