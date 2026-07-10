import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function run(script) {
  console.log(`\n=== Running scripts/${script} ===`);
  execSync(`node scripts/${script}`, { cwd: root, stdio: "inherit" });
}

const isCI = process.argv.includes("--ci");

console.log(`Dashboard refresh (${isCI ? "CI mode" : "local mode"})`);

// Step 1: Discover repos (local fs or GitHub API)
run(isCI ? "gh-discover-repos.mjs" : "discover-repos.mjs");

// Step 2: Enrich all-projects + regenerate summary + validate
run("sync-from-projects.mjs");

// Step 3: Build pages
run("build-pages.mjs");

console.log("\n=== Dashboard refresh complete ===");
