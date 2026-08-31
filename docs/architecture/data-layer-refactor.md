# Data Layer Refactor

## Problem

The current `Provider` interface uses a single `execute(query: ProviderQuery)` method for three fundamentally different operations: graph traversal, enrichment, and context queries. `ProviderQuery.queryConfig` is `Record<string, unknown>` — an opaque blob. Providers detect which operation they're performing at runtime via undocumented conventions (e.g. Splunk checks `responseMapping?.list_path`).

This design reached its limit when Pulse needed a fourth operation — bulk list by time range — which cannot be expressed through the current interface without another implicit convention.

---

## What stays in YAML, what moves to TypeScript

Two different things live in the schema's `serves` and `enriches` sections today:

**Query logic** — how to build label selectors, how to paginate, how to construct K8s API paths. This is code masquerading as config. It moves to TypeScript provider methods.

**Query templates** — PromQL expressions, Splunk SPL strings. These are configuration values whose content is meaningful. They stay in YAML but become typed rather than opaque blobs.

| Schema section | After refactor |
|---------------|----------------|
| `entities.*` | Stays — add `k8s` block with endpoint + identifier→label mapping |
| `datasources.*.connection` | Stays — env var substitution unchanged |
| `datasources.*.serves` | **Removed** — logic moves to `serveByIdentifier()` provider method |
| `datasources.*.enriches` | **Stays** — templates stay, typed not blob, execution in `enrich()` |
| `identifiers`, `seeds` | Stays unchanged |
| `traversal` | Stays — but `max_entities_per_hop` renamed to `max_queue_per_level` (see Traversal section) |

---

## New type system

### Capability interfaces

```typescript
export type ProviderCapability =
  | 'serve:by-identifier'
  | 'serve:list-namespace'
  | 'enrich';

export interface BaseProvider {
  readonly type: string;
  readonly capabilities: ReadonlySet<ProviderCapability>;
}

// Graph traversal — find entities related to a known identifier
export interface ServesByIdentifier extends BaseProvider {
  serveByIdentifier(
    entityType: string,
    query: ByIdentifierQuery,
    config: DatasourceDef,
  ): Promise<unknown[]>;
}

// Bulk list — fetch all entities in a namespace (Pulse)
export interface ListsByNamespace extends BaseProvider {
  listByNamespace(
    entityType: string,
    query: ListNamespaceQuery,
    config: DatasourceDef,
  ): Promise<unknown[]>;
}

// Enrichment — add data to a known entity
export interface Enriches extends BaseProvider {
  enrich(
    entityType: string,
    query: EnrichQuery,
    config: DatasourceDef,
  ): Promise<EnrichResult>;
}
```

### Typed query objects

```typescript
export interface ByIdentifierQuery {
  identifierType: string;
  value: string;
  entityK8sConfig?: EntityK8sConfig; // from entity def — endpoint, label key
}

export interface ListNamespaceQuery {
  namespace: string;
  timeRange?: { start: Date; end: Date };
  labelSelector?: string;
}

export interface EnrichQuery {
  queryName: string;
  queryConfig: EnrichQueryConfig;   // typed — replaces Record<string, unknown>
  identifiers: Record<string, string>;
  display: Record<string, unknown>;
  timeRange?: { start: string; end: string };
  pagination?: { sid?: string; offset?: number; fetchAll?: boolean };
}

export interface EnrichResult {
  raw: unknown;
  entities: unknown[];
  pagination?: PaginationInfo;
}
```

### Type guards — the only way callers discover capabilities

```typescript
export function canServeByIdentifier(p: BaseProvider): p is ServesByIdentifier {
  return p.capabilities.has('serve:by-identifier');
}

export function canListByNamespace(p: BaseProvider): p is ListsByNamespace {
  return p.capabilities.has('serve:list-namespace');
}

export function canEnrich(p: BaseProvider): p is Enriches {
  return p.capabilities.has('enrich');
}
```

---

## Schema type changes

### `EntityDef` — add K8s resource config

```typescript
export interface EntityK8sConfig {
  // K8s API endpoint pattern — {namespace} substituted at runtime
  endpoint: string;
  // Maps identifierType → label selector key used to query K8s
  // e.g. commit_sha → pipelinesascode.tekton.dev/sha
  identifierSelectors?: Record<string, string>;
}

export interface EntityDef {
  label: string;
  description?: string;
  format: 'kubernetes_resource' | 'json';
  identifiers: Record<string, SourcedPath>;
  references?: ReferenceDef[];
  display?: Record<string, SourcedPath>;
  k8s?: EntityK8sConfig; // only for kubernetes_resource format
}
```

### `DatasourceDef` — remove `serves`, type `enriches`

```typescript
// EnrichQueryConfig replaces Record<string, unknown>
// Each provider type has its own valid config shape
export type EnrichQueryConfig =
  | { type: 'promql'; promql: string; step?: string }
  | { type: 'splunk'; search: string; mode?: 'oneshot' | 'blocking' | 'normal' }
  | { type: 'rest'; endpoint: string; method?: string; params?: Record<string, string> }
  | { type: 'tempo'; traceId?: string; tags?: Record<string, string> };

export interface EnrichesQueryEntry {
  as: string;
  format?: string;
  query: EnrichQueryConfig; // typed — was [key: string]: unknown
}

export interface DatasourceDef {
  provider: string;
  types: string[];
  connection: { ... }; // unchanged
  // serves: removed
  enriches?: Record<string, { queries: Record<string, EnrichesQueryEntry> }>;
}
```

---

## Provider capabilities by type

| Provider | Capabilities |
|----------|-------------|
| `kubernetes` | `serve:by-identifier`, `serve:list-namespace` |
| `kubearchive` | `serve:by-identifier`, `serve:list-namespace` |
| `splunk` | `enrich` |
| `prometheus` | `enrich` |
| `tempo` | `enrich` |
| `rest` | `serve:by-identifier`, `enrich` (depending on config) |
| `mock` | all capabilities |

---

## Migration sequence

1. **New types** — write new `types.ts` alongside old interface. Both exist temporarily.
2. **Schema TypeScript types** — update `EntityDef`, `DatasourceDef`, add `EntityK8sConfig`, `EnrichQueryConfig`.
3. **Implement providers** — one at a time: Kubernetes, KubeArchive, Splunk, Prometheus, Tempo, REST. Each implements its capability interfaces.
4. **Update traversal engine** — replace `execute()` calls with `canServeByIdentifier()` + `serveByIdentifier()`.
5. **Update enrichment route** — replace `execute()` calls with `canEnrich()` + `enrich()`.
6. **Delete old interface** — remove `ProviderQuery`, `Provider`, `execute()`.
7. **Update `schema.yaml`** — remove `serves` blocks, add `k8s` entity config (endpoint + identifier selectors).
8. **Verify** — Explore traversal and enrichment work end to end.

No backwards compatibility needed — clean cut at each step.

---

## Traversal configuration

Four problems fixed alongside the provider refactor:

**1. `concurrency` was declared but not enforced.**
`Promise.all()` ran every task with no limit. Fixed with a simple worker-pool semaphore — no library needed.

**2. `max_entities_per_hop` was misnamed.**
It capped the *pending ref queue going into the next BFS level*, not entities found per hop. Renamed to `max_queue_per_level` to be honest. References dropped by this cap are now logged.

**3. Timeout was soft.**
`Date.now() < deadline` was only checked at BFS loop boundaries. Individual fetch calls could run past the deadline. Fixed by passing `AbortSignal.timeout()` to each provider call.

**4. No per-request depth override.**
Schema config conflated defaults with maximums. Fixed: schema declares the hard cap (`max_depth`); callers pass an optional `depth` override bounded by that cap.

```typescript
// traverse() signature
traverse(
  projectId: string,
  schema: WeaveSchema,
  seedType: string,
  seedValue: string,
  options?: { depth?: number },   // capped at schema.traversal.max_depth
): Promise<KnowledgeGraph>

// explore API route — now accepts ?depth=N
const depth = Math.min(
  parseInt(searchParams.get('depth') ?? String(schema.traversal.max_depth)),
  schema.traversal.max_depth,
);
```

Schema `traversal` block after rename:
```yaml
traversal:
  max_depth: 5
  max_queue_per_level: 50    # was max_entities_per_hop
  max_total_entities: 200
  timeout_seconds: 30
  concurrency: 10            # now actually enforced
```

---

## Mock data removal

Mock mode (switching datasources between "live" and "mock" in-process responses) was removed alongside this refactor.

**Why:** mock mode was a developer/demo convenience — it let the app run without a live cluster by serving pre-recorded fixture data. With a real cluster always available and no automated tests using mock mode, it added ~1,100 lines of code and three code paths that made the core data flow harder to read.

**What was deleted:**
- `src/lib/mock/store.ts` — in-process key-value store
- `src/lib/mock/konflux-data.ts` — 693 lines of fixture data
- `src/lib/engine/providers/mock.ts` — MockProvider implementation
- `src/app/api/mock-data/route.ts` — mock data API endpoint
- `src/components/explore/mock-data-editor.tsx` — mock data UI panel

**What simplified:**
- `traversal.ts`: three `override.mode === "mock" ? "mock" :` ternaries removed
- `registry.ts`: special-cased fresh-instance creation for mock removed
- `datasource-config.ts`: `DatasourceOverride.mode` removed; default is now just empty override (connection from schema)
- `datasources/route.ts`: mode toggle and mock short-circuit removed
- `datasource-connections.tsx`: mode toggle UI removed
- `project/page.tsx`: "Mock Data" tab removed
- `projects.ts`: vestigial `mockData` path removed

**Default behaviour change:** `getDatasourceOverride` previously defaulted to `{ mode: "mock" }` for unconfigured datasources — silently serving empty data. Now it returns an empty override and datasources use their schema connection config directly. Unconfigured env vars will produce connection errors, which are logged to the query log and visible rather than silently hidden.

---

## Impact on Pulse

After this refactor, Pulse's `fetcher.ts` calls `provider.listByNamespace()` — a first-class typed method on the provider, not a workaround. The DataContext is built from the results. No special-casing in the Pulse layer.

---

## Files changed

| File | Change |
|------|--------|
| `src/lib/engine/providers/types.ts` | Complete replacement |
| `src/lib/schema/types.ts` | Add `EntityK8sConfig`, `EnrichQueryConfig`; update `EntityDef`, `DatasourceDef` |
| `src/lib/engine/providers/kubernetes.ts` | Rewrite — implements `ServesByIdentifier`, `ListsByNamespace` |
| `src/lib/engine/providers/kubearchive.ts` | Rewrite — implements `ServesByIdentifier`, `ListsByNamespace` |
| `src/lib/engine/providers/splunk.ts` | Rewrite — implements `Enriches` only |
| `src/lib/engine/providers/prometheus.ts` | Rewrite — implements `Enriches` only |
| `src/lib/engine/providers/tempo.ts` | Rewrite — implements `Enriches` only |
| `src/lib/engine/providers/rest-api.ts` | Rewrite — implements `ServesByIdentifier`, `Enriches` |
| `src/lib/engine/providers/registry.ts` | Update — typed as `BaseProvider[]` |
| `src/lib/engine/traversal.ts` | Update — use type guards + capability methods |
| `src/app/api/enrich/route.ts` | Update — call `enrich()` not `execute()` |
| `.weave/projects/konflux/schema.yaml` | Remove `serves` blocks, add `k8s` entity config |
