import type {
  ConnectionConfig,
  EnrichQuery,
  EnrichResult,
  Enriches,
  ProviderCapability,
} from "./types";
import { buildHeaders, substituteParams } from "./shared";

export class PrometheusProvider implements Enriches {
  readonly type = "prometheus";
  readonly capabilities: ReadonlySet<ProviderCapability> = new Set(["enrich"]);

  async enrich(
    _entityType: string,
    query: EnrichQuery,
    connection: ConnectionConfig,
  ): Promise<EnrichResult> {
    const { queryConfig, identifiers, display, timeRange } = query;
    if (queryConfig.type !== "promql") return { raw: null, entities: [] };

    const baseUrl = connection.url.replace(/\/$/, "");
    const headers = buildHeaders(connection);

    const allParams: Record<string, string> = {
      ...identifiers,
      ...Object.fromEntries(
        Object.entries(display).map(([k, v]) => [`display.${k}`, String(v)])
      ),
      ...(timeRange
        ? { "time.start": timeRange.start, "time.end": timeRange.end }
        : {}),
    };

    const promql = substituteParams(queryConfig.promql, allParams);
    if (!promql) return { raw: null, entities: [] };

    const isRange = timeRange != null || queryConfig.step != null;
    const params = new URLSearchParams({ query: promql });
    let url: string;

    if (isRange) {
      url = `${baseUrl}/api/v1/query_range`;
      const now = Math.floor(Date.now() / 1000);
      params.set("start", timeRange?.start ?? String(now - 3600));
      params.set("end", timeRange?.end ?? String(now));
      params.set("step", queryConfig.step ?? "60");
    } else {
      url = `${baseUrl}/api/v1/query`;
    }

    try {
      const res = await fetch(`${url}?${params}`, { headers });
      if (!res.ok) return { raw: null, entities: [] };
      const raw = await res.json();
      const results = (raw as { data?: { result?: unknown[] } })?.data?.result ?? [];
      return { raw, entities: results };
    } catch {
      return { raw: null, entities: [] };
    }
  }
}
