"use client";

import { FilterableTable } from "@/components/pulse/filterable-table";
import type { TableColumn } from "@/components/pulse/filterable-table";
import type { PipelinePerformanceData, PerformanceRow } from "@/lib/pulse/flows/utils/performance";
import { formatDuration } from "@/lib/pulse/flows/utils/performance";

function buildColumns(hasScenario: boolean): TableColumn[] {
  const base: TableColumn[] = [
    { key: "namespace",   label: "Namespace",  filterable: true },
    { key: "application", label: "Application",filterable: true },
    { key: "component",   label: "Component",  filterable: true },
  ];
  if (hasScenario) {
    base.push({ key: "scenario", label: "Scenario", filterable: true });
  }
  return [
    ...base,
    { key: "_waitMin",  label: "Wait min",  align: "right" },
    { key: "_waitMax",  label: "Wait max",  align: "right" },
    { key: "_waitAvg",  label: "Wait avg",  align: "right" },
    { key: "_execMin",  label: "Exec min",  align: "right" },
    { key: "_execMax",  label: "Exec max",  align: "right" },
    { key: "_execAvg",  label: "Exec avg",  align: "right" },
  ];
}

function enrichRow(row: PerformanceRow): Record<string, unknown> {
  return {
    ...row,
    _waitMin: row.waitTime.count > 0 ? formatDuration(row.waitTime.min) : "—",
    _waitMax: row.waitTime.count > 0 ? formatDuration(row.waitTime.max) : "—",
    _waitAvg: row.waitTime.count > 0 ? formatDuration(row.waitTime.avg) : "—",
    _execMin: row.executionTime.count > 0 ? formatDuration(row.executionTime.min) : "—",
    _execMax: row.executionTime.count > 0 ? formatDuration(row.executionTime.max) : "—",
    _execAvg: row.executionTime.count > 0 ? formatDuration(row.executionTime.avg) : "—",
  };
}

export function PerformanceRenderer({ data }: { data: unknown }) {
  const d = data as PipelinePerformanceData;

  if (d.total === 0) {
    return <p className="text-sm text-muted-foreground py-2">No pipeline runs in this period.</p>;
  }

  const hasScenario = d.rows.some((r) => r.scenario != null);
  const columns = buildColumns(hasScenario);
  const rows = d.rows.map(enrichRow);

  return (
    <div className="space-y-3">
      <FilterableTable
        columns={columns}
        rows={rows}
        rowKey={(_, i) => String(i)}
        renderCell={(col, value) => {
          if (["namespace","application","component","scenario"].includes(col.key)) {
            return <span className="font-mono">{String(value ?? "—")}</span>;
          }
          if (col.key.startsWith("_exec")) {
            return <span className="font-medium">{String(value)}</span>;
          }
          return String(value ?? "—");
        }}
      />

      <p className="text-[10px] text-muted-foreground">
        {d.total} runs · exec time from succeeded runs only
      </p>
    </div>
  );
}
