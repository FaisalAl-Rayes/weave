"use client";

import { useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { KnowledgeGraph, GraphEntity, GraphEdge } from "@/lib/engine/types";
import {
  Network,
  GitBranch,
  Layers,
  Timer,
  Search,
  Download,
  Copy,
} from "lucide-react";

interface TraversalStatsProps {
  stats: KnowledgeGraph["stats"];
  seed: KnowledgeGraph["seed"];
  entities: GraphEntity[];
  edges: GraphEdge[];
  enrichments: Record<string, Record<string, unknown>>;
}

function buildExport(
  seed: KnowledgeGraph["seed"],
  stats: KnowledgeGraph["stats"],
  entities: GraphEntity[],
  edges: GraphEdge[],
  enrichments: Record<string, Record<string, unknown>>,
) {
  return {
    exported_at: new Date().toISOString(),
    seed,
    stats,
    entities: entities.map((e) => ({
      type: e.type,
      label: e.label,
      identifiers: e.identifiers,
      display: e.display,
      discoveredBy: e.discoveredBy,
      enrichments: enrichments[e.id] ?? {},
    })),
    edges: edges.map((e) => ({
      source: e.source,
      target: e.target,
      via: e.identifierType,
      datasource: e.datasourceName,
    })),
  };
}

export function TraversalStats({
  stats,
  seed,
  entities,
  edges,
  enrichments,
}: TraversalStatsProps) {
  const handleCopy = useCallback(() => {
    const data = buildExport(seed, stats, entities, edges, enrichments);
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  }, [seed, stats, entities, edges, enrichments]);

  const handleDownload = useCallback(() => {
    const data = buildExport(seed, stats, entities, edges, enrichments);
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `weave-${seed.identifierType}-${seed.value.slice(0, 12)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [seed, stats, entities, edges, enrichments]);

  const enrichmentCount = Object.values(enrichments).reduce(
    (sum, e) => sum + Object.keys(e).length,
    0,
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline" className="gap-1.5 text-xs font-normal">
        <Network className="h-3 w-3" />
        {stats.totalEntities} entities
      </Badge>
      <Badge variant="outline" className="gap-1.5 text-xs font-normal">
        <GitBranch className="h-3 w-3" />
        {stats.totalEdges} edges
      </Badge>
      <Badge variant="outline" className="gap-1.5 text-xs font-normal">
        <Layers className="h-3 w-3" />
        depth {stats.depthReached}
      </Badge>
      <Badge variant="outline" className="gap-1.5 text-xs font-normal">
        <Search className="h-3 w-3" />
        {stats.queriesExecuted} queries
      </Badge>
      <Badge variant="outline" className="gap-1.5 text-xs font-normal">
        <Timer className="h-3 w-3" />
        {stats.duration}ms
      </Badge>
      {enrichmentCount > 0 && (
        <Badge
          variant="outline"
          className="gap-1.5 text-xs font-normal text-emerald-400 border-emerald-500/30"
        >
          {enrichmentCount} enrichment{enrichmentCount !== 1 ? "s" : ""}
        </Badge>
      )}

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1.5 px-2"
          onClick={handleCopy}
        >
          <Copy className="h-3 w-3" />
          Copy
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5 px-2"
          onClick={handleDownload}
        >
          <Download className="h-3 w-3" />
          Export
        </Button>
      </div>
    </div>
  );
}
