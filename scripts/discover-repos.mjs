import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const PROJECTS_DIR = path.resolve(os.homedir(), "Scrivania", "Progetti");

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
  const result = { next_action: null, last_focus_date: null, has_bloccato: false };
  const lines = content.replace(/[*#_]+/g, "").split("\n");

  for (let i = 0; i < lines.length; i++) {
    if (/Prossimo step/.test(lines[i])) {
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (next) {
          result.next_action = next.replace(/^[-*]\s*/, "").trim();
          break;
        }
      }
      break;
    }
  }

  if (/\bBloccato\b/i.test(content)) result.has_bloccato = true;

  const m = content.match(/Current Focus[—–\-() ]*(\d{4}[-/]\d{2}[-/]\d{2})/i)
    || content.match(/Current Focus[—–\-() ]*(\d{2}[-/]\d{2}[-/]\d{4})/i);
  if (m) result.last_focus_date = m[1];

  return result;
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

  const agentsPath = path.resolve(repoPath, "AGENTS.md");
  if (fs.existsSync(agentsPath)) {
    const parsed = parseAgentsMd(fs.readFileSync(agentsPath, "utf8"));
    if (parsed.next_action) {
      if (entry.next_action !== parsed.next_action) {
        changelog.push(`${entry.slug}: next_action "${entry.next_action}" → "${parsed.next_action}"`);
        entry.next_action = parsed.next_action;
      }
    }
    const newState = parsed.has_bloccato ? "blocked" : "active";
    if (entry.state !== newState && (entry.state === "active" || entry.state === "blocked")) {
      changelog.push(`${entry.slug}: stato ${entry.state} → ${newState}`);
      entry.state = newState;
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
