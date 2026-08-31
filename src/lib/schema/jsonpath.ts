import { JSONPath } from "jsonpath-plus";

// Auto-prefix $ so existing schema paths (e.g. "metadata.name") keep working
// alongside full JSONPath expressions (e.g. "$.status.conditions[?(@.type=='Released')].reason").
function normalize(path: string): string {
  if (path.startsWith("$")) return path;
  return `$.${path}`;
}

/** Extract all matching values from an object using a JSONPath expression. */
export function extractValues(obj: unknown, path: string): unknown[] {
  try {
    const result = JSONPath({ path: normalize(path), json: obj as object });
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

/** Extract a single value. Returns the first match, or undefined. */
export function extractValue(obj: unknown, path: string): unknown {
  const result = extractValues(obj, path);
  return result.length > 0 ? result[0] : undefined;
}
