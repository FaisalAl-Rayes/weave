import type {
  BaseProvider,
  ByIdentifierQuery,
  ConnectionConfig,
  ListNamespaceQuery,
  ProviderCapability,
  ServesByIdentifier,
  ListsByNamespace,
} from "./types";
import { buildHeaders } from "./shared";

const PAGE_SIZE = 1000; // KubeArchive maximum

export class KubeArchiveProvider implements ServesByIdentifier, ListsByNamespace {
  readonly type = "kubearchive";
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

    const endpoint = entityK8sConfig.endpoint.replace("/namespaces/{namespace}", "");
    const baseEndpointUrl = `${connection.url.replace(/\/$/, "")}${endpoint}`;

    // Build the label selector expression.
    // Single value: "key=value" — compatible with all Kubernetes-style APIs.
    // Multiple values: "key in (v1,v2,...)" — supported by KubeArchive/Kubernetes.
    const buildSelector = (labelKey: string) =>
      values.length === 1
        ? `${labelKey}=${values[0]}`
        : `${labelKey} in (${values.join(",")})`;

    const seen = new Set<string>();
    const results: unknown[] = [];
    for (const labelKey of labelKeys) {
      const url = new URL(baseEndpointUrl);
      url.searchParams.set("labelSelector", buildSelector(labelKey));
      const items = await this.fetchAllPages(url, connection, signal);
      for (const item of items) {
        const name = (item as { metadata?: { name?: string } })?.metadata?.name;
        if (name && !seen.has(name)) {
          seen.add(name);
          results.push(item);
        }
      }
    }
    return results;
  }

  async listByNamespace(
    _entityType: string,
    query: ListNamespaceQuery,
    connection: ConnectionConfig,
  ): Promise<unknown[]> {
    const { namespace, entityK8sConfig, labelSelector, timeRange, signal, onPage } = query;
    if (!entityK8sConfig?.endpoint) return [];

    const baseUrl = connection.url.replace(/\/$/, "");
    const endpoint = entityK8sConfig.endpoint.replace("{namespace}", namespace);
    const url = new URL(`${baseUrl}${endpoint}`);

    if (labelSelector) url.searchParams.set("labelSelector", labelSelector);

    // Server-side time filtering — KubeArchive filters in PostgreSQL,
    // avoiding fetching records outside the requested window.
    if (timeRange?.start) {
      url.searchParams.set("creationTimestampAfter", timeRange.start.toISOString());
    }
    if (timeRange?.end) {
      url.searchParams.set("creationTimestampBefore", timeRange.end.toISOString());
    }

    return this.fetchAllPages(url, connection, signal, onPage);
  }

  // Fetches all pages using KubeArchive's cursor-based pagination.
  // Each response includes metadata.continue token for the next page.
  // onPage is called after each HTTP response — callers use it to log per-request details.
  private async fetchAllPages(
    baseUrl: URL,
    connection: ConnectionConfig,
    signal?: AbortSignal,
    onPage?: (pageIndex: number, recordCount: number, durationMs: number) => void,
  ): Promise<unknown[]> {
    const headers = buildHeaders(connection);
    const all: unknown[] = [];
    let continueToken: string | undefined;
    let pageIndex = 0;

    do {
      const url = new URL(baseUrl.toString());
      url.searchParams.set("limit", String(PAGE_SIZE));
      if (continueToken) url.searchParams.set("continue", continueToken);

      // Check outer signal (user cancellation) before starting each new page
      if (signal?.aborted) break;

      const pageStart = Date.now();
      try {
        const res = await fetch(url.toString(), {
          headers,
          // Per-page timeout — independent of the outer signal so a long
          // paginated sequence doesn't abort partway through.
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) break;

        const raw = await res.json() as {
          items?: unknown[];
          metadata?: { continue?: string };
        };

        const items = raw.items ?? [];
        all.push(...items);
        onPage?.(pageIndex, items.length, Date.now() - pageStart);
        pageIndex++;

        continueToken = raw.metadata?.continue;
      } catch {
        break;
      }
    } while (continueToken);

    return all;
  }
}
