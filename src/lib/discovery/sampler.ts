import * as k8s from "@kubernetes/client-node";
import type { ResourceTypeInfo, ResourceSample } from "./types";
import { extractStringFields } from "./utils";

/**
 * Fetch N sample instances of each resource type from a namespace.
 * Extracts label keys, annotation keys, and field paths for analysis.
 */
export async function sampleResources(
  kc: k8s.KubeConfig,
  namespace: string,
  resourceTypes: ResourceTypeInfo[],
  samplesPerType = 20,
): Promise<ResourceSample[]> {
  const results: ResourceSample[] = [];

  // Fetch in parallel batches (concurrency limit)
  const BATCH_SIZE = 5;

  for (let i = 0; i < resourceTypes.length; i += BATCH_SIZE) {
    const batch = resourceTypes.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((type) =>
        fetchSample(kc, namespace, type, samplesPerType),
      ),
    );
    results.push(...batchResults.filter((r): r is ResourceSample => r !== null));
  }

  return results;
}

async function fetchSample(
  kc: k8s.KubeConfig,
  namespace: string,
  type: ResourceTypeInfo,
  limit: number,
): Promise<ResourceSample | null> {
  const server = kc.getCurrentCluster()?.server ?? "";
  const groupPath = type.group
    ? `apis/${type.group}/${type.version}`
    : `api/${type.version}`;
  const url = `${server}/${groupPath}/namespaces/${namespace}/${type.resource}?limit=${limit}`;

  const opts: Record<string, unknown> = {};
  await kc.applyToFetchOptions(opts);

  try {
    const res = await fetch(url, {
      headers: opts.headers as Record<string, string>,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { items?: unknown[] };
    const instances = (data.items ?? []) as Record<string, unknown>[];

    if (instances.length === 0) return null;

    // Extract metadata about the samples
    const labelKeys = new Set<string>();
    const annotationKeys = new Set<string>();
    const fieldPaths = new Set<string>();

    for (const instance of instances) {
      const meta = instance.metadata as Record<string, unknown> | undefined;
      if (meta?.labels) {
        for (const key of Object.keys(
          meta.labels as Record<string, string>,
        )) {
          labelKeys.add(key);
        }
      }
      if (meta?.annotations) {
        for (const key of Object.keys(
          meta.annotations as Record<string, string>,
        )) {
          annotationKeys.add(key);
        }
      }

      // Extract field paths (from spec and status only)
      const specFields = instance.spec
        ? extractStringFields(instance.spec, "spec")
        : [];
      const statusFields = instance.status
        ? extractStringFields(instance.status, "status")
        : [];

      for (const [path] of [...specFields, ...statusFields]) {
        fieldPaths.add(path);
      }
    }

    return {
      type,
      instances,
      labelKeys: Array.from(labelKeys),
      annotationKeys: Array.from(annotationKeys),
      fieldPaths: Array.from(fieldPaths),
    };
  } catch {
    return null;
  }
}
