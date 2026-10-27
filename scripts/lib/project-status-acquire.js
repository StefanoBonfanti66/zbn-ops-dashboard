import fs from "node:fs";
import path from "node:path";
import { validateProjectStatusRecord } from "./project-status-validate.js";

function tryReadFile(p) {
  try {
    const raw = fs.readFileSync(p, "utf8");
    return { ok: true, raw };
  } catch (e) {
    const code = e.code;
    if (code === "ENOENT") return { ok: false, reason: "absent", code };
    if (code === "EACCES" || code === "EPERM") return { ok: false, reason: "unreadable", code, error: e };
    return { ok: false, reason: "unreadable", code, error: e };
  }
}

export function acquireFromLocal(repoPath) {
  const p = path.resolve(repoPath, "docs/project/project-status.json");
  const r = tryReadFile(p);
  if (!r.ok) {
    if (r.reason === "absent") return { status: "absent", path: p };
    return { status: "unreadable", path: p, reason: r.reason, code: r.code, errors: [r.error?.message || String(r.error)] };
  }
  let j;
  try {
    j = JSON.parse(r.raw);
  } catch (e) {
    return { status: "invalid", path: p, errors: [`JSON non valido: ${e.message}`] };
  }
  const v = validateProjectStatusRecord(j);
  if (!v.valid) return { status: "invalid", path: p, errors: v.errors, record: j };
  return { status: "valid", path: p, record: j };
}

function parseApiJson(rawResp) {
  if (rawResp === null || rawResp === undefined) return { ok: false, reason: "null" };
  if (typeof rawResp === "object" && rawResp.structured) return { ok: true, structured: rawResp.structured };
  if (typeof rawResp === "object" && rawResp.__gh_error) return { ok: false, errorObj: rawResp };
  if (typeof rawResp === "string") {
    try {
      return { ok: true, data: JSON.parse(rawResp) };
    } catch (e) {
      return { ok: false, reason: "bad_json", error: e };
    }
  }
  return { ok: false, reason: "unknown" };
}

function checkDirectoryListing(ghWrapper, fullName, dirPath, ref) {
  // Try contents API for directory
  const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const args = `api repos/${fullName}/contents/${dirPath}${refQuery}`;
  try {
    const rawResp = ghWrapper(args);
    const parsed = parseApiJson(rawResp);
    if (!parsed.ok) {
      if (parsed.errorObj) {
        const msg = String(parsed.errorObj.message || "").toLowerCase();
        if (msg.includes("not found") || msg.includes("404")) return { ok: true, listing: null, missing: true };
        if (msg.includes("forbidden") || msg.includes("unauthorized") || msg.includes("401") || msg.includes("403")) return { ok: false, reason: "auth_forbidden" };
        return { ok: false, reason: "api_error", error: parsed.errorObj.message };
      }
      if (parsed.reason === "null") return { ok: false, reason: "api_error_unknown" };
      return { ok: false, reason: "api_error" };
    }
    if (parsed.structured) {
      // not expected here
      if (parsed.structured.status === "absent") return { ok: true, listing: null, missing: true };
      return { ok: false, reason: "unexpected" };
    }
    const data = parsed.data;
    if (data && data.message) {
      const msg = String(data.message).toLowerCase();
      if (msg.includes("not found")) return { ok: true, listing: null, missing: true };
      if (msg.includes("forbidden") || msg.includes("unauthorized")) return { ok: false, reason: "auth_forbidden" };
      return { ok: false, reason: "api_error" };
    }
    // If it's an array, it's a directory listing
    if (Array.isArray(data)) {
      // check if truncated? GitHub contents API may be truncated for large dirs; but for small dirs it's fine
      // be conservative: if we got array, it's a valid listing
      return { ok: true, listing: data };
    }
    // If it's an object (file), not a directory listing
    if (data && typeof data === "object" && data.type === "file") {
      return { ok: true, listing: [], isFile: true }; // directory not found as expected? treat as missing dir
    }
    return { ok: false, reason: "unexpected" };
  } catch (e) {
    return { ok: false, reason: "api_error", error: e.message };
  }
}

function isFileInListing(listing, filename) {
  if (!Array.isArray(listing)) return false;
  for (const item of listing) {
    if (item && item.name === filename) return true;
  }
  return false;
}

// GitHub client must be injectable for testing; ghWrapper returns structured result
export function createGitHubAcquirer(ghWrapper) {
  return async function acquireFromGitHub(repoName, ref) {
    const fullName = `StefanoBonfanti66/${repoName}`;
    const pathFile = "docs/project/project-status.json";
    const filename = "project-status.json";
    const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const args = `api repos/${fullName}/contents/${pathFile}${refQuery}`;
    let rawResp;
    try {
      rawResp = ghWrapper(args);
    } catch (e) {
      return { status: "unreadable", path: pathFile, reason: "api_error", errors: [e.message] };
    }
    if (rawResp === null || rawResp === undefined) {
      return { status: "unreadable", path: pathFile, reason: "api_error_unknown" };
    }
    // If wrapper returns object with structured info
    if (typeof rawResp === "object" && rawResp.structured) {
      return rawResp.structured;
    }
    if (typeof rawResp === "object" && rawResp.__gh_error) {
      const msg = String(rawResp.message || "").toLowerCase();
      if (msg.includes("not found") || msg.includes("404")) {
        // Verify absence by checking directory tree at same SHA
        if (!ref) {
          return { status: "unreadable", path: pathFile, reason: "absent_unverified", errors: [rawResp.message || "Not Found"] };
        }
        // Try docs/project first
        let dirCheck = checkDirectoryListing(ghWrapper, fullName, "docs/project", ref);
        if (!dirCheck.ok) {
          // try docs as fallback
          if (dirCheck.reason === "auth_forbidden" || dirCheck.reason === "api_error") {
            return { status: "unreadable", path: pathFile, reason: dirCheck.reason === "auth_forbidden" ? "auth_forbidden" : "api_error", errors: [dirCheck.error || "directory check failed"] };
          }
          // try parent
          dirCheck = checkDirectoryListing(ghWrapper, fullName, "docs", ref);
          if (!dirCheck.ok) {
            if (dirCheck.reason === "auth_forbidden") return { status: "unreadable", path: pathFile, reason: "auth_forbidden", errors: [dirCheck.error] };
            return { status: "unreadable", path: pathFile, reason: "api_error", errors: [dirCheck.error || "directory check failed"] };
          }
        }
        if (dirCheck.ok && dirCheck.missing) {
          // directory missing - cannot be certain file is missing vs dir missing? but we need to be certain
          // try to go up or be conservative
          // check docs
          const docsCheck = checkDirectoryListing(ghWrapper, fullName, "docs", ref);
          if (!docsCheck.ok || docsCheck.missing) {
            return { status: "unreadable", path: pathFile, reason: "absent_unverified", errors: ["directory verification incomplete"] };
          }
          // docs exists but docs/project missing - file definitely not present
          if (Array.isArray(docsCheck.listing)) {
            // look for 'project' dir
            const hasProject = docsCheck.listing.some((i) => i && i.name === "project" && i.type === "dir");
            if (!hasProject) {
              return { status: "absent", path: pathFile };
            }
          }
          return { status: "unreadable", path: pathFile, reason: "absent_unverified", errors: ["directory verification incomplete"] };
        }
        if (dirCheck.ok && Array.isArray(dirCheck.listing)) {
          // check if file is in listing
          if (isFileInListing(dirCheck.listing, filename)) {
            // file listed but not retrievable -> unreadable, not absent
            return { status: "unreadable", path: pathFile, reason: "api_error", errors: ["file listed but not retrievable"] };
          }
          // file not in listing -> confirmed absent
          return { status: "absent", path: pathFile };
        }
        if (dirCheck.ok && dirCheck.isFile) {
          return { status: "unreadable", path: pathFile, reason: "absent_unverified", errors: ["unexpected directory response"] };
        }
        return { status: "unreadable", path: pathFile, reason: "absent_unverified", errors: [rawResp.message || "Not Found"] };
      }
      if (msg.includes("forbidden") || msg.includes("unauthorized") || msg.includes("401") || msg.includes("403")) {
        return { status: "unreadable", path: pathFile, reason: "auth_forbidden", errors: [rawResp.message || "auth error"] };
      }
      return { status: "unreadable", path: pathFile, reason: "api_error", errors: [rawResp.message || "api error"] };
    }
    if (typeof rawResp === "string") {
      let data;
      try {
        data = JSON.parse(rawResp);
      } catch (e) {
        return { status: "unreadable", path: pathFile, errors: [`API response non JSON: ${e.message}`] };
      }
      if (data.message) {
        const msg = String(data.message).toLowerCase();
        if (msg.includes("not found")) {
          if (!ref) {
            return { status: "unreadable", path: pathFile, reason: "absent_unverified", errors: [data.message] };
          }
          let dirCheck = checkDirectoryListing(ghWrapper, fullName, "docs/project", ref);
          if (!dirCheck.ok) {
            if (dirCheck.reason === "auth_forbidden") return { status: "unreadable", path: pathFile, reason: "auth_forbidden", errors: [dirCheck.error] };
            // try parent
            dirCheck = checkDirectoryListing(ghWrapper, fullName, "docs", ref);
            if (!dirCheck.ok) {
              if (dirCheck.reason === "auth_forbidden") return { status: "unreadable", path: pathFile, reason: "auth_forbidden", errors: [dirCheck.error] };
              return { status: "unreadable", path: pathFile, reason: "api_error", errors: [dirCheck.error || "directory check failed"] };
            }
          }
          if (dirCheck.ok && dirCheck.missing) {
            const docsCheck = checkDirectoryListing(ghWrapper, fullName, "docs", ref);
            if (!docsCheck.ok || docsCheck.missing) {
              return { status: "unreadable", path: pathFile, reason: "absent_unverified", errors: ["directory verification incomplete"] };
            }
            if (Array.isArray(docsCheck.listing)) {
              const hasProject = docsCheck.listing.some((i) => i && i.name === "project" && i.type === "dir");
              if (!hasProject) {
                return { status: "absent", path: pathFile };
              }
            }
            return { status: "unreadable", path: pathFile, reason: "absent_unverified", errors: ["directory verification incomplete"] };
          }
          if (dirCheck.ok && Array.isArray(dirCheck.listing)) {
            if (isFileInListing(dirCheck.listing, filename)) {
              return { status: "unreadable", path: pathFile, reason: "api_error", errors: ["file listed but not retrievable"] };
            }
            return { status: "absent", path: pathFile };
          }
          if (dirCheck.ok && dirCheck.isFile) {
            return { status: "unreadable", path: pathFile, reason: "absent_unverified", errors: ["unexpected directory response"] };
          }
          return { status: "unreadable", path: pathFile, reason: "absent_unverified", errors: [data.message] };
        }
        if (msg.includes("forbidden") || msg.includes("unauthorized")) return { status: "unreadable", path: pathFile, reason: "auth_forbidden", errors: [data.message] };
        return { status: "unreadable", path: pathFile, reason: "api_error", errors: [data.message] };
      }
      if (!data.content) return { status: "unreadable", path: pathFile, errors: ["API response senza content"] };
      let content;
      try {
        content = Buffer.from(data.content, "base64").toString("utf8");
      } catch (e) {
        return { status: "unreadable", path: pathFile, errors: [`decodifica base64 fallita: ${e.message}`] };
      }
      let j;
      try {
        j = JSON.parse(content);
      } catch (e) {
        return { status: "invalid", path: pathFile, errors: [`JSON non valido: ${e.message}`] };
      }
      const v = validateProjectStatusRecord(j);
      if (!v.valid) return { status: "invalid", path: pathFile, errors: v.errors, record: j };
      return { status: "valid", path: pathFile, record: j };
    }
    return { status: "unreadable", path: pathFile, reason: "api_error_unknown" };
  };
}

// Backward compatible default using old gh behavior
export function acquireFromGitHub(repoName, gh) {
  return createGitHubAcquirer(gh)(repoName);
}
