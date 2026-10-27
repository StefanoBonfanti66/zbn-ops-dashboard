import assert from "node:assert";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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

const GEN_DEFAULTS = {
  projectsPath: join(FIXTURE, "projects-index.json"),
  allProjectsPath: join(FIXTURE, "all-projects.json"),
  followupsPath: join(FIXTURE, "followup-items.json"),
  outPath: OUT_SUMMARY,
};

// ---------- generateSummary ----------

test("generateSummary esportato e importabile senza effetti collaterali all'import", () => {
  assert.strictEqual(typeof generateSummary, "function");
});

test("generateSummary esclude solo is_test:true dai KPI economici", () => {
  resetFixture();
  const summary = generateSummary(GEN_DEFAULTS);
  // is_test:true ha revenue_eur 5000, invoice_count 3 -> esclusi
  // is_test:false ha revenue_eur 12000, invoice_count 2 -> inclusi
  // legacy senza is_test ha revenue_eur 8000, invoice_count 1 -> inclusi
  assert.strictEqual(summary.revenue_total_eur, 20000, "revenue deve essere 12000+8000=20000");
  assert.strictEqual(summary.invoices_total, 3, "invoices deve essere 2+1=3");
  assert.strictEqual(summary.projects_test_count, 1, "un solo progetto is_test:true");
});

test("generateSummary include is_test:false e legacy nei conteggi economici", () => {
  resetFixture();
  const summary = generateSummary(GEN_DEFAULTS);
  assert.strictEqual(summary.projects_active, 2, "test+produzione sono attivi");
  assert.strictEqual(summary.projects_closed, 1, "solo progetto-legacy è closed");
  assert.strictEqual(summary.commercial_flags_high, 1, "solo produzione è high");
  assert.strictEqual(summary.commercial_flags_medium, 1, "solo test è medium");
});

test("generateSummary calcola projects_closed da state===closed sui dati sorgente", () => {
  resetFixture();
  const summary = generateSummary(GEN_DEFAULTS);
  const closed = JSON.parse(readFileSync(join(FIXTURE, "projects-index.json"), "utf8"))
    .filter((p) => p.state === "closed").length;
  assert.strictEqual(summary.projects_closed, closed, "projects_closed deve contare le entry con state==='closed'");
});

test("generateSummary calcola projects_unclassified come differenza all-projects meno projects-index", () => {
  resetFixture();
  const projects = JSON.parse(readFileSync(join(FIXTURE, "projects-index.json"), "utf8"));
  const allProjects = JSON.parse(readFileSync(join(FIXTURE, "all-projects.json"), "utf8"));
  const summary = generateSummary(GEN_DEFAULTS);
  assert.strictEqual(summary.projects_unclassified, allProjects.length - projects.length, "projects_unclassified = allProjects.length - projects.length");
});

test("generateSummary zero progetti closed restituisce projects_closed zero", () => {
  const zeroClosedProjects = JSON.stringify([
    {
      "slug": "p1", "name": "P1", "phase": "Esecuzione", "state": "active",
      "next_action": "a", "invoice_count": 0, "ledger_status": "template-only",
      "commercial_risk": "low", "priority": "low", "revenue_eur": 1000
    },
    {
      "slug": "p2", "name": "P2", "phase": "Avvio", "state": "blocked",
      "next_action": "b", "invoice_count": 0, "ledger_status": "missing",
      "commercial_risk": "high", "priority": "high", "revenue_eur": 2000
    }
  ]);
  const allProjects = JSON.stringify([{"name": "A", "slug": "a"}, {"name": "B", "slug": "b"}]);
  const followups = JSON.stringify([]);
  const tmpZero = "/tmp/opencode/fixture-zero-closed";
  mkdirSync(tmpZero, { recursive: true });
  writeFileSync(join(tmpZero, "projects-index.json"), zeroClosedProjects);
  writeFileSync(join(tmpZero, "all-projects.json"), allProjects);
  writeFileSync(join(tmpZero, "followup-items.json"), followups);
  const summary = generateSummary({
    projectsPath: join(tmpZero, "projects-index.json"),
    allProjectsPath: join(tmpZero, "all-projects.json"),
    followupsPath: join(tmpZero, "followup-items.json"),
    outPath: join(tmpZero, "portfolio-summary.json"),
  });
  assert.strictEqual(summary.projects_closed, 0, "nessun progetto closed -> projects_closed zero");
  assert.strictEqual(summary.projects_unclassified, 0, "2-2=0");
});

test("generateSummary almeno un progetto closed conta correttamente", () => {
  resetFixture();
  const summary = generateSummary(GEN_DEFAULTS);
  const expectedClosed = JSON.parse(readFileSync(join(FIXTURE, "projects-index.json"), "utf8"))
    .filter((p) => p.state === "closed").length;
  assert.strictEqual(summary.projects_closed, expectedClosed, "conteggio closed corrisponde ai dati");
  assert.strictEqual(summary.projects_closed, 1, "fixture corrente ha un progetto closed");
});

test("generateSummary errore chiaro per dimensioni incoerenti (all-projects minore di projects-index)", () => {
  const manyProjects = JSON.stringify([
    { "slug": "p1", "state": "active" },
    { "slug": "p2", "state": "active" },
    { "slug": "p3", "state": "active" }
  ]);
  const fewAllProjects = JSON.stringify([{ "name": "A", "slug": "a" }]);
  const tmpInc = "/tmp/opencode/fixture-incoerente";
  mkdirSync(tmpInc, { recursive: true });
  writeFileSync(join(tmpInc, "projects-index.json"), manyProjects);
  writeFileSync(join(tmpInc, "all-projects.json"), fewAllProjects);
  writeFileSync(join(tmpInc, "followup-items.json"), JSON.stringify([]));
  assert.throws(
    () => generateSummary({
      projectsPath: join(tmpInc, "projects-index.json"),
      allProjectsPath: join(tmpInc, "all-projects.json"),
      followupsPath: join(tmpInc, "followup-items.json"),
      outPath: join(tmpInc, "portfolio-summary.json"),
    }),
    /projects_unclassified negativo/,
    "deve sollevare errore quando all-projects ha meno entry di projects-index"
  );
});

test("generateSummary scrivi file output conforme a portfolio-summary schema (campi required presenti)", () => {
  resetFixture();
  const summary = generateSummary(GEN_DEFAULTS);
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
  generateSummary(GEN_DEFAULTS);
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
  assert.strictEqual(allProjects.length, 5);
  assert.strictEqual(result.allProjects.length, 5);
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
  assert.strictEqual(result.summary.projects_closed, 1);
  assert.strictEqual(result.summary.projects_unclassified, 2);
});

test("syncFromProjects equivalenza aggregati comuni con generateSummary", () => {
  resetFixture();
  const s1 = generateSummary(GEN_DEFAULTS);
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
  assert.strictEqual(s1.projects_closed, s2.projects_closed);
  assert.strictEqual(s1.projects_unclassified, s2.projects_unclassified);
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
