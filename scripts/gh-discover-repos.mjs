import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
    console.warn(`  gh failed: ${cmd} — ${err.message}`);
    return null;
  }
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

function getAgentsMd(repoName) {
  const fullName = `StefanoBonfanti66/${repoName}`;
  const raw = gh(`api repos/${fullName}/contents/AGENTS.md`);
  if (!raw) return null;

  try {
    const data = JSON.parse(raw);
    if (data.content) {
      return Buffer.from(data.content, "base64").toString("utf8");
    }
  } catch {
    return null;
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

  const agentsContent = getAgentsMd(repoName);
  if (agentsContent) {
    const parsed = parseAgentsMd(agentsContent);
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

changelog.unshift(`Repo remoti trovati: ${foundRemotely}/${projects.length} ZBN`);
changelog.push(`projects-index aggiornato: ${updatedCount} progetti`);

console.log("");
for (const line of changelog) {
  console.log(`  ${line}`);
}
