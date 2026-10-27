import assert from "node:assert";
import { createGitHubAcquirer } from "../lib/project-status-acquire.js";

// directory check fails -> unreadable
{
  const gh = (args) => {
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
