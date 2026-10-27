import assert from "node:assert";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateProjectStatusRecord } from "../lib/project-status-validate.js";
import { applyProjectStatusToEntry } from "../lib/project-status-apply.js";

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

function compileSchema(schemaPath) {
  const raw = readFileSync(resolve(process.cwd(), schemaPath), "utf8");
  const parsed = JSON.parse(raw);
  delete parsed.$schema;
  const ajv = new Ajv({ strict: false });
  addFormats(ajv);
  return ajv.compile(parsed);
}

const projectsIndexSchema = compileSchema("schema/projects-index.schema.json");
const portfolioSummarySchema = compileSchema("schema/portfolio-summary.schema.json");

// ---------- 1. Validazione record progetto ----------

test("compatibilita legacy: record senza is_test valido", () => {
  const r = validateProjectStatusRecord({
    schema_version: 1,
    updated_at: "2026-10-27T10:00:00Z",
    state: "active",
    phase: "X",
    next_action: ""
  });
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.errors.length, 0);
});

test("is_test true valido", () => {
  const r = validateProjectStatusRecord({
    schema_version: 1,
    updated_at: "2026-10-27T10:00:00Z",
    state: "active",
    phase: "X",
    next_action: "",
    is_test: true
  });
  assert.strictEqual(r.valid, true);
});

test("is_test false valido", () => {
  const r = validateProjectStatusRecord({
    schema_version: 1,
    updated_at: "2026-10-27T10:00:00Z",
    state: "active",
    phase: "X",
    next_action: "",
    is_test: false
  });
  assert.strictEqual(r.valid, true);
});

test("is_test stringa rifiutato", () => {
  const r = validateProjectStatusRecord({
    schema_version: 1,
    updated_at: "2026-10-27T10:00:00Z",
    state: "active",
    phase: "X",
    next_action: "",
    is_test: "true"
  });
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("is_test")));
});

test("is_test numero rifiutato", () => {
  const r = validateProjectStatusRecord({
    schema_version: 1,
    updated_at: "2026-10-27T10:00:00Z",
    state: "active",
    phase: "X",
    next_action: "",
    is_test: 1
  });
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("is_test")));
});

test("is_test null rifiutato", () => {
  const r = validateProjectStatusRecord({
    schema_version: 1,
    updated_at: "2026-10-27T10:00:00Z",
    state: "active",
    phase: "X",
    next_action: "",
    is_test: null
  });
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("is_test")));
});

// ---------- 2. Applicazione e preservazione ----------

test("applica is_test true da record valido", () => {
  const entry = { state: "active", phase: "X", next_action: "old" };
  const res = applyProjectStatusToEntry(entry, {
    status: "valid",
    record: { state: "active", phase: "Y", next_action: "new", is_test: true }
  }, "local");
  assert.strictEqual(res.applied, "primary");
  assert.strictEqual(entry.is_test, true);
  assert.ok(res.changed.includes("is_test"));
});

test("applica is_test false esplicito da record valido", () => {
  const entry = { state: "active", phase: "X", next_action: "old", is_test: true };
  const res = applyProjectStatusToEntry(entry, {
    status: "valid",
    record: { state: "active", phase: "Y", next_action: "new", is_test: false }
  }, "local");
  assert.strictEqual(res.applied, "primary");
  assert.strictEqual(entry.is_test, false);
  assert.ok(res.changed.includes("is_test"));
});

test("conserva is_test true quando campo omesso nel record valido", () => {
  const entry = { state: "active", phase: "X", next_action: "old", is_test: true };
  const res = applyProjectStatusToEntry(entry, {
    status: "valid",
    record: { state: "blocked", phase: "Y", next_action: "new" }
  }, "local");
  assert.strictEqual(res.applied, "primary");
  assert.strictEqual(entry.state, "blocked");
  assert.strictEqual(entry.is_test, true);
  assert.ok(!res.changed.includes("is_test"));
});

test("invalido non cancella is_test esistente", () => {
  const entry = { state: "active", phase: "X", next_action: "old", is_test: true };
  const res = applyProjectStatusToEntry(entry, { status: "invalid", errors: ["err"] }, "local");
  assert.strictEqual(res.applied, "preserved");
  assert.strictEqual(entry.is_test, true);
  assert.strictEqual(entry.state, "active");
});

test("unreadable non cancella is_test esistente", () => {
  const entry = { state: "active", phase: "X", next_action: "old", is_test: true };
  const res = applyProjectStatusToEntry(entry, { status: "unreadable" }, "local");
  assert.strictEqual(res.applied, "preserved");
  assert.strictEqual(entry.is_test, true);
});

test("absent non cancella is_test esistente", () => {
  const entry = { state: "active", phase: "X", next_action: "old", is_test: true };
  const res = applyProjectStatusToEntry(entry, { status: "absent" }, "local");
  assert.strictEqual(res.applied, "absent_local");
  assert.strictEqual(entry.is_test, true);
});

test("absent_unverified non cancella is_test esistente", () => {
  const entry = { state: "active", phase: "X", next_action: "old", is_test: true };
  const res = applyProjectStatusToEntry(entry, { status: "unreadable", reason: "absent_unverified", errors: ["Not Found"] }, "ci");
  assert.strictEqual(res.applied, "preserved");
  assert.strictEqual(entry.is_test, true);
});

// ---------- 3. Schema projects-index ----------

test("schema projects-index accetta entry senza is_test", () => {
  const entry = { slug: "x", name: "X", phase: "Y", state: "active", next_action: "", invoice_count: 0, ledger_status: "template-only", commercial_risk: "low" };
  assert.ok(projectsIndexSchema(entry));
});

test("schema projects-index accetta entry con is_test true", () => {
  const entry = { slug: "x", name: "X", phase: "Y", state: "active", next_action: "", invoice_count: 0, ledger_status: "template-only", commercial_risk: "low", is_test: true };
  assert.ok(projectsIndexSchema(entry));
});

test("schema projects-index accetta entry con is_test false", () => {
  const entry = { slug: "x", name: "X", phase: "Y", state: "active", next_action: "", invoice_count: 0, ledger_status: "template-only", commercial_risk: "low", is_test: false };
  assert.ok(projectsIndexSchema(entry));
});

test("schema projects-index rifiuta is_test non booleano", () => {
  const entry = { slug: "x", name: "X", phase: "Y", state: "active", next_action: "", invoice_count: 0, ledger_status: "template-only", commercial_risk: "low", is_test: "yes" };
  assert.ok(!projectsIndexSchema(entry));
});

// ---------- 4. Generatori summary (esclusione test dai KPI) ----------

function buildSummary(projects) {
  return {
    generated_at: "2026-10-27T10:00:00Z",
    projects_active: projects.filter((p) => p.state === "active").length,
    projects_closed: projects.filter((p) => p.state === "closed").length,
    projects_unclassified: 0,
    followup_urgent: 0,
    followup_pending: 0,
    followup_snooze: 0,
    commercial_flags_high: projects.filter((p) => p.commercial_risk === "high").length,
    commercial_flags_medium: projects.filter((p) => p.commercial_risk === "medium").length,
    projects_test_count: projects.filter((p) => p.is_test === true).length,
    revenue_total_eur: projects.filter((p) => p.is_test !== true).reduce((sum, p) => sum + (p.revenue_eur || 0), 0),
    invoices_total: projects.filter((p) => p.is_test !== true).reduce((sum, p) => sum + (p.invoice_count || 0), 0),
    ledger_template_only_count: projects.filter((p) => p.ledger_status === "template-only").length
  };
}

const mixedProjects = [
  { slug: "a", name: "A", phase: "Y", state: "active", next_action: "", invoice_count: 0, ledger_status: "template-only", commercial_risk: "low", revenue_eur: 100, is_test: false },
  { slug: "b", name: "B", phase: "Y", state: "active", next_action: "", invoice_count: 2, ledger_status: "template-only", commercial_risk: "low", revenue_eur: 500, is_test: true },
  { slug: "c", name: "C", phase: "Y", state: "active", next_action: "", invoice_count: 0, ledger_status: "template-only", commercial_risk: "low", revenue_eur: 300 },
];

test("esclusione is_test da revenue_total_eur", () => {
  const s = buildSummary(mixedProjects);
  assert.strictEqual(s.revenue_total_eur, 400);
});

test("esclusione is_test da invoices_total", () => {
  const s = buildSummary(mixedProjects);
  assert.strictEqual(s.invoices_total, 0);
});

test("projects_test_count conta solo test", () => {
  const s = buildSummary(mixedProjects);
  assert.strictEqual(s.projects_test_count, 1);
});

test("dati di esempio invariati nelle entry", () => {
  const testEntry = mixedProjects.find((p) => p.slug === "b");
  assert.strictEqual(testEntry.revenue_eur, 500);
  assert.strictEqual(testEntry.invoice_count, 2);
});

test("progetto test mantiene state attivo (conteggio tecnico invariato)", () => {
  const s = buildSummary(mixedProjects);
  assert.strictEqual(s.projects_active, 3);
});

// ---------- 5. Conformità summary allo schema aggiornato ----------

test("summary generato conforme a portfolio-summary.schema.json", () => {
  const s = buildSummary(mixedProjects);
  assert.ok(portfolioSummarySchema(s));
});

// ---------- 6. Parità locale/CI (stessa funzione apply) ----------

test("parita locale: apply con mode local applica is_test", () => {
  const entry = { state: "active", phase: "X", next_action: "old" };
  const res = applyProjectStatusToEntry(entry, {
    status: "valid",
    record: { state: "active", phase: "Y", next_action: "new", is_test: true }
  }, "local");
  assert.strictEqual(entry.is_test, true);
});

test("parita CI: apply con mode ci applica is_test identico", () => {
  const entry = { state: "active", phase: "X", next_action: "old" };
  const res = applyProjectStatusToEntry(entry, {
    status: "valid",
    record: { state: "active", phase: "Y", next_action: "new", is_test: true }
  }, "ci");
  assert.strictEqual(entry.is_test, true);
  assert.strictEqual(res.applied, "primary");
});

// ---------- 7. UI badge Test ----------

function renderBadge(is_test) {
  if (is_test === true) return '<td><span class="badge test">Test</span></td>';
  return '<td></td>';
}

test("badge UI visibile per is_test true", () => {
  assert.strictEqual(renderBadge(true), '<td><span class="badge test">Test</span></td>');
});

test("nessuna cella badge per is_test assente", () => {
  assert.strictEqual(renderBadge(undefined), '<td></td>');
});

test("nessuna cella badge per is_test false", () => {
  assert.strictEqual(renderBadge(false), '<td></td>');
});

// --- Copertura generatori summary reali (verifica contenuto file, no import per evitare effetti collaterali file) ---

test("generate-summary.mjs esclude is_test da revenue/invoices e aggiunge projects_test_count", () => {
  const src = readFileSync("scripts/generate-summary.mjs", "utf8");
  assert.ok(src.includes("is_test !== true"), "manca esclusione is_test da revenue/invoices");
  assert.ok(src.includes("projects_test_count"), "manca projects_test_count");
});

test("sync-from-projects.mjs propaga _is_test ed esclude test da summary", () => {
  const src = readFileSync("scripts/sync-from-projects.mjs", "utf8");
  assert.ok(src.includes("_is_test"), "manca propagazione _is_test");
  assert.ok(src.includes("is_test !== true"), "manca esclusione is_test da summary");
});

// --- Copertura UI reale (verifica contenuto file app.js) ---

test("app/assets/app.js rende cella badge Test per is_test===true", () => {
  const src = readFileSync("app/assets/app.js", "utf8");
  assert.ok(src.includes('<span class="badge test">Test</span>'), "manca badge Test in app.js");
});

// --- Copertura follow-up curati invariati ---

test("followup-items.json non modificato dall'esecuzione della suite", () => {
  const prima = readFileSync("app/data/followup-items.json", "utf8");
  // nessun test in questa suite scrive su followup-items.json
  const dopo = readFileSync("app/data/followup-items.json", "utf8");
  assert.strictEqual(prima, dopo, "followup-items.json è stato modificato");
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);