import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const DATA = {
  followups: "app/data/followup-items.json",
  projects: "app/data/projects-index.json",
  flags: "app/data/commercial-flags.json",
  summary: "app/data/portfolio-summary.json",
  allProjects: "app/data/all-projects.json",
};

const SCHEMAS = {
  followups: "schema/followup-item.schema.json",
  projects: "schema/projects-index.schema.json",
  flags: "schema/commercial-flag.schema.json",
  summary: "schema/portfolio-summary.schema.json",
};

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, relPath), "utf8"));
}

function writeJson(relPath, data) {
  fs.writeFileSync(
    path.resolve(root, relPath),
    JSON.stringify(data, null, 2) + "\n"
  );
}

function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9_]+/g, "-").replace(/^-|-$/g, "");
}

const changelog = [];

// Step 1: read existing data
const followups = readJson(DATA.followups);
const projects = readJson(DATA.projects);
const flags = readJson(DATA.flags);
let allProjects = [];
try {
  allProjects = readJson(DATA.allProjects);
} catch {
  changelog.push("WARN: all-projects.json non trovato, skip");
}

// Step 2: sync all-projects.json annotations from projects-index
const projectBySlug = {};
for (const p of projects) {
  projectBySlug[p.slug] = p;
}

let mergedCount = 0;
for (const ap of allProjects) {
  const slug = normalizeName(ap.name);
  const match = projectBySlug[slug];
  if (match) {
    ap._phase = match.phase;
    ap._state = match.state;
    ap._commercial_risk = match.commercial_risk;
    ap._revenue_eur = match.revenue_eur;
    ap._invoice_count = match.invoice_count;
    ap._ledger_status = match.ledger_status;
    mergedCount++;
  }
}
writeJson(DATA.allProjects, allProjects);
changelog.push(`all-projects.json: ${allProjects.length} progetti, ${mergedCount} arricchiti da projects-index`);

// Step 3: sync followup-items.json with projects-index.json
const projectBySlugFollowup = {};
for (const p of projects) {
  projectBySlugFollowup[p.slug] = p;
}

let followupUpdatedCount = 0;
for (const f of followups) {
  const match = projectBySlugFollowup[f.project_slug];
  if (!match) continue;
  let changed = false;
  if (match.next_action && match.next_action !== f.next_action) {
    f.next_action = match.next_action;
    f.title = match.next_action;
    changed = true;
  }
  if (match.phase && match.phase !== f.phase) {
    f.phase = match.phase;
    changed = true;
  }
  if (changed) {
    f.last_touch_at = new Date().toISOString();
    followupUpdatedCount++;
  }
}
if (followupUpdatedCount > 0) {
  writeJson(DATA.followups, followups);
  changelog.push(`followup-items.json: ${followupUpdatedCount} item aggiornati da projects-index`);
}

// Step 4: regenerate summary
const summary = {
  generated_at: new Date().toISOString(),
  projects_active: projects.filter((p) => p.state === "active").length,
  projects_closed: projects.filter((p) => p.state === "closed").length,
  projects_unclassified: allProjects.length - projects.length,
  followup_urgent: followups.filter((f) => f.status === "urgent").length,
  followup_pending: followups.filter((f) => f.status === "pending").length,
  followup_snooze: followups.filter((f) => f.status === "snooze").length,
  commercial_flags_high: projects.filter((p) => p.commercial_risk === "high").length,
  commercial_flags_medium: projects.filter((p) => p.commercial_risk === "medium").length,
  revenue_total_eur: projects.reduce((sum, p) => sum + (p.revenue_eur || 0), 0),
  invoices_total: projects.reduce((sum, p) => sum + (p.invoice_count || 0), 0),
  ledger_template_only_count: projects.filter((p) => p.ledger_status === "template-only").length,
};

writeJson(DATA.summary, summary);
changelog.push(`portfolio-summary.json rigenerato: ${summary.projects_active} attivi, ${summary.followup_urgent} urgent, ${summary.followup_pending} pending`);

// Step 5: validate all JSON files
const validationErrors = [];
for (const [key, dataPath] of Object.entries(DATA)) {
  try {
    readJson(dataPath);
    changelog.push(`${dataPath}: OK`);
  } catch (err) {
    validationErrors.push(`${dataPath}: ${err.message}`);
  }
}

if (validationErrors.length) {
  changelog.push("ERRORI validazione:");
  for (const e of validationErrors) changelog.push(`  - ${e}`);
} else {
  changelog.push("Tutti i JSON validi");
}

// Output
console.log("=== Sync Dashboard Report ===");
console.log(`Data: ${summary.generated_at}`);
console.log("");
for (const line of changelog) {
  console.log(`  ${line}`);
}
console.log("");
console.log("=== Fatto ===");
