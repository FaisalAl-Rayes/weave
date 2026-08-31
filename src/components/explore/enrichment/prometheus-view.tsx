"use client";

import type { ProviderViewProps } from "./types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Loader2 } from "lucide-react";

/**
 * Prometheus provider view — shows PromQL query and renders metric results.
 */
export function PrometheusView({ query, result, loading, onRun }: ProviderViewProps) {
  const promql = (query.queryConfig as Record<string, unknown>).promql as string ?? "";

  const metrics = parseMetrics(result);

  return (
    <div className="space-y-3">
      {/* Query display */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            PromQL
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] px-2 gap-1"
            onClick={onRun}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Play className="h-2.5 w-2.5" />}
            {loading ? "Running..." : "Run"}
          </Button>
        </div>
        <pre className="text-[11px] font-mono bg-muted/30 rounded px-3 py-2 whitespace-pre-wrap text-muted-foreground">
          {promql}
        </pre>
      </div>

      {/* Results */}
      {metrics && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Results</span>
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{metrics.length}</Badge>
          </div>
          <div className="rounded border border-border/30 overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border/30 bg-muted/20">
                  <th className="text-left px-3 py-1.5 text-muted-foreground font-medium">Timestamp</th>
                  <th className="text-left px-3 py-1.5 text-muted-foreground font-medium">Metric</th>
                  <th className="text-left px-3 py-1.5 text-muted-foreground font-medium">Labels</th>
                  <th className="text-right px-3 py-1.5 text-muted-foreground font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m, i) => (
                  <tr key={i} className="border-b border-border/10 hover:bg-muted/10">
                    <td className="px-3 py-1.5 font-mono text-muted-foreground text-[10px] whitespace-nowrap">{m.timestamp}</td>
                    <td className="px-3 py-1.5 font-mono text-foreground">{m.name}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(m.labels).map(([k, v]) => (
                          <span key={k} className="inline-flex items-center rounded bg-muted/50 px-1 py-0.5 text-[9px] font-mono text-muted-foreground">
                            {k}=<span className="text-foreground">{v}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-emerald-400 tabular-nums">{m.value}</td>
                  </tr>
                ))}
                {metrics.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-3 text-muted-foreground text-center">No results</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

interface ParsedMetric {
  name: string;
  labels: Record<string, string>;
  value: string;
  timestamp: string;
}

function formatUnixTimestamp(ts: number | undefined): string {
  if (!ts) return "";
  try {
    return new Date(ts * 1000).toISOString().replace("T", " ").replace("Z", "");
  } catch {
    return String(ts);
  }
}

function parseMetrics(result: unknown): ParsedMetric[] | null {
  if (!result) return null;

  const raw = result as Record<string, unknown>;
  const data = (raw.data ?? raw) as Record<string, unknown>;
  const results = (data.result ?? data.results ?? (Array.isArray(data) ? data : null)) as Record<string, unknown>[] | null;

  if (!results || !Array.isArray(results)) {
    return [{ name: "result", labels: {}, value: JSON.stringify(result) }];
  }

  return results.map((r) => {
    const metric = (r.metric ?? {}) as Record<string, string>;
    const name = metric.__name__ ?? "metric";
    const labels = { ...metric };
    delete labels.__name__;

    let value: string;
    let timestamp = "";
    if (Array.isArray(r.value)) {
      timestamp = formatUnixTimestamp(r.value[0] as number);
      value = String(r.value[1] ?? r.value[0] ?? "");
    } else if (Array.isArray(r.values)) {
      const last = r.values[r.values.length - 1] as unknown[];
      timestamp = formatUnixTimestamp(last?.[0] as number);
      value = String(last?.[1] ?? "");
    } else {
      value = String(r.value ?? "");
    }

    return { name, labels, value, timestamp };
  });
}
