"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import type { FailureAnalysisData } from "@/lib/pulse/flows/failure-analysis/flow";

interface Props {
  data: unknown;
  projectId: string;
}

export function FailureAnalysisRenderer({ data, projectId }: Props) {
  const d = data as FailureAnalysisData;
  const router = useRouter();

  if (d.totalFailed === 0) {
    return <p className="text-sm text-muted-foreground py-2">No failures in this period.</p>;
  }

  const openInExplore = (name: string) => {
    const url = `/?project=${encodeURIComponent(projectId)}&seed_type=pipelinerun_name&seed_value=${encodeURIComponent(name)}&depth=2`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {d.totalFailed} failed run{d.totalFailed !== 1 ? "s" : ""} grouped by failure reason
      </p>
      {d.groups.slice(0, 10).map((group) => (
        <div key={group.reason} className="rounded border border-border/40 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-mono truncate">{group.reason}</span>
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0">
              {group.count}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1">
            {group.pipelineRuns.slice(0, 5).map((run) => (
              <Button
                key={`${run.namespace}/${run.name}`}
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-2 font-mono gap-1"
                onClick={() => openInExplore(run.name)}
              >
                {run.name.slice(-12)}
                <ExternalLink className="h-2.5 w-2.5 opacity-50" />
              </Button>
            ))}
            {group.pipelineRuns.length > 5 && (
              <span className="text-[10px] text-muted-foreground self-center px-1">
                +{group.pipelineRuns.length - 5} more
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
