"use client";

import { FilterableTable } from "@/components/pulse/filterable-table";
import type { TableColumn } from "@/components/pulse/filterable-table";
import type { ReleasesData as ReleasePerformanceData, ReleaseItem } from "@/lib/pulse/flows/releases/flow";

const COLUMNS: TableColumn[] = [
  { key: "_startTime",  label: "Started",      className: "whitespace-nowrap" },
  { key: "status",     label: "Status",        filterable: true },
  { key: "name",       label: "Name",          filterable: true },
  { key: "namespace",  label: "Namespace",     filterable: true },
  { key: "releasePlan",label: "Release Plan",  filterable: true, filterType: "regex" as const },
  { key: "snapshot",   label: "Snapshot",      filterable: true },
];

function formatTimestamp(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function enrichRow(r: ReleaseItem): Record<string, unknown> {
  return {
    ...r,
    _startTime: r.startTime ?? r.completionTime ?? "",
  };
}

export function ReleasePerformanceRenderer({ data, projectId }: { data: unknown; projectId: string }) {
  const d = data as ReleasePerformanceData;

  if (d.total === 0) {
    return <p className="text-sm text-muted-foreground py-2">No releases in this period.</p>;
  }

  const completed = d.succeeded + d.failed;
  const rows = d.releases.map(enrichRow);

  const openInExplore = (row: Record<string, unknown>) => {
    const commitSha = row.commitSha as string | undefined;
    const [seedType, seedValue] = commitSha
      ? ["commit_sha", commitSha]
      : ["snapshot_name", String(row.snapshot ?? "")];
    const url = `/?project=${encodeURIComponent(projectId)}&seed_type=${seedType}&seed_value=${encodeURIComponent(seedValue)}&depth=2`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-bold tabular-nums">{d.total}</span>
        <span className="text-sm text-muted-foreground">
          releases —{" "}
          <span className="text-emerald-400">{d.succeeded} succeeded</span>
          {" · "}
          <span className="text-red-400">{d.failed} failed</span>
          {d.running > 0 && ` · ${d.running} in progress`}
          {completed > 0 && ` (${d.successRate}% success rate)`}
        </span>
      </div>

      <FilterableTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(_, i) => String(i)}
        renderCell={(col, value, row) => {
          if (col.key === "_startTime") {
            return <span className="font-mono text-muted-foreground">{formatTimestamp(String(value || ""))}</span>;
          }
          if (col.key === "status") {
            const s = value as string;
            return (
              <span className={`font-medium ${
                s === "succeeded" ? "text-emerald-400"
                : s === "failed" ? "text-red-400"
                : "text-muted-foreground"
              }`}>
                {s}
              </span>
            );
          }
          if (col.key === "name") {
            const hasLink = !!(row.commitSha || row.snapshot);
            return hasLink ? (
              <button
                type="button"
                onClick={() => openInExplore(row)}
                className="font-mono text-left hover:text-primary hover:underline transition-colors"
                title={row.commitSha ? `Explore by commit SHA` : `Explore by snapshot`}
              >
                {String(value)}
              </button>
            ) : (
              <span className="font-mono">{String(value)}</span>
            );
          }
          if (col.key === "namespace" || col.key === "snapshot") {
            return <span className="font-mono">{String(value ?? "—")}</span>;
          }
          return String(value ?? "—");
        }}
      />
    </div>
  );
}
