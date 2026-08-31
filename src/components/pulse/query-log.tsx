"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Database } from "lucide-react";
import type { PulseQueryLogEntry } from "@/lib/pulse/types";

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface QueryLogProps {
  entries: PulseQueryLogEntry[];
}

export function PulseQueryLog({ entries }: QueryLogProps) {
  const [open, setOpen] = useState(false);

  if (entries.length === 0) return null;

  const totalMs = entries.reduce((s, e) => s + e.durationMs, 0);
  const totalFetched = entries.reduce((s, e) => s + e.recordsFetched, 0);
  const errors = entries.filter((e) => e.status === "error");

  // Group by datasource for the summary
  const byDatasource = entries.reduce<Record<string, { count: number; ms: number; records: number }>>(
    (acc, e) => {
      if (!acc[e.datasource]) acc[e.datasource] = { count: 0, ms: 0, records: 0 };
      acc[e.datasource].count++;
      acc[e.datasource].ms += e.durationMs;
      acc[e.datasource].records += e.recordsFetched;
      return acc;
    },
    {},
  );

  return (
    <div className="rounded-lg border border-border/40 overflow-hidden">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/20 transition-colors"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <Database className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium flex-1">Query Log</span>

        {/* Summary chips */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {entries.length} API call{entries.length !== 1 ? "s" : ""}
          </span>
          <span className="text-[10px] text-muted-foreground">·</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {totalFetched.toLocaleString()} records
          </span>
          <span className="text-[10px] text-muted-foreground">·</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {formatMs(totalMs)} total
          </span>
          {errors.length > 0 && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              {errors.length} error{errors.length > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </button>

      {/* Detail table */}
      {open && (
        <div className="border-t border-border/40">
          {/* Per-datasource summary */}
          <div className="flex flex-wrap gap-4 px-4 py-2 bg-muted/10 border-b border-border/20">
            {Object.entries(byDatasource).map(([name, stats]) => (
              <div key={name} className="text-[10px] text-muted-foreground">
                <span className="font-mono font-medium text-foreground">{name}</span>
                {" — "}
                {stats.count} API call{stats.count !== 1 ? "s" : ""},
                {" "}{stats.records.toLocaleString()} records,
                {" "}{formatMs(stats.ms)}
              </div>
            ))}
          </div>

          {/* Individual entries */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border/20">
                  <th className="text-left px-4 py-1.5 font-normal">Datasource</th>
                  <th className="text-left px-2 py-1.5 font-normal">Entity</th>
                  <th className="text-left px-2 py-1.5 font-normal">Namespace</th>
                  <th className="text-right px-2 py-1.5 font-normal">Page</th>
                  <th className="text-right px-2 py-1.5 font-normal">Records</th>
                  <th className="text-right px-4 py-1.5 font-normal">Duration</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i} className="border-b border-border/10 last:border-0">
                    <td className="px-4 py-1.5 font-mono">{e.datasource}</td>
                    <td className="px-2 py-1.5 font-mono">{e.entityType}</td>
                    <td className="px-2 py-1.5 font-mono">{e.namespace}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {e.pageIndex + 1}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {e.status === "error" ? (
                        <span className="text-destructive" title={e.error}>error</span>
                      ) : (
                        e.recordsFetched.toLocaleString()
                      )}
                    </td>
                    <td className={`px-4 py-1.5 text-right tabular-nums ${e.durationMs > 5000 ? "text-amber-400" : ""}`}>
                      {formatMs(e.durationMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
