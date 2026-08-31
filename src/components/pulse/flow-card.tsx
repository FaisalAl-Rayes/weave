"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";
import type { FlowResponse } from "@/lib/pulse/types";
import { getRenderer } from "./renderers";

interface FlowCardProps {
  flow?: FlowResponse;
  loading?: boolean;
  projectId: string;
}

export function FlowCard({ flow, loading, projectId }: FlowCardProps) {
  if (loading || !flow) {
    return (
      <div className="rounded-lg border border-border/50 p-4 space-y-3">
        <Skeleton className="h-4 w-32 rounded" />
        <Skeleton className="h-16 rounded" />
      </div>
    );
  }

  const Renderer = getRenderer(flow.flowId);

  return (
    <div className="rounded-lg border border-border/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{flow.title}</h3>
        {flow.status === "error" && (
          <Badge variant="destructive" className="gap-1 text-[10px] px-1.5 py-0">
            <AlertCircle className="h-2.5 w-2.5" />
            Error
          </Badge>
        )}
      </div>

      {flow.status === "error" ? (
        <p className="text-xs text-muted-foreground font-mono">{flow.error}</p>
      ) : (
        <Renderer data={flow.data} projectId={projectId} />
      )}
    </div>
  );
}
