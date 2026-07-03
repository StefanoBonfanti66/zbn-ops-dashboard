import fs from "node:fs";

const followups = JSON.parse(fs.readFileSync("app/data/followup-items.json", "utf8"));
const projects = JSON.parse(fs.readFileSync("app/data/projects-index.json", "utf8"));

const summary = {
  generated_at: new Date().toISOString(),
  projects_active: projects.filter(p => p.state === "active").length,
  projects_closed: 2,
  projects_unclassified: 15,
  followup_urgent: followups.filter(f => f.status === "urgent").length,
  followup_pending: followups.filter(f => f.status === "pending").length,
  followup_snooze: followups.filter(f => f.status === "snooze").length,
  commercial_flags_high: projects.filter(p => p.commercial_risk === "high").length,
  commercial_flags_medium: projects.filter(p => p.commercial_risk === "medium").length,
  revenue_total_eur: projects.reduce((sum, p) => sum + (p.revenue_eur || 0), 0),
  invoices_total: projects.reduce((sum, p) => sum + (p.invoice_count || 0), 0),
  ledger_template_only_count: projects.filter(p => p.ledger_status === "template-only").length
};

fs.writeFileSync("app/data/portfolio-summary.json", JSON.stringify(summary, null, 2) + "\n");
console.log("Updated app/data/portfolio-summary.json");
