import type {
  ByIdentifierQuery,
  ConnectionConfig,
  EnrichQuery,
  EnrichResult,
  Enriches,
  ProviderCapability,
  ServesByIdentifier,
} from "./types";
import { buildHeaders, substituteParams, extractEntities } from "./shared";

export class RestApiProvider implements ServesByIdentifier, Enriches {
  readonly type = "rest";
  readonly capabilities: ReadonlySet<ProviderCapability> = new Set([
    "serve:by-identifier",
    "enrich",
  ]);

  async serveByIdentifiers(
    _entityType: string,
    query: ByIdentifierQuery,
    connection: ConnectionConfig,
  ): Promise<unknown[]> {
    const { identifierType, values, entityK8sConfig, signal } = query;
    if (!entityK8sConfig?.endpoint || values.length === 0) return [];

    // REST APIs rarely support batch label selectors — query sequentially per value.
    const all: unknown[] = [];
    for (const value of values) {
      const params: Record<string, string> = { [identifierType]: value };
      const endpoint = substituteParams(entityK8sConfig.endpoint, params);
      const baseUrl = connection.url.replace(/\/$/, "");
      const url = new URL(`${baseUrl}${endpoint}`);

      const selectorValue = entityK8sConfig.identifierSelectors?.[identifierType];
      const labelKey = Array.isArray(selectorValue) ? selectorValue[0] : selectorValue;
      if (labelKey) url.searchParams.set("labelSelector", `${labelKey}=${value}`);

      try {
        const res = await fetch(url.toString(), { headers: buildHeaders(connection), signal });
        if (!res.ok) continue;
        const raw = await res.json();
        all.push(...extractEntities(raw, "items"));
      } catch {
        continue;
      }
    }
    return all;
  }

  async enrich(
    _entityType: string,
    query: EnrichQuery,
    connection: ConnectionConfig,
  ): Promise<EnrichResult> {
    const { queryConfig, identifiers, display } = query;
    if (queryConfig.type !== "rest") return { raw: null, entities: [] };

    const allParams: Record<string, string> = {
      ...identifiers,
      ...Object.fromEntries(
        Object.entries(display).map(([k, v]) => [`display.${k}`, String(v)])
      ),
    };

    const endpoint = substituteParams(queryConfig.endpoint, allParams);
    const method = (queryConfig.method ?? "GET").toUpperCase();
    const baseUrl = connection.url.replace(/\/$/, "");
    const url = new URL(`${baseUrl}${endpoint}`);

    if (queryConfig.params) {
      for (const [key, val] of Object.entries(queryConfig.params)) {
        url.searchParams.set(key, substituteParams(val, allParams));
      }
    }

    try {
      const res = await fetch(url.toString(), {
        method,
        headers: buildHeaders(connection),
      });
      if (!res.ok) return { raw: null, entities: [] };
      const raw = await res.json();
      return { raw, entities: extractEntities(raw) };
    } catch {
      return { raw: null, entities: [] };
    }
  }
}
