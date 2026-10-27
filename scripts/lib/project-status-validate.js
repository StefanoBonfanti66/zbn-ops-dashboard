export const PROJECT_STATUS_SCHEMA_VERSION = 1;
export const PROJECT_STATUS_ALLOWED_STATES = ["active", "blocked", "closed", "archived", "unknown"];

function isString(x) {
  return typeof x === "string";
}

function isInteger(x) {
  return Number.isInteger(x);
}

function hasExplicitTimezone(s) {
  // Must have Z or explicit offset like +01:00, -05:00, +0100
  return /[Zz]$|[+-]\d{2}:?\d{2}$/.test(s.trim());
}

function isValidIsoTimestamp(s) {
  const trimmed = s.trim();
  if (trimmed === "") return false;
  if (!hasExplicitTimezone(trimmed)) return false;
  // Basic ISO 8601 pattern with time
  // Must have date and time
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(trimmed)) return false;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return false;
  // Additional check for impossible dates
  // Extract parts to validate calendar
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):?(\d{2})?(?:\.(\d+))?/);
  if (!match) return false;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const hour = parseInt(match[4], 10);
  const min = parseInt(match[5], 10);
  const sec = match[6] ? parseInt(match[6], 10) : 0;
  // Basic range checks
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (hour < 0 || hour > 23) return false;
  if (min < 0 || min > 59) return false;
  if (sec < 0 || sec > 59) return false;
  // Check month lengths
  const daysInMonth = [31, (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > daysInMonth[month - 1]) return false;
  return true;
}

export function validateProjectStatusRecord(j) {
  const errors = [];
  if (!j || typeof j !== "object") {
    errors.push("record deve essere un oggetto");
    return { valid: false, errors };
  }
  if (!("schema_version" in j)) {
    errors.push("schema_version mancante");
  } else if (!isInteger(j.schema_version)) {
    errors.push("schema_version deve essere intero");
  } else if (j.schema_version !== PROJECT_STATUS_SCHEMA_VERSION) {
    errors.push(`schema_version non supportata (attesa ${PROJECT_STATUS_SCHEMA_VERSION})`);
  }

  if (!("updated_at" in j)) {
    errors.push("updated_at mancante");
  } else if (!isString(j.updated_at)) {
    errors.push("updated_at deve essere stringa");
  } else {
    if (!isValidIsoTimestamp(j.updated_at)) {
      errors.push("updated_at deve avere formato timestamp ISO 8601 con data, ora e timezone esplicita (Z o offset ±HH:MM)");
    }
  }

  if (!("state" in j)) {
    errors.push("state mancante");
  } else if (!isString(j.state)) {
    errors.push("state deve essere stringa");
  } else if (j.state === "") {
    errors.push("state vuoto (template non valido come record operativo)");
  } else if (!PROJECT_STATUS_ALLOWED_STATES.includes(j.state)) {
    errors.push(`state non ammesso (valori: ${PROJECT_STATUS_ALLOWED_STATES.join(", ")})`);
  }

  if (!("phase" in j)) {
    errors.push("phase mancante");
  } else if (!isString(j.phase)) {
    errors.push("phase deve essere stringa");
  } else if (j.phase.trim() === "") {
    errors.push("phase vuota dopo trim");
  }

  if (!("next_action" in j)) {
    errors.push("next_action mancante (deve essere presente anche se stringa vuota)");
  } else if (!isString(j.next_action)) {
    errors.push("next_action deve essere stringa");
  }

  return { valid: errors.length === 0, errors };
}
