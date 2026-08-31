"use client";

import { useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SeedInput } from "@/components/explore/seed-input";
import { GraphView } from "@/components/explore/graph-view";
import { EntityList } from "@/components/explore/entity-list";
import { TraversalStats } from "@/components/explore/traversal-stats";
import { QueryLog } from "@/components/explore/query-log";
import { TimelineView } from "@/components/explore/timeline-view";
import { ContextPanel } from "@/components/explore/context-panel";
import {
  useExplore,
  useSchema,
} from "@/hooks/use-explore";
import { DEFAULT_PROJECT_ID } from "@/lib/shared";

export default function ExplorePage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project") ?? DEFAULT_PROJECT_ID;

  // URL params allow deep-linking from Pulse drill-down:
  //   ?seed_type=pipelinerun_name&seed_value=xxx&depth=2
  const urlSeedType = searchParams.get("seed_type") ?? undefined;
  const urlSeedValue = searchParams.get("seed_value") ?? undefined;
  const urlDepthRaw = searchParams.get("depth");
  const urlDepth = urlDepthRaw != null ? parseInt(urlDepthRaw, 10) : undefined;

  const [seedType, setSeedType] = useState<string | undefined>(urlSeedType);
  const [seedValue, setSeedValue] = useState<string | undefined>(urlSeedValue);
  const [depth, setDepth] = useState<number | undefined>(
    urlDepth != null && !isNaN(urlDepth) ? urlDepth : undefined,
  );

  const [enrichments, setEnrichments] = useState<
    Record<string, Record<string, unknown>>
  >({});

  const { data: schema } = useSchema(projectId);
  const { data: graphData, isLoading: exploring } = useExplore(
    projectId,
    seedType,
    seedValue,
    depth,
  );

  const handleExplore = useCallback(
    (type: string, value: string) => {
      setSeedType(type);
      setSeedValue(value);
      setDepth(undefined); // reset depth override when user manually explores
      setEnrichments({});
    },
    [],
  );

  const handleRunEnrichment = useCallback(
    async (
      entityId: string,
      datasource: string,
      queryName: string,
      as: string,
      timeRange?: { start: string; end: string },
      pagination?: { sid?: string; offset?: number; fetchAll?: boolean },
    ) => {
      const entity = graphData?.entities?.find(
        (e: { id: string }) => e.id === entityId,
      );
      if (!entity) return;

      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          datasource,
          queryName,
          entityType: entity.type,
          identifiers: entity.identifiers,
          display: entity.display,
          timeRange,
          pagination,
        }),
      });

      if (!res.ok) return;
      const data = await res.json();

      setEnrichments((prev) => ({
        ...prev,
        [entityId]: {
          ...(prev[entityId] ?? {}),
          [`${datasource}::${as}`]: data.result,
          [`${datasource}::${as}__pagination`]: data.pagination ?? null,
        },
      }));
    },
    [graphData, projectId],
  );

  const entities = graphData?.entities ?? [];
  const edges = graphData?.edges ?? [];

  return (
    <div>
      <Header title="Explore" breadcrumbs={[{ label: "Explore" }]} />

      <div className="flex flex-1 flex-col gap-4 p-4">
        <SeedInput
          schema={schema}
          isLoading={exploring}
          onExplore={handleExplore}
        />

        {exploring && (
          <div className="space-y-3">
            <Skeleton className="h-8 w-64 rounded" />
            <Skeleton className="h-48 rounded-lg" />
          </div>
        )}

        {graphData && !exploring && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                {graphData.seed.identifierType}: {graphData.seed.value}
              </Badge>
              <TraversalStats
                stats={graphData.stats}
                seed={graphData.seed}
                entities={entities}
                edges={edges}
                enrichments={enrichments}
              />
            </div>

            <Tabs defaultValue="graph">
              <TabsList>
                <TabsTrigger value="graph" className="text-xs">
                  Graph
                </TabsTrigger>
                <TabsTrigger value="timeline" className="text-xs">
                  Timeline
                </TabsTrigger>
                <TabsTrigger value="context" className="text-xs">
                  Context
                </TabsTrigger>
                <TabsTrigger value="entities" className="text-xs">
                  Entities
                  <Badge
                    variant="secondary"
                    className="ml-1.5 text-[10px] px-1.5 py-0"
                  >
                    {entities.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="query-log" className="text-xs">
                  Query Log
                  {(graphData?.queryLog?.some((e: { status: string }) => e.status === "error")) && (
                    <Badge
                      variant="destructive"
                      className="ml-1.5 text-[10px] px-1.5 py-0"
                    >
                      {graphData.queryLog.filter((e: { status: string }) => e.status === "error").length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="graph" className="mt-3">
                <GraphView
                  entities={entities}
                  edges={edges}
                  seedIdentifierType={seedType ?? ""}
                  seedValue={seedValue ?? ""}
                  schema={schema}
                  enrichments={enrichments}
                  onRunEnrichment={handleRunEnrichment}
                />
              </TabsContent>

              <TabsContent value="timeline" className="mt-3">
                <TimelineView entities={entities} edges={edges} />
              </TabsContent>

              <TabsContent value="context" className="mt-3">
                <ContextPanel
                  entities={entities}
                  schema={schema}
                  projectId={projectId}
                />
              </TabsContent>

              <TabsContent value="entities" className="mt-3">
                <EntityList entities={entities} />
              </TabsContent>

              <TabsContent value="query-log" className="mt-3">
                <QueryLog entries={graphData?.queryLog ?? []} />
              </TabsContent>
            </Tabs>
          </>
        )}

        {!graphData && !exploring && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Enter a seed identifier above to start exploring.
          </p>
        )}
      </div>
    </div>
  );
}
