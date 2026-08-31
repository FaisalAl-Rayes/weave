import type { WeaveSchema, DatasourceDef, EntityDef, ContextQueryDef } from "@/lib/schema/types";
import type { GraphEntity, GraphEdge, KnowledgeGraph, QueryLogEntry } from "./types";
import type { ConnectionConfig, EnrichQueryConfig } from "./providers/types";
import { extractValue, extractValues } from "@/lib/schema/jsonpath";
import { applyFieldMap } from "./field-map";
import { getProvider } from "./providers/registry";
import {
  canServeByIdentifier,
  canEnrich,
} from "./providers/types";
import {
  getDatasourceOverride,
  resolveEnvVars,
} from "@/lib/datasource-config";

interface PendingRef {
  identifierType: string;
  value: string;
  sourceEntityId?: string;
  sourceField?: string;
}

function resolveConnection(
  datasourceDef: DatasourceDef,
  override: ReturnType<typeof getDatasourceOverride>,
): ConnectionConfig {
  const conn = datasourceDef.connection;
  return {
    url: override.url ?? resolveEnvVars(conn.url),
    auth: resolveAuth(override.auth ?? conn.auth),
    headers: conn.headers,
  };
}

function resolveAuth(
  auth: DatasourceDef["connection"]["auth"],
): ConnectionConfig["auth"] {
  if (!auth) return auth;
  const resolved = { ...auth };
  if (typeof resolved.username === "string") resolved.username = resolveEnvVars(resolved.username);
  if (typeof resolved.password === "string") resolved.password = resolveEnvVars(resolved.password);
  if (typeof resolved.token === "string") resolved.token = resolveEnvVars(resolved.token);
  return resolved;
}

// Worker-pool concurrency limiter — no external dependency needed.
async function withConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  });
  await Promise.all(workers);
  return results;
}

export interface TraversalOptions {
  // Override traversal depth for this request. Capped at schema.traversal.max_depth.
  depth?: number;
}

// One batch = one provider call for all collected identifier values of the same
// (datasource, entityType, identifierType) group at a single BFS level.
interface Batch {
  datasourceName: string;
  datasourceDef: DatasourceDef;
  entityType: string;
  entityDef: EntityDef;
  identifierType: string;
  pendingRefs: PendingRef[];
  values: string[];
}

export async function traverse(
  projectId: string,
  schema: WeaveSchema,
  seedIdentifierType: string,
  seedValue: string,
  options: TraversalOptions = {},
): Promise<KnowledgeGraph> {
  const startTime = Date.now();
  const maxDepth = Math.min(
    options.depth ?? schema.traversal.max_depth,
    schema.traversal.max_depth,
  );

  const queryCache = new Set<string>();
  const entityCache = new Map<string, GraphEntity>();
  const edges: GraphEdge[] = [];
  const queryLog: QueryLogEntry[] = [];
  let queriesExecuted = 0;

  const timeoutMs = schema.traversal.timeout_seconds * 1000;

  let pendingQueue: PendingRef[] = [
    { identifierType: seedIdentifierType, value: seedValue },
  ];
  let depth = 0;

  while (
    pendingQueue.length > 0 &&
    depth < maxDepth &&
    entityCache.size < schema.traversal.max_total_entities &&
    Date.now() - startTime < timeoutMs
  ) {
    const nextQueue: PendingRef[] = [];

    // ---------------------------------------------------------------
    // Phase A — collect batches (no I/O)
    // Group all pending refs by (datasource, entityType, identifierType).
    // One batch = one provider call with all collected values.
    //
    // Cache pre-commitment: values are written to queryCache here (Phase A), not
    // when the provider call completes. If a batch task exits early (entity cap or
    // timeout) those values are permanently marked as fetched and won't be retried.
    // This is intentional — cache-first semantics prevent retry storms.
    // ---------------------------------------------------------------
    const batchMap = new Map<string, Batch>();

    for (const pending of pendingQueue) {
      for (const [datasourceName, datasourceDef] of Object.entries(schema.datasources)) {
        if (!datasourceDef.serves) continue;

        for (const entityType of datasourceDef.serves) {
          const entityDef = schema.entities[entityType];
          if (!entityDef) continue;
          if (!(pending.identifierType in entityDef.identifiers)) continue;
          if (!entityDef.k8s?.identifierSelectors?.[pending.identifierType]) continue;

          const cacheKey = `${datasourceName}::${entityType}::${pending.identifierType}::${pending.value}`;
          if (queryCache.has(cacheKey)) continue;
          queryCache.add(cacheKey);

          const batchKey = `${datasourceName}::${entityType}::${pending.identifierType}`;
          if (!batchMap.has(batchKey)) {
            batchMap.set(batchKey, {
              datasourceName,
              datasourceDef,
              entityType,
              entityDef,
              identifierType: pending.identifierType,
              pendingRefs: [],
              values: [],
            });
          }
          const batch = batchMap.get(batchKey)!;
          batch.pendingRefs.push(pending);
          batch.values.push(pending.value);
        }
      }
    }

    // ---------------------------------------------------------------
    // Phase B — execute batches (I/O, with concurrency limit)
    // One task per batch → one provider call with all collected values.
    // ---------------------------------------------------------------
    const tasks: (() => Promise<void>)[] = [];

    for (const batch of batchMap.values()) {
      const { datasourceName, datasourceDef, entityType, entityDef, identifierType, pendingRefs, values } = batch;

      // Build lookup: identifierValue → ALL originating PendingRefs.
      // Use an array per key — multiple source entities can share the same identifier
      // value (e.g. two PipelineRuns both pointing to the same Snapshot name).
      // A Map<value, singleRef> would silently drop all but the last source.
      const pendingsByValue = new Map<string, PendingRef[]>();
      for (const ref of pendingRefs) {
        if (!pendingsByValue.has(ref.value)) pendingsByValue.set(ref.value, []);
        pendingsByValue.get(ref.value)!.push(ref);
      }

      // Derive "triggered by" from the first pending ref's source entity.
      // Note: a batch may contain refs from different source entity types if the schema
      // has multiple entity types with the same identifierSelector key; triggeredBy
      // shows the first source and is informational only.
      const firstRef = pendingRefs[0];
      const triggeredBy = firstRef.sourceEntityId
        ? {
            entityType: firstRef.sourceEntityId.split(":")[0],
            field: firstRef.sourceField ?? identifierType,
          }
        : undefined;

      tasks.push(async () => {
        if (entityCache.size >= schema.traversal.max_total_entities) return;

        const remainingMs = timeoutMs - (Date.now() - startTime);
        if (remainingMs <= 0) return;
        const signal = AbortSignal.timeout(remainingMs);

        const queryStart = Date.now();
        const override = getDatasourceOverride(projectId, datasourceName);
        const providerType = datasourceDef.provider;
        const connection = resolveConnection(datasourceDef, override);
        const provider = getProvider(providerType);

        if (!canServeByIdentifier(provider)) return;

        try {
          const rawEntities = await provider.serveByIdentifiers(
            entityType,
            { identifierType, values, entityK8sConfig: entityDef.k8s, signal },
            connection,
          );

          queriesExecuted++;
          let entitiesFound = 0;

          for (const rawEntity of rawEntities) {
            if (entityCache.size >= schema.traversal.max_total_entities) break;

            const canonical = applyFieldMap(rawEntity, undefined);

            const identifiers: Record<string, string> = {};
            for (const [idType, sourcedPath] of Object.entries(entityDef.identifiers)) {
              const val = extractValue(canonical, sourcedPath.path);
              if (val !== undefined && val !== null) identifiers[idType] = String(val);
            }

            const primaryIdType = Object.keys(entityDef.identifiers)[0];
            const primaryId = identifiers[primaryIdType];
            if (!primaryId) continue;

            const entityId = `${entityType}:${primaryId}`;

            // Attribute edges: find ALL pending refs that produced this entity
            // by matching the entity's extracted identifier value back to the batch.
            const matchingValue = identifiers[identifierType];
            const originRefs = matchingValue ? (pendingsByValue.get(matchingValue) ?? []) : [];

            const display: Record<string, unknown> = {};
            if (entityDef.display) {
              for (const [displayName, sourcedPath] of Object.entries(entityDef.display)) {
                const val = extractValue(canonical, sourcedPath.path);
                if (val !== undefined) display[displayName] = val;
              }
            }

            if (entityCache.has(entityId)) {
              const existing = entityCache.get(entityId)!;
              if (!existing.discoveredBy.includes(datasourceName)) {
                existing.discoveredBy.push(datasourceName);
              }
              for (const [k, v] of Object.entries(identifiers)) {
                if (!existing.identifiers[k]) existing.identifiers[k] = v;
              }
              for (const [k, v] of Object.entries(display)) {
                if (existing.display[k] === undefined) existing.display[k] = v;
              }
              const existingKeys = Object.keys(existing.raw as Record<string, unknown> ?? {}).length;
              const newKeys = Object.keys(canonical as Record<string, unknown> ?? {}).length;
              if (newKeys > existingKeys) existing.raw = canonical;

              for (const originRef of originRefs) {
                if (originRef.sourceEntityId && originRef.sourceField) {
                  edges.push({
                    source: originRef.sourceEntityId,
                    target: entityId,
                    referenceField: originRef.sourceField,
                    identifierType,
                    datasourceName,
                  });
                }
              }
              continue;
            }

            entitiesFound++;

            entityCache.set(entityId, {
              id: entityId,
              type: entityType,
              label: entityDef.label,
              format: entityDef.format,
              identifiers,
              display,
              enrichments: {},
              raw: canonical,
              discoveredBy: [datasourceName],
              depth,
              status: entityDef.status?.path
                ? (extractValue(canonical, entityDef.status.path) as string | undefined)
                : undefined,
            });

            for (const originRef of originRefs) {
              if (originRef.sourceEntityId && originRef.sourceField) {
                edges.push({
                  source: originRef.sourceEntityId,
                  target: entityId,
                  referenceField: originRef.sourceField,
                  identifierType,
                  datasourceName,
                });
              }
            }

            if (entityDef.references) {
              for (const ref of entityDef.references) {
                const refValues = extractValues(canonical, ref.field);
                for (const refVal of refValues) {
                  if (refVal !== undefined && refVal !== null) {
                    nextQueue.push({
                      identifierType: ref.as,
                      value: String(refVal),
                      sourceEntityId: entityId,
                      sourceField: ref.field,
                    });
                  }
                }
              }
            }
          }

          queryLog.push({
            timestamp: new Date().toISOString(),
            datasource: datasourceName,
            providerType,
            entityType,
            identifierType,
            identifierValue: values.join(","),
            valueCount: values.length,
            status: "success",
            entitiesFound,
            duration: Date.now() - queryStart,
            depth,
            triggeredBy,
          });
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            queryLog.push({
              timestamp: new Date().toISOString(),
              datasource: datasourceName,
              providerType,
              entityType,
              identifierType,
              identifierValue: values.join(","),
              valueCount: values.length,
              status: "skipped",
              entitiesFound: 0,
              duration: Date.now() - queryStart,
              depth,
              triggeredBy,
              error: "timeout — query aborted",
            });
            return;
          }
          queryLog.push({
            timestamp: new Date().toISOString(),
            datasource: datasourceName,
            providerType,
            entityType,
            identifierType,
            identifierValue: values.join(","),
            valueCount: values.length,
            status: "error",
            entitiesFound: 0,
            duration: Date.now() - queryStart,
            error: err instanceof Error ? err.message : String(err),
            depth,
            triggeredBy,
          });
        }
      });
    }

    await withConcurrency(tasks, schema.traversal.concurrency);

    // Cap the next level queue and log if truncated
    const queueLimit = schema.traversal.max_queue_per_level;
    if (nextQueue.length > queueLimit) {
      queryLog.push({
        timestamp: new Date().toISOString(),
        datasource: "traversal",
        providerType: "internal",
        entityType: "queue",
        identifierType: "n/a",
        identifierValue: "n/a",
        valueCount: 1,
        status: "skipped",
        entitiesFound: 0,
        duration: 0,
        depth,
        error: `Queue capped at ${queueLimit} (${nextQueue.length - queueLimit} refs dropped)`,
      });
    }
    pendingQueue = nextQueue.slice(0, queueLimit);
    depth++;
  }

  // Resolve reference edges between discovered entities
  const edgeSet = new Set(edges.map((e) => `${e.source}->${e.target}::${e.identifierType}`));
  const identIndex = new Map<string, GraphEntity>();
  for (const entity of entityCache.values()) {
    for (const [idType, idValue] of Object.entries(entity.identifiers)) {
      identIndex.set(`${entity.type}::${idType}::${idValue}`, entity);
    }
  }

  for (const entity of entityCache.values()) {
    const entityDef = schema.entities[entity.type];
    if (!entityDef?.references) continue;

    for (const ref of entityDef.references) {
      const refValues = extractValues(entity.raw, ref.field);
      for (const refVal of refValues) {
        if (refVal === undefined || refVal === null) continue;
        const target = identIndex.get(`${ref.points_to}::${ref.as}::${String(refVal)}`);
        if (target && target.id !== entity.id) {
          const edgeKey = `${entity.id}->${target.id}::${ref.as}`;
          if (!edgeSet.has(edgeKey)) {
            edgeSet.add(edgeKey);
            edges.push({
              source: entity.id,
              target: target.id,
              referenceField: ref.field,
              identifierType: ref.as,
              datasourceName: entity.discoveredBy[0] ?? "",
            });
          }
        }
      }
    }
  }

  return {
    entities: Array.from(entityCache.values()),
    edges,
    seed: { identifierType: seedIdentifierType, value: seedValue },
    queryLog,
    stats: {
      totalEntities: entityCache.size,
      totalEdges: edges.length,
      depthReached: depth,
      duration: Date.now() - startTime,
      queriesExecuted,
    },
  };
}

export interface EnrichmentResult {
  raw: unknown;
  pagination?: { sid: string; offset: number; count: number; total: number };
}

export async function runEnrichment(
  projectId: string,
  schema: WeaveSchema,
  datasourceName: string,
  queryName: string,
  entityType: string,
  entityIdentifiers: Record<string, string>,
  entityDisplay: Record<string, unknown>,
  timeRange?: { start: string; end: string },
  pagination?: { sid?: string; offset?: number; fetchAll?: boolean },
): Promise<EnrichmentResult> {
  const datasourceDef = schema.datasources[datasourceName];
  if (!datasourceDef?.enriches?.[entityType]) return { raw: null };

  const queryEntry = datasourceDef.enriches[entityType].queries[queryName];
  if (!queryEntry) return { raw: null };

  const override = getDatasourceOverride(projectId, datasourceName);
  const connection = resolveConnection(datasourceDef, override);
  const provider = getProvider(datasourceDef.provider);

  if (!canEnrich(provider)) return { raw: null };

  const result = await provider.enrich(
    entityType,
    {
      queryName,
      queryConfig: queryEntry.query,
      identifiers: entityIdentifiers,
      display: entityDisplay,
      timeRange,
      pagination,
    },
    connection,
  );

  return { raw: result.raw, pagination: result.pagination };
}

export async function runContextQuery(
  projectId: string,
  schema: WeaveSchema,
  queryName: string,
  start: string,
  end: string,
): Promise<unknown> {
  if (!schema.context) return null;

  const contextDef: ContextQueryDef | undefined = schema.context[queryName];
  if (!contextDef) return null;

  const datasourceName = contextDef.datasource;
  const datasourceDef = schema.datasources[datasourceName];
  if (!datasourceDef) {
    throw new Error(`Context query "${queryName}" references unknown datasource "${datasourceName}"`);
  }

  const override = getDatasourceOverride(projectId, datasourceName);
  const connection = resolveConnection(datasourceDef, override);
  const provider = getProvider(datasourceDef.provider);

  if (!canEnrich(provider)) {
    throw new Error(`Datasource "${datasourceName}" (provider: ${datasourceDef.provider}) does not support enrichment — cannot run context query "${queryName}"`);
  }

  // Context queries use EnrichQueryConfig. The query field must have a type discriminant.
  // ContextQueryDef.query is still Record<string, unknown> — validated at parse time in a future refactor.
  const rawQuery = contextDef.query as Record<string, unknown>;
  if (!rawQuery.type || typeof rawQuery.type !== "string") {
    throw new Error(`Context query "${queryName}" is missing a required "type" field (e.g. type: promql)`);
  }

  const result = await provider.enrich(
    "__context__",
    {
      queryName,
      queryConfig: rawQuery as EnrichQueryConfig,
      identifiers: {},
      display: {},
      timeRange: { start, end },
    },
    connection,
  );

  return result.raw;
}
