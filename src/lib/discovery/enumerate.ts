import * as k8s from "@kubernetes/client-node";
import type { ResourceTypeInfo } from "./types";
import { EXCLUDED_RESOURCE_KINDS } from "./types";
import { withTlsSkip } from "@/lib/tls-utils";

/**
 * List all available API resource types (cluster-scoped).
 * Filters out excluded system resource kinds.
 */
export async function enumerateResourceTypes(
  kc: k8s.KubeConfig,
): Promise<ResourceTypeInfo[]> {
  const result: ResourceTypeInfo[] = [];

  // Fetch all API groups
  const apisApi = kc.makeApiClient(k8s.ApisApi);
  const coreApi = kc.makeApiClient(k8s.CoreApi);

  // Core API (v1)
  try {
    const coreVersions = await coreApi.getAPIVersions();
    for (const version of coreVersions.versions ?? []) {
      const resources = await fetchResourcesForGroupVersion(kc, "", version);
      result.push(...resources);
    }
  } catch {
    // Core API might fail in some environments
  }

  // Named API groups — enumerate ALL versions to find resources that
  // only exist in non-preferred versions (e.g., Snapshot in v1alpha1
  // when preferred is v1beta2)
  try {
    const groups = await apisApi.getAPIVersions();
    const seenKinds = new Set<string>();

    for (const group of groups.groups ?? []) {
      // Preferred version first, then remaining versions
      const allVersions = (group.versions ?? []).map((v) => v.groupVersion);
      const preferred = group.preferredVersion?.groupVersion;
      const ordered = preferred
        ? [preferred, ...allVersions.filter((v) => v !== preferred)]
        : allVersions;

      for (const gv of ordered) {
        const [groupName, version] = gv.includes("/")
          ? gv.split("/")
          : ["", gv];

        const resources = await fetchResourcesForGroupVersion(
          kc,
          groupName,
          version,
        );

        // Deduplicate by kind — prefer the version we see first (preferred)
        for (const r of resources) {
          const kindKey = `${r.group}/${r.kind}`;
          if (!seenKinds.has(kindKey)) {
            seenKinds.add(kindKey);
            result.push(r);
          }
        }
      }
    }
  } catch {
    // API groups fetch might fail
  }

  // Filter
  return result.filter(
    (r) =>
      r.namespaced &&
      !EXCLUDED_RESOURCE_KINDS.has(r.kind) &&
      !r.resource.includes("/"), // skip subresources like pods/log
  );
}

async function fetchResourcesForGroupVersion(
  kc: k8s.KubeConfig,
  group: string,
  version: string,
): Promise<ResourceTypeInfo[]> {
  const cluster = kc.getCurrentCluster();
  const server = cluster?.server ?? "";
  const path = group
    ? `/apis/${group}/${version}`
    : `/api/${version}`;

  const opts: Record<string, unknown> = {};
  await kc.applyToFetchOptions(opts);

  try {
    const res = await withTlsSkip(!!cluster?.skipTLSVerify, () =>
      fetch(`${server}${path}`, {
        headers: opts.headers as Record<string, string>,
      }),
    );
    if (!res.ok) return [];

    const data = (await res.json()) as {
      resources?: {
        name: string;
        kind: string;
        namespaced: boolean;
        verbs?: string[];
      }[];
    };

    return (data.resources ?? [])
      .filter(
        (r) =>
          r.verbs?.includes("list") &&
          !r.name.includes("/"), // skip subresources
      )
      .map((r) => ({
        apiVersion: group ? `${group}/${version}` : version,
        kind: r.kind,
        group,
        version,
        resource: r.name,
        namespaced: r.namespaced,
      }));
  } catch {
    return [];
  }
}
