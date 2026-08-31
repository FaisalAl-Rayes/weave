import * as k8s from "@kubernetes/client-node";
import type {
  ByIdentifierQuery,
  ConnectionConfig,
  ListNamespaceQuery,
  ListsByNamespace,
  ProviderCapability,
  ServesByIdentifier,
} from "./types";
import { withTlsSkip } from "@/lib/tls-utils";

// Cache KubeConfig + API clients per connection to avoid re-initialization
const clientCache = new Map<string, { kc: k8s.KubeConfig }>();

function getKubeConfig(
  url: string,
  auth?: ConnectionConfig["auth"],
): k8s.KubeConfig {
  const cacheKey = `${url}::${auth?.type ?? "none"}`;
  const cached = clientCache.get(cacheKey);
  if (cached) return cached.kc;

  const kc = new k8s.KubeConfig();

  if (auth?.type === "bearer" && auth.token) {
    kc.loadFromClusterAndUser(
      { name: "weave", server: url, skipTLSVerify: true },
      { name: "weave-user", token: auth.token },
    );
  } else if (auth?.type === "kubeconfig") {
    kc.loadFromDefault();
  } else {
    try {
      kc.loadFromCluster();
    } catch {
      kc.loadFromDefault();
    }
  }

  clientCache.set(cacheKey, { kc });
  return kc;
}

async function fetchK8s(
  kc: k8s.KubeConfig,
  url: string,
  labelSelector?: string,
  signal?: AbortSignal,
): Promise<unknown[]> {
  const fullUrl = labelSelector
    ? `${url}?labelSelector=${encodeURIComponent(labelSelector)}`
    : url;

  const opts: Record<string, unknown> = {};
  await kc.applyToFetchOptions(opts);

  const res = await withTlsSkip(
    !!kc.getCurrentCluster()?.skipTLSVerify,
    () => fetch(fullUrl, { headers: opts.headers as Record<string, string>, signal }),
  );

  if (!res.ok) return [];

  const raw = await res.json() as { items?: unknown[] };
  return Array.isArray(raw.items) ? raw.items : [];
}

export class KubernetesProvider implements ServesByIdentifier, ListsByNamespace {
  readonly type = "kubernetes";
  readonly capabilities: ReadonlySet<ProviderCapability> = new Set([
    "serve:by-identifier",
    "serve:list-namespace",
  ]);

  async serveByIdentifiers(
    _entityType: string,
    query: ByIdentifierQuery,
    connection: ConnectionConfig,
  ): Promise<unknown[]> {
    const { identifierType, values, entityK8sConfig, signal } = query;
    if (!entityK8sConfig?.endpoint || values.length === 0) return [];

    const selectorValue = entityK8sConfig.identifierSelectors?.[identifierType];
    if (!selectorValue) return [];
    const labelKeys = Array.isArray(selectorValue) ? selectorValue : [selectorValue];

    const kc = getKubeConfig(connection.url, connection.auth);
    const server = kc.getCurrentCluster()?.server ?? connection.url;

    // Cluster-scoped: remove {namespace} placeholder for cross-namespace queries
    const endpoint = entityK8sConfig.endpoint.replace("/namespaces/{namespace}", "");
    const url = `${server}${endpoint}`;

    const buildSelector = (labelKey: string) =>
      values.length === 1
        ? `${labelKey}=${values[0]}`
        : `${labelKey} in (${values.join(",")})`;

    try {
      const seen = new Set<string>();
      const results: unknown[] = [];
      for (const labelKey of labelKeys) {
        const items = await fetchK8s(kc, url, buildSelector(labelKey), signal);
        for (const item of items) {
          const name = (item as { metadata?: { name?: string } })?.metadata?.name;
          if (name && !seen.has(name)) {
            seen.add(name);
            results.push(item);
          }
        }
      }
      return results;
    } catch {
      return [];
    }
  }

  async listByNamespace(
    _entityType: string,
    query: ListNamespaceQuery,
    connection: ConnectionConfig,
  ): Promise<unknown[]> {
    const { namespace, entityK8sConfig, labelSelector, signal } = query;
    if (!entityK8sConfig?.endpoint) return [];

    const kc = getKubeConfig(connection.url, connection.auth);
    const server = kc.getCurrentCluster()?.server ?? connection.url;
    const endpoint = entityK8sConfig.endpoint.replace("{namespace}", namespace);
    const url = `${server}${endpoint}`;

    try {
      return await fetchK8s(kc, url, labelSelector, signal);
    } catch {
      return [];
    }
  }
}
