"use client";

import { Badge } from "@/components/ui/badge";
import type { ReleaseHealthData } from "@/lib/pulse/flows/release-health/flow";

interface Props {
  data: unknown;
  projectId: string;
}

export function ReleaseHealthRenderer({ data, projectId }: Props) {
  const d = data as ReleaseHealthData;
  const completed = d.succeeded + d.failed;

  if (d.total === 0) {
    return <p className="text-sm text-muted-foreground py-2">No release pipeline runs in this period.</p>;
  }

  const openInExplore = (name: string) => {
    const url = `/?project=${encodeURIComponent(projectId)}&seed_type=pipelinerun_name&seed_value=${encodeURIComponent(name)}&depth=2`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-bold tabular-nums">{d.successRate}%</span>
        <span className="text-sm text-muted-foreground">
          {d.succeeded} of {completed} release pipelines succeeded
          {d.running > 0 && ` · ${d.running} in progress`}
        </span>
      </div>

      {d.runs.length > 0 && (
        <div className="space-y-1">
          {d.runs.slice(0, 10).map((r) => (
            <button
              key={`${r.namespace}/${r.name}`}
              type="button"
              onClick={() => openInExplore(r.name)}
              className="flex w-full items-center gap-2 py-1 border-b border-border/20 last:border-0 text-left hover:bg-accent/30 rounded px-1 transition-colors"
            >
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 shrink-0 ${
                  r.status === "succeeded"
                    ? "text-emerald-400 border-emerald-500/30"
                    : r.status === "failed"
                    ? "text-red-400 border-red-500/30"
                    : "text-muted-foreground border-border/40"
                }`}
              >
                {r.status}
              </Badge>
              <span className="text-xs font-mono truncate flex-1">{r.name}</span>
              {r.application && (
                <span className="text-[10px] text-muted-foreground hidden sm:block shrink-0">{r.application}</span>
              )}
            </button>
          ))}
          {d.runs.length > 10 && (
            <p className="text-[10px] text-muted-foreground pt-1">+{d.runs.length - 10} more</p>
          )}
        </div>
      )}
    </div>
  );
}
