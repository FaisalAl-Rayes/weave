"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { ChevronRight, Code } from "lucide-react";
import type { GraphEntity } from "@/lib/engine/types";

const TYPE_COLORS: Record<string, string> = {
  PipelineRun: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  TaskRun: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  Snapshot: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  Release: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  Pod: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  Certificate: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

interface EntityCardProps {
  entity: GraphEntity;
}

const STATUS_DOT: Record<string, string> = {
  Succeeded: "bg-emerald-400", succeeded: "bg-emerald-400", True: "bg-emerald-400",
  Failed:    "bg-red-400",     failed:    "bg-red-400",     False: "bg-red-400", Error: "bg-red-400",
  Running:   "bg-sky-400",     running:   "bg-sky-400",
  Pending:   "bg-amber-400",   pending:   "bg-amber-400",
  Skipped:   "bg-zinc-500",    skipped:   "bg-zinc-500",
};

const STATUS_TEXT: Record<string, string> = {
  Succeeded: "text-emerald-400", succeeded: "text-emerald-400", True: "text-emerald-400",
  Failed:    "text-red-400",     failed:    "text-red-400",     False: "text-red-400", Error: "text-red-400",
  Running:   "text-sky-400",     running:   "text-sky-400",
  Pending:   "text-amber-400",   pending:   "text-amber-400",
  Skipped:   "text-zinc-500",    skipped:   "text-zinc-500",
};

export function EntityCard({ entity }: EntityCardProps) {
  const [rawOpen, setRawOpen] = useState(false);

  const typeColor =
    TYPE_COLORS[entity.type] ??
    "bg-muted text-muted-foreground border-border";

  const hasData = entity.status || Object.keys(entity.display).length > 0;

  return (
    <Card className="border-border/50 overflow-hidden">
      <CardHeader className="pb-2 pt-3 px-4 space-y-1.5">
        <CardTitle className="text-sm font-mono break-all">
          {entity.identifiers[Object.keys(entity.identifiers)[0]] ?? entity.id}
        </CardTitle>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 ${typeColor}`}
          >
            {entity.type}
          </Badge>
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 font-mono"
          >
            via {entity.discoveredBy.join(", ")}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-3 space-y-3">
        {/* Served data (display fields + status) */}
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
            Served Data
          </div>
          {hasData ? (
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
              {entity.status && (
                <div className="contents">
                  <span className="text-muted-foreground">status</span>
                  <span className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[entity.status] ?? "bg-zinc-500"}`} />
                    <span className={`font-mono ${STATUS_TEXT[entity.status] ?? "text-muted-foreground"}`}>
                      {entity.status}
                    </span>
                  </span>
                </div>
              )}
              {Object.entries(entity.display).map(([key, value]) => (
                <div key={key} className="contents">
                  <span className="text-muted-foreground">{key}</span>
                  <span className="font-mono truncate">
                    {typeof value === "object"
                      ? JSON.stringify(value)
                      : String(value ?? "-")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No display fields</p>
          )}
        </div>

        {/* Identifiers */}
        <div className="flex flex-wrap gap-1">
          {Object.entries(entity.identifiers).map(([type, value]) => (
            <span
              key={type}
              className="inline-flex items-center gap-1 rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono"
              title={`${type}: ${value}`}
            >
              <span className="text-muted-foreground">{type}:</span>
              <span className="truncate max-w-32">{value}</span>
            </span>
          ))}
        </div>

        {/* Raw JSON toggle */}
        <Collapsible open={rawOpen} onOpenChange={setRawOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2 gap-1"
            >
              <ChevronRight
                className={`h-3 w-3 transition-transform ${rawOpen ? "rotate-90" : ""}`}
              />
              <Code className="h-3 w-3" />
              Raw
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-1">
              <CodeBlock data={entity.raw} maxHeight="max-h-64" />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
