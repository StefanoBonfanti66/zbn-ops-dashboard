import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { acquireFromLocal } from "./lib/project-status-acquire.js";
import { applyProjectStatusToEntry } from "./lib/project-status-apply.js";
import { parseCurrentFocusLegacy } from "./lib/project-status-parse-legacy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const PROJECTS_DIR = process.env.ZBN_PROJECTS_ROOT
  ? path.resolve(process.env.ZBN_PROJECTS_ROOT)
  : path.resolve(os.homedir(), "Scrivania", "Progetti");

function readJson(absPath) {
  return JSON.parse(fs.readFileSync(absPath, "utf8"));
}

function writeJson(absPath, data) {
  fs.writeFileSync(absPath, JSON.stringify(data, null, 2) + "\n");
}

function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9_]+/g, "-").replace(/^-|-$/g, "");
}

function parseAgentsMd(content) {
  // Rimosso - non più utilizzato
  return { next_action: null, last_focus_date: null, has_bloccato: false };
}

function getGitData(repoPath) {
  try {
    const hash = execSync("git log -1 --format=%H", { cwd: repoPath }).toString().trim();
    const relative = execSync("git log -1 --format=%ar", { cwd: repoPath }).toString().trim();
    return { last_commit: hash.slice(0, 7), last_commit_relative: relative };
  } catch {
    return { last_commit: null, last_commit_relative: null };
  }
}

console.log("=== Discover Repos (local) ===");

const allProjects = readJson(path.resolve(root, "app/data/all-projects.json"));
const projects = readJson(path.resolve(root, "app/data/projects-index.json"));

// Build slug → repo name from all-projects.json
const slugToRepo = {};
for (const r of allProjects) {
  slugToRepo[normalizeName(r.name)] = r.name;
}

// Secondary map: scan filesystem for folders that match ZBN slugs
const fsSlugToRepo = {};
if (fs.existsSync(PROJECTS_DIR)) {
  for (const folder of fs.readdirSync(PROJECTS_DIR)) {
    const folderSlug = normalizeName(folder);
    if (folderSlug) fsSlugToRepo[folderSlug] = folder;
  }
}

const changelog = [];
let updatedCount = 0;
let foundLocally = 0;

for (const entry of projects) {
  // Try all-projects mapping first, then filesystem scan
  let repoName = slugToRepo[entry.slug];
  if (!repoName) repoName = fsSlugToRepo[entry.slug];
  // Also try underscore/hyphen variants
  if (!repoName) {
    const altSlug = entry.slug.replace(/_/g, "-");
    repoName = slugToRepo[altSlug] || fsSlugToRepo[altSlug];
  }
  if (!repoName) {
    const altSlug2 = entry.slug.replace(/-/g, "_");
    repoName = slugToRepo[altSlug2] || fsSlugToRepo[altSlug2];
  }
  if (!repoName) continue;

  const repoPath = path.resolve(PROJECTS_DIR, repoName);
  if (!fs.existsSync(repoPath)) continue;

  foundLocally++;

  const git = getGitData(repoPath);
  if (git.last_commit) {
    if (entry.last_commit !== git.last_commit) {
      changelog.push(`${entry.slug}: commit ${entry.last_commit || "?"} → ${git.last_commit} (${git.last_commit_relative})`);
      entry.last_commit = git.last_commit;
      entry.last_commit_relative = git.last_commit_relative;
    }
  }
  // Fonte primaria
  const acq = acquireFromLocal(repoPath);
  const app = applyProjectStatusToEntry(entry, acq, "local");
  if (app.applied === "primary") {
    changelog.push(`${entry.slug}: aggiornato da docs/project/project-status.json (${(app.changed || []).join(",")})`);
  } else if (app.applied === "preserved") {
    if (app.reason === "primary_invalid") {
      console.warn(`[discover-repos] ${entry.slug}: project-status.json presente ma invalido - valori esistenti preservati`);
      if (app.errors) app.errors.forEach((e) => console.warn(`  - ${e}`));
    } else if (app.reason === "primary_unreadable") {
      console.warn(`[discover-repos] ${entry.slug}: errore lettura project-status.json - valori esistenti preservati`);
    }
  } else if (app.applied === "absent_local") {
    // fallback legacy delimitato solo a Current Focus
    const agentsPath = path.resolve(repoPath, "AGENTS.md");
    try {
      if (fs.existsSync(agentsPath)) {
        const content = fs.readFileSync(agentsPath, "utf8");
        const parsed = parseCurrentFocusLegacy(content);
        if (parsed.ambiguous) {
          console.warn(`[discover-repos] ${entry.slug}: Current Focus ambiguo - valori esistenti preservati`);
        } else if (parsed.next_action !== null && parsed.next_action !== entry.next_action) {
          changelog.push(`${entry.slug}: next_action "${entry.next_action}" → "${parsed.next_action}" (fallback legacy)`);
          entry.next_action = parsed.next_action;
        }
        // NON dedurre stato da Bloccato
      }
    } catch (e) {
      console.warn(`[discover-repos] ${entry.slug}: errore lettura AGENTS.md - valori esistenti preservati`);
    }
  }

  updatedCount++;
}

writeJson(path.resolve(root, "app/data/projects-index.json"), projects);

changelog.unshift(`Repo locali trovati: ${foundLocally}/${projects.length} ZBN`);
changelog.push(`projects-index aggiornato: ${updatedCount} progetti`);

console.log("");
for (const line of changelog) {
  console.log(`  ${line}`);
}
