import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGitHubAcquirer } from "./lib/project-status-acquire.js";
import { applyProjectStatusToEntry } from "./lib/project-status-apply.js";
import { parseCurrentFocusLegacy } from "./lib/project-status-parse-legacy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function readJson(absPath) {
  return JSON.parse(fs.readFileSync(absPath, "utf8"));
}

function writeJson(absPath, data) {
  fs.writeFileSync(absPath, JSON.stringify(data, null, 2) + "\n");
}

function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9_]+/g, "-").replace(/^-|-$/g, "");
}

function gh(args) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const cmd = `gh ${args}`;
  try {
    const env = { ...process.env };
    return execSync(cmd, { encoding: "utf8", env, maxBuffer: 1024 * 1024 }).trim();
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : "";
    const stdout = err.stdout ? err.stdout.toString() : "";
    const msg = (stderr || stdout || err.message || "").toLowerCase();
    console.warn(`  gh failed: ${cmd} — ${err.message}`);
    // Restituisce oggetto strutturato per permettere distinzione
    return { __gh_error: true, message: msg, raw: stderr || stdout || err.message };
  }
}

const acquireFromGitHub = createGitHubAcquirer(gh);

function parseAgentsMd(content) {
  return { next_action: null, last_focus_date: null, has_bloccato: false };
}

let repoRefCache = {};

function getRepoRef(repoName) {
  if (repoRefCache[repoName]) return repoRefCache[repoName];
  const fullName = `StefanoBonfanti66/${repoName}`;
  const raw = gh(`api repos/${fullName}/commits?per_page=1`);
  if (raw === null || (typeof raw === "object" && raw.__gh_error)) {
    repoRefCache[repoName] = null;
    return null;
  }
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data) && data[0] && data[0].sha) {
      repoRefCache[repoName] = data[0].sha;
      return repoRefCache[repoName];
    }
  } catch {}
  repoRefCache[repoName] = null;
  return null;
}

function getRepoInfo(repoName) {
  const fullName = `StefanoBonfanti66/${repoName}`;

  const commit = gh(`api repos/${fullName}/commits?per_page=1`);
  if (!commit) return null;

  const data = JSON.parse(commit);
  if (!data.length) return null;

  const sha = data[0].sha.slice(0, 7);
  const date = data[0].commit.author.date;

  const seconds = (Date.now() - new Date(date).getTime()) / 1000;
  let relative;
  if (seconds < 60) relative = `${Math.round(seconds)} secondi fa`;
  else if (seconds < 3600) relative = `${Math.round(seconds / 60)} minuti fa`;
  else if (seconds < 86400) relative = `${Math.round(seconds / 3600)} ore fa`;
  else if (seconds < 2592000) relative = `${Math.round(seconds / 86400)} giorni fa`;
  else if (seconds < 31536000) relative = `${Math.round(seconds / 2592000)} mesi fa`;
  else relative = `${Math.round(seconds / 31536000)} anni fa`;

  return { last_commit: sha, last_commit_relative: relative };
}

function getAgentsMd(repoName, ref) {
  const fullName = `StefanoBonfanti66/${repoName}`;
  const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const raw = gh(`api repos/${fullName}/contents/AGENTS.md${refQuery}`);
  if (raw === null) return { status: "error" };
  if (typeof raw === "object" && raw.__gh_error) {
    const msg = String(raw.message || "").toLowerCase();
    if (msg.includes("not found") || msg.includes("404")) return { status: "absent" };
    if (msg.includes("forbidden") || msg.includes("unauthorized") || msg.includes("401") || msg.includes("403")) {
      return { status: "api_error", message: raw.message, reason: "auth_forbidden" };
    }
    return { status: "api_error", message: raw.message };
  }
  try {
    const data = JSON.parse(raw);
    if (data.message) {
      const msg = String(data.message).toLowerCase();
      if (msg.includes("not found")) return { status: "absent" };
      if (msg.includes("forbidden") || msg.includes("unauthorized")) return { status: "api_error", message: data.message, reason: "auth_forbidden" };
      return { status: "api_error", message: data.message };
    }
    if (data.content) {
      return { status: "ok", content: Buffer.from(data.content, "base64").toString("utf8") };
    }
    return { status: "api_error", message: "no content" };
  } catch (e) {
    return { status: "api_error", message: e.message };
  }
}

console.log("=== Discover Repos (CI/GitHub API) ===");

const allProjects = readJson(path.resolve(root, "app/data/all-projects.json"));
const projects = readJson(path.resolve(root, "app/data/projects-index.json"));

const slugToRepo = {};
for (const r of allProjects) {
  slugToRepo[normalizeName(r.name)] = r.name;
}

const changelog = [];
let updatedCount = 0;
let foundRemotely = 0;

for (const entry of projects) {
  let repoName = slugToRepo[entry.slug];
  if (!repoName) {
    const altSlug = entry.slug.replace(/_/g, "-");
    repoName = slugToRepo[altSlug];
  }
  if (!repoName) {
    const altSlug2 = entry.slug.replace(/-/g, "_");
    repoName = slugToRepo[altSlug2];
  }
  if (!repoName) repoName = entry.slug; // fallback: slug=repo name

  const info = getRepoInfo(repoName);
  if (!info) {
    changelog.push(`${entry.slug}: SKIP (no API data)`);
    continue;
  }

  foundRemotely++;

  if (entry.last_commit !== info.last_commit) {
    changelog.push(`${entry.slug}: commit ${entry.last_commit || "?"} → ${info.last_commit} (${info.last_commit_relative})`);
    entry.last_commit = info.last_commit;
    entry.last_commit_relative = info.last_commit_relative;
  }

  // Fonte primaria via API (indipendente da AGENTS.md) con stesso ref
  const ref = getRepoRef(repoName);
  const acqPrim = await acquireFromGitHub(repoName, ref);
  const appPrim = applyProjectStatusToEntry(entry, acqPrim, "ci");
  if (appPrim.applied === "primary") {
    changelog.push(`${entry.slug}: aggiornato da docs/project/project-status.json (API) (${(appPrim.changed || []).join(",")})`);
  } else if (appPrim.applied === "preserved") {
    if (appPrim.reason === "primary_invalid") {
      console.warn(`[gh-discover-repos] ${entry.slug}: project-status.json (API) presente ma invalido - valori esistenti preservati`);
      if (appPrim.errors) appPrim.errors.forEach((e) => console.warn(`  - ${e}`));
    } else if (appPrim.reason === "primary_unreadable") {
      console.warn(`[gh-discover-repos] ${entry.slug}: errore lettura project-status.json (API) - valori esistenti preservati`);
    } else if (appPrim.reason === "primary_absent_unverified") {
      console.warn(`[gh-discover-repos] ${entry.slug}: accessibilità non accertata - file non classificato come assente, valori preservati`);
    }
    // assente accertato -> fallback legacy
  } else if (appPrim.applied === "absent_ci") {
    // Fallback legacy solo se assenza accertata di project-status.json
    if (!ref) {
      console.warn(`[gh-discover-repos] ${entry.slug}: ref non acquisibile - accessibilità non accertata, AGENTS.md non letto per fallback`);
    } else {
      const am = getAgentsMd(repoName, ref);
      if (am.status === "ok" && am.content) {
        const parsed = parseCurrentFocusLegacy(am.content);
        if (parsed.ambiguous) {
          console.warn(`[gh-discover-repos] ${entry.slug}: Current Focus ambiguo - valori esistenti preservati`);
        } else if (parsed.next_action !== null && parsed.next_action !== entry.next_action) {
          changelog.push(`${entry.slug}: next_action "${entry.next_action}" → "${parsed.next_action}" (fallback legacy API)`);
          entry.next_action = parsed.next_action;
        }
        // NON dedurre stato da Bloccato
      } else if (am.status === "api_error") {
        console.warn(`[gh-discover-repos] ${entry.slug}: errore recupero AGENTS.md (API) - valori esistenti preservati`);
      }
    }
  }

  updatedCount++;
}

writeJson(path.resolve(root, "app/data/projects-index.json"), projects);

changelog.unshift(`Repo remoti trovati: ${foundRemotely}/${projects.length} ZBN`);
changelog.push(`projects-index aggiornato: ${updatedCount} progetti`);

console.log("");
for (const line of changelog) {
  console.log(`  ${line}`);
}
