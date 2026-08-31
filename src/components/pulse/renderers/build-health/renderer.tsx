"use client";

import { FilterableTable } from "@/components/pulse/filterable-table";
import type { TableColumn } from "@/components/pulse/filterable-table";
import type { BuildHealthData, BuildRow } from "@/lib/pulse/flows/build-health/flow";

const COLUMNS: TableColumn[] = [
  { key: "namespace",       label: "Namespace",   filterable: true },
  { key: "application",    label: "Application", filterable: true },
  { key: "component",      label: "Component",   filterable: true },
  { key: "eventTypeLabel", label: "Event",       filterable: true },
  { key: "total",          label: "Total",       align: "right" },
  { key: "succeeded",      label: "Pass",        align: "right" },
  { key: "failed",         label: "Fail",        align: "right" },
  { key: "_rate",          label: "Rate",        align: "right" },
];

function enrichRow(row: BuildRow): Record<string, unknown> {
  const comp = row.succeeded + row.failed;
  return { ...row, _rate: comp > 0 ? `${Math.round((row.succeeded / comp) * 100)}%` : "—" };
}

export function BuildHealthRenderer({ data }: { data: unknown }) {
  const d = data as BuildHealthData;
  const completed = d.succeeded + d.failed;
  const rows = d.rows.map(enrichRow);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-bold tabular-nums">{d.successRate}%</span>
        <span className="text-sm text-muted-foreground">
          {d.succeeded} of {completed} build runs succeeded
          {d.total > completed && ` · ${d.total - completed} in progress`}
        </span>
      </div>
      <FilterableTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(_, i) => String(i)}
        renderCell={(col, value) => {
          if (col.key === "succeeded") return <span className="text-emerald-400">{String(value)}</span>;
          if (col.key === "failed")    return <span className="text-red-400">{String(value)}</span>;
          if (["namespace","application","component"].includes(col.key)) {
            return <span className="font-mono">{String(value ?? "—")}</span>;
          }
          return String(value ?? "—");
        }}
      />
    </div>
  );
}
