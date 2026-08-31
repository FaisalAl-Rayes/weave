import type { WeaveSchema } from "@/lib/schema/types";
import { getProvider } from "@/lib/engine/providers/registry";
import { canListByNamespace } from "@/lib/engine/providers/types";
import { getDatasourceOverride, resolveEnvVars } from "@/lib/datasource-config";
import type { AnalysisParams, DataContext, K8sResource, PulseQueryLogEntry } from "./types";
import type { Flow } from "./types";

export interface DataContextWithLog {
  ctx: DataContext;
  queryLog: PulseQueryLogEntry[];
}

// Builds a shared DataContext for all flows in one analysis run.
// - Deduplicates entity types across all flows
// - Fetches each entity type once per namespace with server-side time filtering
// - KubeArchive handles time range in SQL; no client-side filtering needed
// - Paginates automatically until all matching records are retrieved
export async function buildDataContext(
  params: AnalysisParams,
  schema: WeaveSchema,
  flows: Flow[],
): Promise<DataContextWithLog> {
  const entityTypes = [...new Set(flows.flatMap((f) => f.dependencies))];
  const resources: Record<string, K8sResource[]> = {};
  const queryLog: PulseQueryLogEntry[] = [];

  await Promise.all(
    entityTypes.map(async (entityType) => {
      const entityDef = schema.entities[entityType];
      if (!entityDef?.k8s) return;

      const servingDatasources = Object.entries(schema.datasources).filter(
        ([, def]) => def.serves?.includes(entityType),
      );
      if (servingDatasources.length === 0) return;

      // Prefer KubeArchive — it has historical data and supports server-side time filtering
      const [datasourceName, datasourceDef] =
        servingDatasources.find(([, def]) => def.provider === "kubearchive") ??
        servingDatasources[0];

      const override = getDatasourceOverride(params.projectId, datasourceName);
      const connection = {
        url: override.url ?? resolveEnvVars(datasourceDef.connection.url),
        auth: datasourceDef.connection.auth
          ? resolveAuth(datasourceDef.connection.auth)
          : undefined,
        headers: datasourceDef.connection.headers,
      };

      const provider = getProvider(datasourceDef.provider);
      if (!canListByNamespace(provider)) return;

      // Fetch each namespace in parallel, log each individually
      const perNamespace = await Promise.all(
        params.namespaces.map(async (namespace) => {
          try {
            const items = await provider.listByNamespace(
              entityType,
              {
                namespace,
                entityK8sConfig: entityDef.k8s,
                // Pass time range — KubeArchive applies it server-side in PostgreSQL,
                // eliminating the need to fetch and discard out-of-range records.
                timeRange: { start: params.startTime, end: params.endTime },
                // No outer timeout — fetchAllPages manages per-page timeouts (30s each)
                // so a large paginated sequence doesn't abort before completion.
                // Log one entry per HTTP page so callers can see actual API call count.
                onPage: (pageIndex, recordCount, durationMs) => {
                  queryLog.push({
                    datasource: datasourceName,
                    provider: datasourceDef.provider,
                    entityType,
                    namespace,
                    pageIndex,
                    recordsFetched: recordCount,
                    durationMs,
                    status: "success",
                  });
                },
              },
              connection,
            );
            // If provider doesn't paginate (no onPage calls were made), log a single entry
            const hasPageLog = queryLog.some(
              (e) => e.entityType === entityType && e.namespace === namespace && e.status === "success",
            );
            if (!hasPageLog) {
              queryLog.push({
                datasource: datasourceName,
                provider: datasourceDef.provider,
                entityType,
                namespace,
                pageIndex: 0,
                recordsFetched: items.length,
                durationMs: 0,
                status: "success",
              });
            }
            return items;
          } catch (err) {
            queryLog.push({
              datasource: datasourceName,
              provider: datasourceDef.provider,
              entityType,
              namespace,
              pageIndex: 0,
              recordsFetched: 0,
              durationMs: 0,
              status: "error",
              error: err instanceof Error ? err.message : String(err),
            });
            return [] as unknown[];
          }
        }),
      );

      // Deduplicate by namespace/name (in case namespaces overlap across datasources)
      const seen = new Set<string>();
      const merged: K8sResource[] = [];

      for (const items of perNamespace) {
        for (const item of items) {
          const r = item as K8sResource;
          const key = `${r.metadata?.namespace}/${r.metadata?.name}`;
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(r);
          }
        }
      }

      resources[entityType] = merged;
    }),
  );

  const ctx: DataContext = {
    params,
    resources,
    query: async (datasource: string) => {
      const def = schema.datasources[datasource];
      if (!def) throw new Error(`Datasource '${datasource}' not found`);
      throw new Error(`ctx.query not yet implemented for datasource '${datasource}'`);
    },
  };

  return { ctx, queryLog };
}

function resolveAuth(
  auth: NonNullable<WeaveSchema["datasources"][string]["connection"]["auth"]>,
) {
  const resolved = { ...auth };
  if (typeof resolved.token === "string") resolved.token = resolveEnvVars(resolved.token);
  if (typeof resolved.username === "string") resolved.username = resolveEnvVars(resolved.username);
  if (typeof resolved.password === "string") resolved.password = resolveEnvVars(resolved.password);
  return resolved;
}
