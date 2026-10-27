function isString(x) {
  return typeof x === "string";
}

export function parseCurrentFocusLegacy(content) {
  const result = { state: null, phase: null, next_action: null, warnings: [], ambiguous: false };
  if (!isString(content)) return result;
  const lines = content.split("\n");
  const focusSections = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    // Match ## Current Focus (level 2 only as per boundary rule)
    if (/^##\s+Current Focus\b/i.test(l)) {
      // Find end of section at next heading level 1 or 2
      let j = i + 1;
      while (j < lines.length) {
        const nl = lines[j];
        // Stop at next ## or # heading (not inside code fence - simple check)
        if (/^```/.test(nl.trim())) {
          // skip code fence
          j++;
          while (j < lines.length && !/^```/.test(lines[j].trim())) j++;
          j++;
          continue;
        }
        if (/^##\s+/.test(nl) || /^#\s+/.test(nl)) {
          break;
        }
        j++;
      }
      focusSections.push({ start: i, end: j - 1, lines: lines.slice(i, j) });
      i = j;
      continue;
    }
    i++;
  }
  if (focusSections.length === 0) return result;
  if (focusSections.length > 1) {
    result.ambiguous = true;
    result.warnings.push("Più sezioni 'Current Focus' trovate nel documento; ambiguità rilevata, valori preservati.");
    return result;
  }
  const sectionLines = focusSections[0].lines;
  // Look for "Prossimo step" as label/title, not narrative
  for (let k = 0; k < sectionLines.length; k++) {
    const sl = sectionLines[k];
    // Skip if inside code fence
    if (/^```/.test(sl.trim())) {
      // skip fence
      k++;
      while (k < sectionLines.length && !/^```/.test(sectionLines[k].trim())) k++;
      continue;
    }
    // Match label line containing "Prossimo step"
    if (/\bProssimo step\b/i.test(sl)) {
      // Check if it's a label (has colon or is heading-like) not just narrative
      // Look for colon on same line
      const colonIdx = sl.indexOf(":");
      if (colonIdx >= 0) {
        const after = sl.slice(colonIdx + 1).trim();
        if (after !== "") {
          // Don't take if it's just another heading
          if (/^##?\s+/.test(after)) {
            // look next line
          } else {
            // Remove markdown markers but keep content
            const cleaned = after.replace(/^[-*+]\s+/, "").replace(/\*\*/g, "").replace(/__/g, "").trim();
            if (cleaned !== "" && !/^##?\s+/.test(cleaned)) {
              result.next_action = cleaned;
              break;
            }
          }
        }
      }
      // Look at next line
      for (let m = k + 1; m < sectionLines.length; m++) {
        const tl = sectionLines[m];
        if (/^```/.test(tl.trim())) {
          m++;
          while (m < sectionLines.length && !/^```/.test(sectionLines[m].trim())) m++;
          continue;
        }
        const trimmed = tl.trim();
        if (trimmed === "") continue;
        // Stop at next heading
        if (/^##\s+/.test(trimmed) || /^#\s+/.test(trimmed)) break;
        // Skip if it's another label/title
        if (/^[A-Z][^:\n]{2,30}:$/.test(trimmed)) break;
        // It's likely the action
        const cleaned = trimmed.replace(/^[-*+]\s+/, "").replace(/\*\*/g, "").replace(/__/g, "").trim();
        if (cleaned !== "") {
          result.next_action = cleaned;
          break;
        }
      }
      break;
    }
  }
  // Never infer state from "Bloccato"
  return result;
}
