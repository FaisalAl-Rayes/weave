"use client";

import type { KonfluxSummaryData, PipelineStats } from "@/lib/pulse/types";

interface SummaryHeaderProps {
  summary: KonfluxSummaryData;
}

function rateLabel(stats: PipelineStats): string {
  const completed = stats.succeeded + stats.failed;
  if (completed === 0) return "—";
  return `${Math.round((stats.succeeded / completed) * 100)}%`;
}

function StatGroup({
  label,
  stats,
  highlight,
}: {
  label: string;
  stats: PipelineStats;
  highlight?: boolean;
}) {
  const rate = rateLabel(stats);
  return (
    <div className={`flex flex-col gap-0.5 px-4 py-2.5 rounded-lg border ${highlight ? "border-border bg-muted/20" : "border-border/30 bg-muted/10"}`}>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-semibold tabular-nums">{stats.total}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          <span className="text-emerald-400">{stats.succeeded}</span>
          {" / "}
          <span className="text-red-400">{stats.failed}</span>
        </span>
        <span className="text-xs text-muted-foreground ml-auto">{rate}</span>
      </div>
    </div>
  );
}

export function SummaryHeader({ summary }: SummaryHeaderProps) {
  const { pipelineRuns, releases } = summary;

  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-0.5">
        Overview — <span className="normal-case font-normal">total · succeeded / failed · success rate</span>
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatGroup label="Pipeline Runs" stats={pipelineRuns} highlight />
        <StatGroup label="Build PipelineRuns" stats={pipelineRuns.build} />
        <StatGroup label="Test PipelineRuns" stats={pipelineRuns.test} />
        <StatGroup label="Release PipelineRuns" stats={pipelineRuns.managedRelease} />
        <StatGroup label="Releases" stats={releases} highlight />
      </div>
    </div>
  );
}
