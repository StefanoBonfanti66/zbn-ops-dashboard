export function applyProjectStatusToEntry(entry, acquisitionResult, mode) {
  if (acquisitionResult.status === "valid") {
    const r = acquisitionResult.record;
    const changed = [];
    if (r.state !== entry.state) {
      entry.state = r.state;
      changed.push("state");
    }
    if (r.phase !== entry.phase) {
      entry.phase = r.phase;
      changed.push("phase");
    }
    if (r.next_action !== entry.next_action) {
      entry.next_action = r.next_action;
      changed.push("next_action");
    }
    return { applied: "primary", changed };
  }
  if (acquisitionResult.status === "invalid") {
    return { applied: "preserved", reason: "primary_invalid", errors: acquisitionResult.errors || [] };
  }
  if (acquisitionResult.status === "unreadable") {
    return { applied: "preserved", reason: "primary_unreadable", errors: acquisitionResult.errors || [] };
  }
  if (acquisitionResult.status === "absent") {
    if (mode === "ci") return { applied: "absent_ci" };
    return { applied: "absent_local" };
  }
  if (acquisitionResult.status === "absent_unverified") {
    // Accessibilità non accertata - non trattare come assenza
    return { applied: "preserved", reason: "primary_absent_unverified", errors: acquisitionResult.errors || [] };
  }
  return { applied: "preserved", reason: "unknown" };
}
