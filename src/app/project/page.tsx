"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SchemaViewer } from "@/components/explore/schema-viewer";
import { SchemaMap } from "@/components/explore/schema-map";
import { EntityEditor } from "@/components/settings/entity-editor";
import { DatasourceEditor } from "@/components/settings/datasource-editor";
import { TraversalEditor } from "@/components/settings/traversal-editor";
import { ProviderIcon } from "@/components/icons/provider-icons";
import { DatasourceConnectionPanel } from "@/components/settings/datasource-connections";
import { DiscoveryWizard } from "@/components/discovery/discovery-wizard";
import {
  useSchema,
  useSchemaRaw,
  useProjects,
} from "@/hooks/use-explore";
import { DEFAULT_PROJECT_ID } from "@/lib/shared";
import type { WeaveSchema } from "@/lib/schema/types";

const SOURCE_COLORS: Record<string, string> = {
  "tekton-pipelines": "#38bdf8",
  "pipelines-as-code": "#f97316",
  konflux: "#a78bfa",
  "cert-manager": "#34d399",
};

const AVAILABLE_PLUGINS = [
  { name: "tekton-pipelines", label: "Tekton Pipelines", description: "Core Tekton resource hierarchy — PipelineRun → TaskRun → Pod with labels and spec refs", detects: "PipelineRun + TaskRun" },
  { name: "pipelines-as-code", label: "Pipelines as Code", description: "PaC labels on PipelineRuns — commit SHA, repo URL, event type, PR number", detects: "PipelineRun with PaC labels" },
  { name: "konflux", label: "Konflux", description: "Konflux-specific labels — application, component, snapshot identifiers", detects: "PipelineRun with Konflux labels" },
  { name: "cert-manager", label: "cert-manager", description: "Certificate → Issuer/ClusterIssuer → Secret relationships", detects: "Certificate + Issuer" },
];

const AVAILABLE_PROVIDERS = [
  { name: "rest", label: "REST", description: "Generic HTTP GET/POST with JSON responses", supportedTypes: ["json", "logs", "metrics", "traces"] },
  { name: "splunk", label: "Splunk", description: "Splunk REST API — blocking search with pagination, oneshot mode", supportedTypes: ["logs", "metrics"] },
  { name: "prometheus", label: "Prometheus", description: "PromQL instant and range queries via /api/v1/query", supportedTypes: ["metrics"] },
  { name: "tempo", label: "Tempo", description: "Trace search by tags and retrieval by ID via /api/v2", supportedTypes: ["traces"] },
  { name: "kubernetes", label: "Kubernetes", description: "Kubernetes API via @kubernetes/client-node", supportedTypes: ["json"] },
];

export default function ProjectPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project") ?? DEFAULT_PROJECT_ID;

  const { data: schema, isLoading, mutate: mutateSchema } = useSchema(projectId);
  const { data: rawYaml } = useSchemaRaw(projectId);
const { data: projectsData } = useProjects();

  const currentProject = projectsData?.projects?.find(
    (p: { id: string }) => p.id === projectId,
  );

  const handleImportDiscoveredSchema = useCallback(
    async (schemaYaml: string) => {
      const YAML = await import("yaml");
      const discovered = YAML.parse(schemaYaml);

      // Merge discovered schema into existing — preserves manually
      // configured datasources, context queries, and traversal config
      const merged = {
        identifiers: { ...schema?.identifiers, ...discovered.identifiers },
        seeds: discovered.seeds?.length > 0 ? discovered.seeds : schema?.seeds ?? [],
        entities: { ...schema?.entities, ...discovered.entities },
        datasources: { ...schema?.datasources, ...discovered.datasources },
        traversal: schema?.traversal ?? discovered.traversal,
        context: schema?.context,
      };

      const res = await fetch("/api/schema", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, schema: merged }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to import schema");
      }
      await mutateSchema();
    },
    [mutateSchema, projectId, schema],
  );

  const handleSaveSchema = useCallback(
    async (updated: WeaveSchema) => {
      const res = await fetch("/api/schema", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, schema: updated }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save schema");
      }
      mutateSchema();
    },
    [mutateSchema, projectId],
  );


  return (
    <div>
      <Header
        title={currentProject?.name ?? projectId}
        breadcrumbs={[
          { label: currentProject?.name ?? projectId },
        ]}
      />

      <div className="flex flex-1 flex-col gap-6 p-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {currentProject?.name ?? projectId}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Schema, datasource connections, and configuration for this project.
          </p>
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview" className="text-xs">
              Overview
            </TabsTrigger>
            <TabsTrigger value="connections" className="text-xs">
              Connections
            </TabsTrigger>
            <TabsTrigger value="schema-editor" className="text-xs">
              Schema Editor
            </TabsTrigger>
            <TabsTrigger value="schema" className="text-xs">
              Schema
            </TabsTrigger>
          </TabsList>

          {/* Overview: Schema Map + Discovery + Providers */}
          <TabsContent value="overview" className="mt-4 space-y-6">
            {isLoading ? (
              <Skeleton className="h-96 rounded-lg" />
            ) : (
              <SchemaMap schema={schema} />
            )}

            <DiscoveryWizard
              projectId={projectId}
              onImport={handleImportDiscoveredSchema}
            />

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Available Providers</CardTitle>
                <CardDescription>Platform-provided adapters for connecting to datasources.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {AVAILABLE_PROVIDERS.map((provider) => (
                    <div key={provider.name} className="rounded-lg border border-border p-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <ProviderIcon provider={provider.name} className="h-3.5 w-3.5" />
                        <span className="text-sm font-medium">{provider.label}</span>
                        <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0 font-mono">{provider.name}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{provider.description}</p>
                      <div className="flex gap-1">
                        {provider.supportedTypes.map((t) => (
                          <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0">{t}</Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Available Plugins</CardTitle>
                <CardDescription>Domain plugins for auto-discovering schema from known resource types.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {AVAILABLE_PLUGINS.map((plugin) => (
                    <div key={plugin.name} className="rounded-lg border border-border p-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: SOURCE_COLORS[plugin.name] ?? "#71717a" }} />
                        <span className="text-sm font-medium">{plugin.label}</span>
                        <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0 font-mono">{plugin.name}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{plugin.description}</p>
                      <div className="text-[10px] text-muted-foreground/60">
                        Detects: {plugin.detects}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Connections: Datasource runtime config */}
          <TabsContent value="connections" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Datasource Connections</CardTitle>
                <CardDescription>Configure connection details and test datasource connectivity.</CardDescription>
              </CardHeader>
              <CardContent>
                <DatasourceConnectionPanel projectId={projectId} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Schema Editor: Entities, Datasources, Traversal */}
          <TabsContent value="schema-editor" className="mt-4 space-y-6">
            {isLoading ? (
              <Skeleton className="h-48 rounded-lg" />
            ) : schema ? (
              <>
                <EntityEditor schema={schema} onSave={handleSaveSchema} />
                <DatasourceEditor schema={schema} onSave={handleSaveSchema} />
                <TraversalEditor schema={schema} onSave={handleSaveSchema} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No schema loaded.</p>
            )}
          </TabsContent>

          {/* Raw Schema YAML */}
          <TabsContent value="schema" className="mt-4">
            <SchemaViewer schema={schema} rawYaml={rawYaml ?? null} />
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}
