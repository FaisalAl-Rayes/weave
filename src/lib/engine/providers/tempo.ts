import type {
  ConnectionConfig,
  EnrichQuery,
  EnrichResult,
  Enriches,
  ProviderCapability,
} from "./types";
import { buildHeaders, substituteParams } from "./shared";

export class TempoProvider implements Enriches {
  readonly type = "tempo";
  readonly capabilities: ReadonlySet<ProviderCapability> = new Set(["enrich"]);

  async enrich(
    _entityType: string,
    query: EnrichQuery,
    connection: ConnectionConfig,
  ): Promise<EnrichResult> {
    const { queryConfig, identifiers, timeRange } = query;
    if (queryConfig.type !== "tempo") return { raw: null, entities: [] };

    const baseUrl = connection.url.replace(/\/$/, "");
    const headers = { ...buildHeaders(connection), Accept: "application/json" };

    const allParams: Record<string, string> = { ...identifiers };

    const traceId = identifiers.trace_id
      ? substituteParams(identifiers.trace_id, allParams)
      : queryConfig.traceId
        ? substituteParams(queryConfig.traceId, allParams)
        : undefined;

    if (traceId) {
      return this.fetchTrace(baseUrl, headers, traceId);
    }

    return this.searchTraces(baseUrl, headers, queryConfig, allParams, timeRange);
  }

  private async fetchTrace(
    baseUrl: string,
    headers: Record<string, string>,
    traceId: string,
  ): Promise<EnrichResult> {
    try {
      const res = await fetch(
        `${baseUrl}/api/traces/${encodeURIComponent(traceId)}`,
        { headers },
      );
      if (!res.ok) return { raw: null, entities: [] };
      const raw = await res.json();
      return { raw, entities: [raw] };
    } catch {
      return { raw: null, entities: [] };
    }
  }

  private async searchTraces(
    baseUrl: string,
    headers: Record<string, string>,
    queryConfig: { type: "tempo"; traceId?: string; tags?: Record<string, string>; limit?: number; endpoint?: string },
    params: Record<string, string>,
    timeRange?: { start: string; end: string },
  ): Promise<EnrichResult> {
    const url = new URL(`${baseUrl}${queryConfig.endpoint ?? "/api/v2/search"}`);

    if (queryConfig.tags) {
      for (const [key, val] of Object.entries(queryConfig.tags)) {
        url.searchParams.set(key, substituteParams(val, params));
      }
    }
    if (timeRange?.start) url.searchParams.set("start", timeRange.start);
    if (timeRange?.end) url.searchParams.set("end", timeRange.end);
    if (queryConfig.limit) url.searchParams.set("limit", String(queryConfig.limit));

    try {
      const res = await fetch(url.toString(), { headers });
      if (!res.ok) return { raw: null, entities: [] };
      const raw = await res.json() as { traces?: unknown[] };
      return { raw, entities: raw.traces ?? [] };
    } catch {
      return { raw: null, entities: [] };
    }
  }
}
