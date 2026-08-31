"use client";

import type { ProviderViewProps } from "./types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Loader2, ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";

/**
 * Splunk provider view — shows SPL query and renders log results
 * with server-side pagination.
 */
export function SplunkView({ query, result, pagination, loading, onRun, onPageChange, onFetchAll }: ProviderViewProps) {
  const spl = (query.queryConfig as Record<string, unknown>).search as string ?? "";
  const results = parseResults(result);

  const currentPage = pagination ? Math.floor(pagination.offset / pagination.count) + 1 : 1;
  const totalPages = pagination ? Math.ceil(pagination.total / pagination.count) : 1;
  const isPaginated = pagination && pagination.total > pagination.count;

  return (
    <div className="space-y-3">
      {/* Query display */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            SPL Query
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
          {spl}
        </pre>
      </div>

      {/* Results */}
      {results && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Results</span>
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                {pagination ? pagination.total.toLocaleString() : results.length.toLocaleString()}
              </Badge>
              {isPaginated && (
                <span className="text-[9px] text-muted-foreground">
                  showing {pagination.offset + 1}–{Math.min(pagination.offset + pagination.count, pagination.total)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {isPaginated && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    disabled={loading || currentPage <= 1}
                    onClick={() => onPageChange?.(pagination.offset - pagination.count)}
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    disabled={loading || currentPage >= totalPages}
                    onClick={() => onPageChange?.(pagination.offset + pagination.count)}
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2 gap-1 ml-1"
                    disabled={loading}
                    onClick={onFetchAll}
                  >
                    <ChevronsRight className="h-2.5 w-2.5" />
                    Fetch All
                  </Button>
                </>
              )}
            </div>
          </div>
          <div className="rounded border border-border/30 overflow-hidden">
            <div className="max-h-80 overflow-auto">
              {results.map((entry, i) => (
                <LogEntry key={`${pagination?.offset ?? 0}-${i}`} entry={entry} />
              ))}
              {results.length === 0 && (
                <p className="text-xs text-muted-foreground p-3">No results</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ParsedLogEntry {
  time: string;
  message: string;
  level: string;
  fields: Record<string, string>;
}

function parseResults(result: unknown): ParsedLogEntry[] | null {
  if (!result) return null;

  const raw = result as Record<string, unknown>;
  const items = (raw.results ?? raw.items ?? (Array.isArray(raw) ? raw : null)) as Record<string, unknown>[] | null;
  if (!items || !Array.isArray(items)) {
    return [{ time: "", message: JSON.stringify(result, null, 2), level: "info", fields: {} }];
  }

  return items.map((item) => {
    const time = String(item._time ?? item.timestamp ?? "");
    const message = String(item._raw ?? item.message ?? item.log ?? JSON.stringify(item));
    const level = String(item.level ?? item.log_level ?? item.severity ?? "info").toLowerCase();

    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(item)) {
      if (!["_time", "_raw", "message", "log", "level", "timestamp"].includes(k) && typeof v === "string") {
        fields[k] = v;
      }
    }

    return { time, message, level, fields };
  });
}

function LogEntry({ entry }: { entry: ParsedLogEntry }) {
  const levelColor = {
    error: "text-red-400",
    warn: "text-amber-400",
    warning: "text-amber-400",
    info: "text-blue-400",
    debug: "text-zinc-500",
  }[entry.level] ?? "text-zinc-400";

  return (
    <div className="flex gap-2 px-3 py-1 text-[11px] font-mono border-b border-border/10 hover:bg-muted/20 transition-colors">
      {entry.time && (
        <span className="text-muted-foreground shrink-0 w-44 truncate">{entry.time}</span>
      )}
      <span className={`shrink-0 w-12 uppercase ${levelColor}`}>
        {entry.level.slice(0, 5)}
      </span>
      <span className="text-foreground whitespace-pre-wrap break-all">{entry.message}</span>
    </div>
  );
}
