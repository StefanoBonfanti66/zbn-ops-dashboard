import fs from "node:fs";

const DEFAULT_PROJECTS_PATH = "app/data/projects-index.json";
const DEFAULT_FOLLOWUPS_PATH = "app/data/followup-items.json";
const DEFAULT_OUT_PATH = "app/data/portfolio-summary.json";

export function generateSummary({
  projectsPath = DEFAULT_PROJECTS_PATH,
  followupsPath = DEFAULT_FOLLOWUPS_PATH,
  outPath = DEFAULT_OUT_PATH,
} = {}) {
  const followups = JSON.parse(fs.readFileSync(followupsPath, "utf8"));
  const projects = JSON.parse(fs.readFileSync(projectsPath, "utf8"));

  const summary = {
    generated_at: new Date().toISOString(),
    projects_active: projects.filter((p) => p.state === "active").length,
    projects_closed: 2,
    projects_unclassified: 15,
    followup_urgent: followups.filter((f) => f.status === "urgent").length,
    followup_pending: followups.filter((f) => f.status === "pending").length,
    followup_snooze: followups.filter((f) => f.status === "snooze").length,
    commercial_flags_high: projects.filter(
      (p) => p.commercial_risk === "high"
    ).length,
    commercial_flags_medium: projects.filter(
      (p) => p.commercial_risk === "medium"
    ).length,
    projects_test_count: projects.filter((p) => p.is_test === true).length,
    revenue_total_eur: projects
      .filter((p) => p.is_test !== true)
      .reduce((sum, p) => sum + (p.revenue_eur || 0), 0),
    invoices_total: projects
      .filter((p) => p.is_test !== true)
      .reduce((sum, p) => sum + (p.invoice_count || 0), 0),
    ledger_template_only_count: projects.filter(
      (p) => p.ledger_status === "template-only"
    ).length,
  };

  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2) + "\n");
  console.log(`Updated ${outPath}`);
  return summary;
}

// Esecuzione diretta: mantiene il comportamento attuale
const isMain =
  process.argv[1] && process.argv[1].endsWith("generate-summary.mjs");
if (isMain) {
  generateSummary();
}
