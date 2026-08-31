import { extractValue } from "@/lib/schema/jsonpath";

/**
 * Apply a field_map to translate a raw response object into a canonical entity shape.
 *
 * field_map is: { canonical_path: response_path }
 * We read from response_path in the raw object and set at canonical_path in a new object.
 */
export function applyFieldMap(
  raw: unknown,
  fieldMap?: Record<string, string>,
): unknown {
  if (!fieldMap || Object.keys(fieldMap).length === 0) {
    return raw;
  }

  const result: Record<string, unknown> = {};

  const rawObj = raw as Record<string, unknown>;

  for (const [canonicalPath, responsePath] of Object.entries(fieldMap)) {
    // Try literal flat key first (e.g., Splunk returns "kubernetes.labels.foo" as a flat key)
    let value: unknown;
    if (typeof rawObj === "object" && rawObj !== null && responsePath in rawObj) {
      value = rawObj[responsePath];
    } else {
      value = extractValue(raw, responsePath);
    }
    if (value !== undefined) {
      setNestedValue(result, canonicalPath, value);
    }
  }

  return result;
}

/**
 * Set a value at a nested path in an object.
 * Handles dot notation and bracket notation with quoted keys.
 * Creates intermediate objects as needed.
 */
function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const segments = tokenizePath(path);
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (current[seg] === undefined || typeof current[seg] !== "object") {
      current[seg] = {};
    }
    current = current[seg] as Record<string, unknown>;
  }

  current[segments[segments.length - 1]] = value;
}

function tokenizePath(path: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < path.length) {
    if (path[i] === ".") {
      i++;
      continue;
    }

    if (path[i] === "[") {
      const close = path.indexOf("]", i);
      if (close === -1) break;
      const inner = path.slice(i + 1, close);
      if (
        (inner.startsWith("'") && inner.endsWith("'")) ||
        (inner.startsWith('"') && inner.endsWith('"'))
      ) {
        tokens.push(inner.slice(1, -1));
      } else {
        tokens.push(inner);
      }
      i = close + 1;
      continue;
    }

    let end = i;
    while (end < path.length && path[end] !== "." && path[end] !== "[") {
      end++;
    }
    tokens.push(path.slice(i, end));
    i = end;
  }

  return tokens;
}
