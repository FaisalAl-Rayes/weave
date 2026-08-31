"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { QueryLogEntry } from "@/lib/engine/types";
import { CodeBlock } from "@/components/ui/code-block";
import { Check, X, Clock, Database, AlertTriangle, ChevronRight, ArrowRight } from "lucide-react";

const STATUS_STYLES: Record<string, { color: string; icon: React.ReactNode; bg: string }> = {
  success: {
    color: "text-emerald-400",
    icon: <Check className="h-3 w-3" />,
    bg: "bg-emerald-500/10 border-emerald-500/20",
  },
  error: {
    color: "text-red-400",
    icon: <X className="h-3 w-3" />,
    bg: "bg-red-500/10 border-red-500/20",
  },
  skipped: {
    color: "text-zinc-500",
    icon: <AlertTriangle className="h-3 w-3" />,
    bg: "bg-zinc-500/10 border-zinc-500/20",
  },
};

function ValuesDisplay({ entry }: { entry: QueryLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const count = entry.valueCount ?? 1;
  const values = entry.identifierValue.split(",");

  if (count <= 1) {
    return (
      <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">
        {entry.identifierType}={values[0]}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
      className="text-[10px] text-muted-foreground font-mono hover:text-foreground transition-colors"
      title={entry.identifierValue}
    >
      {entry.identifierType}=[{expanded ? values.join(", ") : `${count} values`}]
    </button>
  );
}

function QueryLogRow({ entry }: { entry: QueryLogEntry }) {
  const [open, setOpen] = useState(false);
  const style = STATUS_STYLES[entry.status] ?? STATUS_STYLES.skipped;
  const hasDetails = entry.query || entry.response || entry.error;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={`w-full rounded-md border px-3 py-2 text-left ${style.bg} ${hasDetails ? "cursor-pointer" : ""}`}
        disabled={!hasDetails}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {hasDetails && (
            <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform shrink-0 ${open ? "rotate-90" : ""}`} />
          )}
          <span className={style.color}>{style.icon}</span>

          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono shrink-0">
            {entry.datasource}
          </Badge>

          <span className="text-xs font-medium">{entry.entityType}</span>

          <ValuesDisplay entry={entry} />

          {entry.triggeredBy && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
              <ArrowRight className="h-2.5 w-2.5" />
              via {entry.triggeredBy.entityType}
              <span className="font-mono">.{entry.triggeredBy.field.replace(/^metadata\./, "")}</span>
            </span>
          )}

          <span className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground shrink-0">
            {entry.status === "success" && entry.entitiesFound > 0 && (
              <span className="text-emerald-400">{entry.entitiesFound} found</span>
            )}
            {entry.status === "success" && entry.entitiesFound === 0 && (
              <span className="text-muted-foreground/50">0 found</span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              {entry.duration}ms
            </span>
          </span>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="ml-5 mt-1 space-y-2 pb-1">
          {entry.error && (
            <div>
              <span className="text-[10px] font-medium text-red-400 uppercase tracking-wider">Error</span>
              <pre className="text-xs text-red-400 font-mono bg-red-500/5 rounded p-2 mt-0.5 whitespace-pre-wrap break-all">
                {entry.error}
              </pre>
            </div>
          )}
          {entry.query != null && (
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Query</span>
              <CodeBlock data={entry.query} maxHeight="max-h-40" />
            </div>
          )}
          {entry.response !== undefined && (
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Response</span>
              <CodeBlock data={entry.response} maxHeight="max-h-64" />
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function DepthGroup({ depth, entries }: { depth: number; entries: QueryLogEntry[] }) {
  const [open, setOpen] = useState(true);
  const totalMs = entries.reduce((s, e) => s + e.duration, 0);
  const found = entries.reduce((s, e) => s + e.entitiesFound, 0);
  const errors = entries.filter((e) => e.status === "error").length;
  const label = depth === 0 ? "Seed" : `Depth ${depth}`;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted/30 transition-colors">
        <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="text-xs font-medium">{label}</span>
        <span className="text-[10px] text-muted-foreground">{entries.length} quer{entries.length === 1 ? "y" : "ies"}</span>
        {found > 0 && <span className="text-[10px] text-emerald-400">{found} found</span>}
        {errors > 0 && <span className="text-[10px] text-red-400">{errors} error{errors > 1 ? "s" : ""}</span>}
        <span className="ml-auto text-[10px] text-muted-foreground">{totalMs}ms</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-4 mt-1 space-y-1">
          {entries.map((entry, i) => <QueryLogRow key={i} entry={entry} />)}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function QueryLog({ entries }: { entries: QueryLogEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No queries executed yet.</p>;
  }

  const errors = entries.filter((e) => e.status === "error");
  const totalEntities = entries.reduce((s, e) => s + e.entitiesFound, 0);
  const totalMs = entries.reduce((s, e) => s + e.duration, 0);

  // Group by depth
  const byDepth = new Map<number, QueryLogEntry[]>();
  for (const entry of entries) {
    const d = entry.depth ?? 0;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(entry);
  }
  const sortedDepths = [...byDepth.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <div className="space-y-2">
      {/* Summary */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="gap-1.5 text-xs font-normal">
          <Database className="h-3 w-3" />
          {entries.length} queries
        </Badge>
        <Badge variant="outline" className="gap-1.5 text-xs font-normal text-emerald-400 border-emerald-500/30">
          <Check className="h-3 w-3" />
          {totalEntities} entities
        </Badge>
        {errors.length > 0 && (
          <Badge variant="outline" className="gap-1.5 text-xs font-normal text-red-400 border-red-500/30">
            <X className="h-3 w-3" />
            {errors.length} failed
          </Badge>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-1">
          <Clock className="h-2.5 w-2.5" />{totalMs}ms total
        </span>
      </div>

      {/* Depth groups */}
      <div className="space-y-0.5">
        {sortedDepths.map(([depth, depthEntries]) => (
          <DepthGroup key={depth} depth={depth} entries={depthEntries} />
        ))}
      </div>
    </div>
  );
}
