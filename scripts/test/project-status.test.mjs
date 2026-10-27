import assert from "node:assert";
import { validateProjectStatusRecord } from "../lib/project-status-validate.js";
import { parseCurrentFocusLegacy } from "../lib/project-status-parse-legacy.js";
import { applyProjectStatusToEntry } from "../lib/project-status-apply.js";
import { acquireFromLocal, createGitHubAcquirer } from "../lib/project-status-acquire.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

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

// Validation tests
test("valid record", () => {
  const r = validateProjectStatusRecord({
    schema_version: 1,
    updated_at: "2026-10-27T10:00:00Z",
    state: "active",
    phase: "Validazione",
    next_action: "fare X"
  });
  assert.strictEqual(r.valid, true);
});

test("pending rejected", () => {
  const r = validateProjectStatusRecord({
    schema_version: 1,
    updated_at: "2026-10-27T10:00:00Z",
    state: "pending",
    phase: "X",
    next_action: ""
  });
  assert.strictEqual(r.valid, false);
});

test("next_action empty explicit valid", () => {
  const r = validateProjectStatusRecord({
    schema_version: 1,
    updated_at: "2026-10-27T10:00:00Z",
    state: "active",
    phase: "X",
    next_action: ""
  });
  assert.strictEqual(r.valid, true);
});

test("next_action missing invalid", () => {
  const r = validateProjectStatusRecord({
    schema_version: 1,
    updated_at: "2026-10-27T10:00:00Z",
    state: "active",
    phase: "X"
  });
  assert.strictEqual(r.valid, false);
});

test("updated_at without timezone invalid", () => {
  const r = validateProjectStatusRecord({
    schema_version: 1,
    updated_at: "2026-10-27T10:00:00",
    state: "active",
    phase: "X",
    next_action: ""
  });
  assert.strictEqual(r.valid, false);
});

test("updated_at with offset valid", () => {
  const r = validateProjectStatusRecord({
    schema_version: 1,
    updated_at: "2026-10-27T11:00:00+01:00",
    state: "active",
    phase: "X",
    next_action: ""
  });
  assert.strictEqual(r.valid, true);
});

test("updated_at invalid date", () => {
  const r = validateProjectStatusRecord({
    schema_version: 1,
    updated_at: "2026-02-30T10:00:00Z",
    state: "active",
    phase: "X",
    next_action: ""
  });
  assert.strictEqual(r.valid, false);
});

// Parser tests
test("parse same line", () => {
  const content = "## Current Focus\nProssimo step: fare qualcosa\n";
  const p = parseCurrentFocusLegacy(content);
  assert.strictEqual(p.next_action, "fare qualcosa");
});

test("parse next line", () => {
  const content = "## Current Focus\nProssimo step:\n- fare qualcosa\n";
  const p = parseCurrentFocusLegacy(content);
  assert.strictEqual(p.next_action, "fare qualcosa");
});

test("duplicate focus ambiguous", () => {
  const content = "## Current Focus\nA\n## Current Focus\nB\n";
  const p = parseCurrentFocusLegacy(content);
  assert.strictEqual(p.ambiguous, true);
});

test("blocco fuori contesto non dedotto", () => {
  const content = "## Current Focus\nNessuna azione\n\nBloccato per test\n";
  const p = parseCurrentFocusLegacy(content);
  assert.strictEqual(p.state, null);
});

test("heading successivo non acquisito", () => {
  const content = "## Current Focus\nProssimo step:\nAltro titolo:\nazione\n";
  const p = parseCurrentFocusLegacy(content);
  // dovrebbe fermarsi o non acquisire come heading
  assert.ok(p.next_action === null || p.next_action !== "Altro titolo:");
});

// Apply tests
test("apply primary valid", () => {
  const entry = { state: "pending", phase: "X", next_action: "old" };
  const res = applyProjectStatusToEntry(entry, {
    status: "valid",
    record: { state: "active", phase: "Y", next_action: "new" }
  }, "local");
  assert.strictEqual(res.applied, "primary");
  assert.strictEqual(entry.state, "active");
  assert.strictEqual(entry.next_action, "new");
});

test("apply invalid preserves", () => {
  const entry = { state: "pending", phase: "X", next_action: "old" };
  const res = applyProjectStatusToEntry(entry, { status: "invalid", errors: ["err"] }, "local");
  assert.strictEqual(res.applied, "preserved");
  assert.strictEqual(entry.state, "pending");
});

test("apply unreadable preserves", () => {
  const entry = { state: "active", phase: "X", next_action: "old" };
  const res = applyProjectStatusToEntry(entry, { status: "unreadable" }, "local");
  assert.strictEqual(res.applied, "preserved");
  assert.strictEqual(entry.next_action, "old");
});

test("apply absent local", () => {
  const entry = { state: "active", phase: "X", next_action: "old" };
  const res = applyProjectStatusToEntry(entry, { status: "absent" }, "local");
  assert.strictEqual(res.applied, "absent_local");
});

test("apply absent ci", () => {
  const entry = { state: "active", phase: "X", next_action: "old" };
  const res = applyProjectStatusToEntry(entry, { status: "absent" }, "ci");
  assert.strictEqual(res.applied, "absent_ci");
});

// GitHub acquire tests
test("github acquire absent via object error", async () => {
  const gh = () => ({ __gh_error: true, message: "Not Found" });
  const acq = createGitHubAcquirer(gh);
  const r = await acq("test-repo");
  assert.strictEqual(r.status, "unreadable");
  assert.strictEqual(r.reason, "absent_unverified");
});

test("github acquire auth error", async () => {
  const gh = () => ({ __gh_error: true, message: "Forbidden" });
  const acq = createGitHubAcquirer(gh);
  const r = await acq("test-repo");
  assert.strictEqual(r.status, "unreadable");
  assert.strictEqual(r.reason, "auth_forbidden");
});

test("github acquire network error null", async () => {
  const gh = () => null;
  const acq = createGitHubAcquirer(gh);
  const r = await acq("test-repo");
  assert.strictEqual(r.status, "unreadable");
});

test("github acquire same ref passed", async () => {
  let receivedArgs = null;
  const gh = (args) => { receivedArgs = args; return JSON.stringify({ message: "Not Found" }); };
  const acq = createGitHubAcquirer(gh);
  await acq("test-repo", "abc123");
  assert.ok(receivedArgs.includes("ref=abc123"));
});

test("github acquire valid", async () => {
  const content = Buffer.from(JSON.stringify({
    schema_version: 1,
    updated_at: "2026-10-27T10:00:00Z",
    state: "active",
    phase: "X",
    next_action: ""
  })).toString("base64");
  const gh = () => JSON.stringify({ content });
  const acq = createGitHubAcquirer(gh);
  const r = await acq("test-repo");
  assert.strictEqual(r.status, "valid");
});

// Local acquire tests
test("local acquire absent", () => {
  const r = acquireFromLocal("/nonexistent/path/12345");
  assert.strictEqual(r.status, "absent");
});

test("github acquire 404 with unreadable reason absent_unverified", async () => {
  const gh = () => ({ __gh_error: true, message: "404 Not Found" });
  const acq = createGitHubAcquirer(gh);
  const r = await acq("test-repo", "sha123");
  assert.strictEqual(r.status, "unreadable");
  assert.strictEqual(r.reason, "absent_unverified");
});

test("github acquire absent confirmed string message -> unreadable", async () => {
  const gh = () => JSON.stringify({ message: "Not Found" });
  const acq = createGitHubAcquirer(gh);
  const r = await acq("test-repo");
  assert.strictEqual(r.status, "unreadable");
  assert.strictEqual(r.reason, "absent_unverified");
});

test("apply preserves on unreadable with absent_unverified reason", () => {
  const entry = { state: "active", phase: "X", next_action: "old" };
  const res = applyProjectStatusToEntry(entry, { status: "unreadable", reason: "absent_unverified", errors: ["Not Found"] }, "ci");
  assert.strictEqual(res.applied, "preserved");
  assert.strictEqual(res.reason, "primary_unreadable");
  assert.strictEqual(entry.next_action, "old");
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

// Integration test: CI path with confirmed absent
test("integration ci absent confirmed via directory listing", async () => {
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
});
