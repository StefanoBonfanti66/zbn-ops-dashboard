import assert from "node:assert";
import { createGitHubAcquirer } from "../lib/project-status-acquire.js";
import { applyProjectStatusToEntry } from "../lib/project-status-apply.js";
import { parseCurrentFocusLegacy } from "../lib/project-status-parse-legacy.js";

let call = 0;
const gh = (args) => {
  call++;
  if (args.includes("contents/docs/project/project-status.json")) {
    return JSON.stringify({ message: "Not Found" });
  }
  if (args.includes("contents/docs/project")) {
    return JSON.stringify([
      { name: "kickoff-cliente.md", type: "file" },
      { name: "kickoff-interno.md", type: "file" }
    ]);
  }
  if (args.includes("contents/AGENTS.md")) {
    return JSON.stringify({
      content: Buffer.from("## Current Focus\n- Prossimo step: Fare X\nAltre cose\n").toString("base64")
    });
  }
  return JSON.stringify({ message: "Not Found" });
};

const acq = createGitHubAcquirer(gh);
const res = await acq("test-repo", "abc123def456");
assert.strictEqual(res.status, "absent");

const entry = { state: "oldstate", phase: "oldphase", next_action: "oldnext" };
const app = applyProjectStatusToEntry(entry, res, "ci");
assert.strictEqual(app.applied, "absent_ci");

const am = (() => {
  // simulate getAgentsMd
  const raw = gh("api repos/StefanoBonfanti66/test-repo/contents/AGENTS.md?ref=abc123def456");
  const data = JSON.parse(raw);
  const content = Buffer.from(data.content, "base64").toString("utf8");
  return { status: "ok", content };
})();
const parsed = parseCurrentFocusLegacy(am.content);
assert.strictEqual(parsed.next_action, "Fare X");
entry.next_action = parsed.next_action;

assert.strictEqual(entry.state, "oldstate");
assert.strictEqual(entry.phase, "oldphase");
console.log("PASS: integration ci absent confirmed via directory listing");

// directory check fails -> unreadable
{
  let call = 0;
  const gh = (args) => {
    call++;
    if (args.includes("contents/docs/project/project-status.json")) {
      return JSON.stringify({ message: "Not Found" });
    }
    if (args.includes("contents/docs/project")) {
      return JSON.stringify({ message: "Not Found" });
    }
    if (args.includes("contents/docs")) {
      return JSON.stringify({ message: "Not Found" });
    }
    return JSON.stringify({ message: "Not Found" });
  };
  const acq = createGitHubAcquirer(gh);
  const res = await acq("test-repo", "abc123def456");
  assert.strictEqual(res.status, "unreadable");
  console.log("PASS: directory/tree check failed -> unreadable");
}

// file listed but not retrievable
{
  const gh = (args) => {
    if (args.includes("contents/docs/project/project-status.json")) {
      return JSON.stringify({ message: "Not Found" });
    }
    if (args.includes("contents/docs/project")) {
      return JSON.stringify([
        { name: "project-status.json", type: "file" }
      ]);
    }
    return JSON.stringify({ message: "Not Found" });
  };
  const acq = createGitHubAcquirer(gh);
  const res = await acq("test-repo", "abc123def456");
  assert.strictEqual(res.status, "unreadable");
  console.log("PASS: file listed but not retrievable -> unreadable");
}
