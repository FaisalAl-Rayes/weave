import type {
  ResourceSample,
  NameIndex,
  LabelIndex,
} from "./types";
import { INFRASTRUCTURE_LABEL_PREFIXES as INFRA_PREFIXES } from "./types";

/**
 * Build an index of all resource names and UIDs for fast cross-reference lookups.
 */
export function buildNameIndex(samples: ResourceSample[]): NameIndex {
  const byName = new Map<string, { kind: string; name: string }[]>();
  const byUid = new Map<string, { kind: string; name: string }[]>();

  for (const sample of samples) {
    const kind = sample.type.kind;
    for (const instance of sample.instances) {
      const meta = (instance as Record<string, unknown>).metadata as
        | Record<string, unknown>
        | undefined;
      if (!meta) continue;

      const name = meta.name as string | undefined;
      const uid = meta.uid as string | undefined;

      if (name) {
        const entry = { kind, name };
        const existing = byName.get(name);
        if (existing) existing.push(entry);
        else byName.set(name, [entry]);
      }

      if (uid) {
        const entry = { kind, name: name ?? "" };
        const existing = byUid.get(uid);
        if (existing) existing.push(entry);
        else byUid.set(uid, [entry]);
      }
    }
  }

  return { byName, byUid };
}

/**
 * Build an inverted label index for correlation analysis.
 */
export function buildLabelIndex(samples: ResourceSample[]): LabelIndex {
  const byKey = new Map<
    string,
    Map<string, { kind: string; name: string }[]>
  >();

  for (const sample of samples) {
    const kind = sample.type.kind;
    for (const instance of sample.instances) {
      const meta = (instance as Record<string, unknown>).metadata as
        | Record<string, unknown>
        | undefined;
      if (!meta) continue;

      const name = (meta.name as string) ?? "";
      const labels = (meta.labels as Record<string, string>) ?? {};

      for (const [key, value] of Object.entries(labels)) {
        if (isInfrastructureLabel(key)) continue;

        let valueMap = byKey.get(key);
        if (!valueMap) {
          valueMap = new Map();
          byKey.set(key, valueMap);
        }

        const entry = { kind, name };
        const existing = valueMap.get(value);
        if (existing) existing.push(entry);
        else valueMap.set(value, [entry]);
      }
    }
  }

  return { byKey };
}

/**
 * Check if a label key is an infrastructure label (not useful for correlation).
 */
export function isInfrastructureLabel(key: string): boolean {
  return INFRA_PREFIXES.some(
    (prefix) => key === prefix || key.startsWith(prefix),
  );
}

/**
 * Extract all string field paths and their values from an object.
 * Returns [path, value] pairs. Handles nested objects and arrays.
 */
export function extractStringFields(
  obj: unknown,
  prefix = "",
  maxDepth = 6,
): [string, string][] {
  if (maxDepth <= 0) return [];
  const results: [string, string][] = [];

  if (obj === null || obj === undefined) return results;

  if (typeof obj === "string") {
    if (prefix && obj.length > 0 && obj.length < 256) {
      results.push([prefix, obj]);
    }
    return results;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      results.push(
        ...extractStringFields(item, `${prefix}[*]`, maxDepth - 1),
      );
    }
    // Deduplicate array paths (we only need one [*] not multiple)
    const seen = new Set<string>();
    return results.filter(([path]) => {
      if (seen.has(path)) return false;
      seen.add(path);
      return true;
    });
  }

  if (typeof obj === "object") {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Skip metadata (already handled), managedFields (noise), last-applied-config
      if (
        key === "managedFields" ||
        key === "kubectl.kubernetes.io/last-applied-configuration"
      ) {
        continue;
      }
      const path = prefix ? `${prefix}.${key}` : key;
      results.push(...extractStringFields(value, path, maxDepth - 1));
    }
  }

  return results;
}

/**
 * Convert a Kubernetes label key to a snake_case identifier name.
 * e.g., "tekton.dev/pipelineRun" → "pipelinerun_name"
 * Does NOT split camelCase — "pipelineRun" becomes "pipelinerun", not "pipeline_run".
 * This ensures consistency with kind-derived identifiers (PipelineRun → pipelinerun_name).
 */
export function labelKeyToIdentifierName(key: string): string {
  // Strip domain prefix (e.g., "tekton.dev/")
  const parts = key.split("/");
  const name = parts[parts.length - 1];

  // Lowercase without splitting camelCase, only replace separators
  const snake = name
    .replace(/[.-]/g, "_")
    .toLowerCase();

  return snake.endsWith("_name") || snake.endsWith("_uid")
    ? snake
    : `${snake}_name`;
}

/**
 * Convert a Kubernetes label key to a human-readable label.
 * e.g., "tekton.dev/pipelineRun" → "PipelineRun Name"
 */
export function labelKeyToLabel(key: string): string {
  const parts = key.split("/");
  const name = parts[parts.length - 1];

  // Split camelCase and capitalize
  const words = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ");

  return (
    words.charAt(0).toUpperCase() +
    words.slice(1) +
    (name.toLowerCase().endsWith("name") || name.toLowerCase().endsWith("uid")
      ? ""
      : " Name")
  );
}

/**
 * Get metadata.name from a Kubernetes object.
 */
export function getName(obj: unknown): string | undefined {
  const meta = (obj as Record<string, unknown>)?.metadata as
    | Record<string, unknown>
    | undefined;
  return meta?.name as string | undefined;
}

/**
 * Get metadata.labels from a Kubernetes object.
 */
export function getLabels(obj: unknown): Record<string, string> {
  const meta = (obj as Record<string, unknown>)?.metadata as
    | Record<string, unknown>
    | undefined;
  return (meta?.labels as Record<string, string>) ?? {};
}

/**
 * Get metadata.ownerReferences from a Kubernetes object.
 */
export function getOwnerRefs(
  obj: unknown,
): { kind: string; name: string; uid: string }[] {
  const meta = (obj as Record<string, unknown>)?.metadata as
    | Record<string, unknown>
    | undefined;
  return (
    (meta?.ownerReferences as { kind: string; name: string; uid: string }[]) ??
    []
  );
}
