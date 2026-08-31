import type {
  ConnectionConfig,
  EnrichQuery,
  EnrichResult,
  Enriches,
  ProviderCapability,
} from "./types";
import { buildHeaders, substituteParams } from "./shared";

const DEFAULT_PAGE_SIZE = 100;

export class SplunkProvider implements Enriches {
  readonly type = "splunk";
  readonly capabilities: ReadonlySet<ProviderCapability> = new Set(["enrich"]);

  async enrich(
    _entityType: string,
    query: EnrichQuery,
    connection: ConnectionConfig,
  ): Promise<EnrichResult> {
    const { queryConfig, identifiers, display, timeRange, pagination } = query;
    if (queryConfig.type !== "splunk") return { raw: null, entities: [] };

    const baseUrl = connection.url.replace(/\/$/, "");
    const headers = buildHeaders(connection, "application/x-www-form-urlencoded");
    const pageSize = DEFAULT_PAGE_SIZE;

    const earliestTime = timeRange?.start;
    const latestTime = timeRange?.end;

    // Resume an existing search job
    if (pagination?.sid) {
      if (pagination.fetchAll) {
        const allResults = await this.fetchAllResults(baseUrl, headers, pagination.sid, pageSize);
        return { raw: { results: allResults, sid: pagination.sid }, entities: [] };
      }
      return this.fetchPage(baseUrl, headers, pagination.sid, pagination.offset ?? 0, pageSize);
    }

    const allParams: Record<string, string> = {
      ...identifiers,
      ...Object.fromEntries(
        Object.entries(display).map(([k, v]) => [`display.${k}`, String(v)])
      ),
    };

    const searchQuery = substituteParams(queryConfig.search, allParams);
    if (!searchQuery) return { raw: null, entities: [] };

    const mode = queryConfig.mode ?? "blocking";

    if (mode === "oneshot") {
      return this.executeOneshot(baseUrl, headers, searchQuery, pageSize, earliestTime, latestTime);
    }

    const sid = await this.createJob(baseUrl, headers, searchQuery, mode, earliestTime, latestTime);
    if (!sid) return { raw: null, entities: [] };

    if (mode === "normal") {
      const done = await this.pollUntilDone(baseUrl, headers, sid);
      if (!done) return { raw: null, entities: [] };
    }

    return this.fetchPage(baseUrl, headers, sid, 0, pageSize);
  }

  private async fetchPage(
    baseUrl: string,
    headers: Record<string, string>,
    sid: string,
    offset: number,
    count: number,
  ): Promise<EnrichResult> {
    const total = await this.getResultCount(baseUrl, headers, sid);
    const params = new URLSearchParams({
      output_mode: "json",
      count: String(count),
      offset: String(offset),
    });

    const res = await fetch(
      `${baseUrl}/services/search/v2/jobs/${encodeURIComponent(sid)}/results?${params}`,
      { headers },
    );

    if (!res.ok) return { raw: null, entities: [] };

    const data = await res.json() as { results?: unknown[] };
    const results = data.results ?? [];

    return {
      raw: { results, sid },
      entities: [],
      pagination: { sid, offset, count, total },
    };
  }

  private async getResultCount(
    baseUrl: string,
    headers: Record<string, string>,
    sid: string,
  ): Promise<number> {
    const res = await fetch(
      `${baseUrl}/services/search/v2/jobs/${encodeURIComponent(sid)}?output_mode=json`,
      { headers },
    );
    if (!res.ok) return 0;
    const data = await res.json() as { entry?: { content?: { resultCount?: number } }[] };
    return data.entry?.[0]?.content?.resultCount ?? 0;
  }

  private async executeOneshot(
    baseUrl: string,
    headers: Record<string, string>,
    search: string,
    count: number,
    earliestTime?: string,
    latestTime?: string,
  ): Promise<EnrichResult> {
    const body = new URLSearchParams({
      search,
      exec_mode: "oneshot",
      output_mode: "json",
      count: String(count),
    });
    if (earliestTime) body.set("earliest_time", earliestTime);
    if (latestTime) body.set("latest_time", latestTime);

    const res = await fetch(`${baseUrl}/services/search/v2/jobs`, {
      method: "POST",
      headers,
      body,
    });

    if (!res.ok) return { raw: null, entities: [] };

    const raw = await res.json() as { results?: unknown[] };
    return { raw, entities: raw.results ?? [] };
  }

  private async createJob(
    baseUrl: string,
    headers: Record<string, string>,
    search: string,
    execMode: string,
    earliestTime?: string,
    latestTime?: string,
  ): Promise<string | null> {
    const body = new URLSearchParams({
      search,
      exec_mode: execMode,
      output_mode: "json",
      max_count: "500000",
    });
    if (earliestTime) body.set("earliest_time", earliestTime);
    if (latestTime) body.set("latest_time", latestTime);

    const res = await fetch(`${baseUrl}/services/search/v2/jobs`, {
      method: "POST",
      headers,
      body,
    });

    if (!res.ok) return null;
    const data = await res.json() as { sid?: string };
    return data.sid ?? null;
  }

  private async pollUntilDone(
    baseUrl: string,
    headers: Record<string, string>,
    sid: string,
  ): Promise<boolean> {
    for (let i = 0; i < 60; i++) {
      const res = await fetch(
        `${baseUrl}/services/search/v2/jobs/${encodeURIComponent(sid)}?output_mode=json`,
        { headers },
      );
      if (!res.ok) return false;
      const data = await res.json() as { entry?: { content?: { isDone?: boolean; isFailed?: boolean } }[] };
      const content = data.entry?.[0]?.content;
      if (content?.isDone) return true;
      if (content?.isFailed) return false;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return false;
  }

  private async fetchAllResults(
    baseUrl: string,
    headers: Record<string, string>,
    sid: string,
    pageSize: number,
  ): Promise<unknown[]> {
    const allResults: unknown[] = [];
    let offset = 0;

    while (true) {
      const params = new URLSearchParams({
        output_mode: "json",
        count: String(pageSize),
        offset: String(offset),
      });

      const res = await fetch(
        `${baseUrl}/services/search/v2/jobs/${encodeURIComponent(sid)}/results?${params}`,
        { headers },
      );

      if (!res.ok) break;

      const data = await res.json() as { results?: unknown[] };
      const results = data.results ?? [];
      allResults.push(...results);
      if (results.length < pageSize) break;
      offset += pageSize;
    }

    return allResults;
  }
}
