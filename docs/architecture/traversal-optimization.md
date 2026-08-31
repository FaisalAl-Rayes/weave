# Traversal Optimization

## What Weave is

Weave is a **federated linked data graph engine**. An entity is anything with extractable identifier values — a Kubernetes resource, a CI report, a JIRA issue, a deployment event. The linking mechanism is identifier matching across arbitrary datasources. Kubernetes is the current primary datasource but is not architecturally privileged.

This distinction matters for optimization. Suggestions that assume K8s-specific structures (ownerReferences, label selectors) would compromise the general model and should be avoided at the core traversal level.

---

## The Three Problems

### 1. The N+1 Query Problem (provider-generic)

The BFS processes one `PendingRef` at a time: for each pending identifier value, it issues one query per (entity type, datasource) combination. With N PipelineRuns in the queue, it issues N separate TaskRun queries:

```
GET /taskruns?labelSelector=tekton.dev/pipelineRun=pr-1
GET /taskruns?labelSelector=tekton.dev/pipelineRun=pr-2
...
GET /taskruns?labelSelector=tekton.dev/pipelineRun=pr-N
```

The DataLoader pattern (Facebook, 2015) solves this: collect all pending identifier values for a given (entity type, datasource) pair across the entire BFS level, then issue ONE batched query:

```
GET /taskruns?labelSelector=tekton.dev/pipelineRun in (pr-1,pr-2,...,pr-N)
```

This is **provider-agnostic**: whether the datasource is KubeArchive (label `in` selector), a GraphQL API (multi-ID query), or a REST API with batch endpoint, the engine doesn't care — it just collects keys and asks the provider to resolve them. The provider declares whether it supports batching.

Impact: O(entities × hops) queries → O(entity_types × hops) queries.

---

### 2. Back-Reference Waste (provider-generic, schema-design problem)

The schema currently has no concept of reference directionality. Every reference in `EntityDef.references` produces queue entries that drive BFS queries at the next level. But some references are **backward** — they point from child to parent:

- TaskRun → PipelineRun (`metadata.labels['tekton.dev/pipelineRun']` → PipelineRun)
- Pod → TaskRun (`metadata.labels['tekton.dev/taskRun']` → TaskRun)
- Release → Snapshot (`spec.snapshot` → Snapshot)

When a TaskRun is discovered, the BFS pushes `pipelinerun_name="pr-abc"` into the queue. This generates a cache hit at the next level (the PipelineRun was already fetched at depth 0). The traversal correctly skips the query, but the queue entry and cache lookup are still processed.

More importantly, there is no way to distinguish this case upfront. A reference pointing to a TestReport from an external system that happens to reference an already-fetched PipelineRun has the same structure.

**The fix**: add a `direction` or `traversal` annotation to the schema's `ReferenceDef`:

```typescript
interface ReferenceDef {
  field: string;
  points_to: string;
  as: string;
  source?: string;
  // "forward" (default): drives BFS discovery — issue a query
  // "backward": draw an edge only — resolve from entityCache, no query
  direction?: "forward" | "backward";
}
```

This is completely provider-agnostic: a CI report entity could have a backward reference to PipelineRun exactly the same way a TaskRun does. The engine skips the query and just draws the edge from the already-fetched entity.

Impact: eliminates all back-reference queue entries and the corresponding cache lookups.

---

### 3. Dual Datasource Redundancy (configuration problem)

Both `my-kubernetes` and `my-kubearchive` serve the same entity types (PipelineRun, TaskRun, Pod, Snapshot, Release). Every query is issued twice. For historical data, KubeArchive is the correct primary source; the live cluster is a fallback for resources that haven't been archived yet.

The schema should express this as a priority order, not two equal parallel sources:

```yaml
datasources:
  my-kubearchive:
    provider: kubearchive
    serves: [PipelineRun, TaskRun, Pod, Snapshot, Release]
    priority: 1  # primary

  my-kubernetes:
    provider: kubernetes
    serves: [PipelineRun, TaskRun, Pod, Snapshot, Release]
    priority: 2  # fallback — only queried if kubearchive returns nothing
```

Or more simply: just remove `my-kubernetes` from `serves` for entity types that KubeArchive reliably has. The live cluster remains available for enrichment queries.

---

## What NOT to Do

**Do not add Kubernetes-specific optimizations to the core traversal engine.**

Suggestions like parsing `ownerReferences` or assuming `tekton.dev/pipelineRun` labels are Kubernetes-specific. They would break the general model where entities come from any datasource.

Consider a JIRA issue linked to a commit SHA: when a developer opens a pull request, JIRA automatically transitions the linked issue and records the commit in the issue's development panel. A `JIRAIssue` entity in Weave would have:
- Identifier: `commit_sha` (extracted from the issue's linked commits field via the JIRA REST API)
- Reference: `commit_sha` → PipelineRun (draw an edge to the pipeline that built it)
- Display: issue key, summary, status, assignee

This entity has no ownerReferences, no Kubernetes labels, no label selectors. It's plain JSON from a REST API. The identifier-based traversal model handles it correctly: given a commit SHA, one query to JIRA finds the linked issue. The edge to the PipelineRun is drawn by identifier matching. This is exactly the model that should be preserved.

The identifier-based traversal model handles all of these correctly and should remain the core abstraction. Optimizations must be expressed at the **provider** level (a provider can declare batching capability) or the **schema** level (reference direction annotations), not by hardcoding K8s assumptions into the engine.

---

## Schema-Level Changes Needed

### 1. Reference direction annotation
Add `direction: forward | backward` to `ReferenceDef`. Default is `forward`. All current back-references (TaskRun → PipelineRun, Pod → TaskRun, Release → Snapshot) should be marked `backward`.

### 2. Provider batching declaration
Providers should declare whether they support multi-value queries. The traversal engine collects all pending values for a given (entity type, datasource) and issues a single batched query when supported:

```typescript
interface ServesByIdentifier extends BaseProvider {
  // Existing: one value at a time
  serveByIdentifier(entityType, query: ByIdentifierQuery, connection): Promise<unknown[]>;

  // New (optional): batch multiple values in one query
  serveByIdentifierBatch?(entityType, queries: ByIdentifierQuery[], connection): Promise<unknown[]>;
}
```

The traversal engine checks for `serveByIdentifierBatch` and uses it when available. Providers that don't implement it fall back to sequential calls.

### 3. Datasource priority
Add `priority` to `DatasourceDef` so the engine knows which datasource is primary vs fallback for traversal. Avoids issuing duplicate queries to both simultaneously.

---

## Impact Assessment

Starting from a commit SHA with 10 PipelineRuns, 30 TaskRuns, 30 Pods (a realistic busy commit):

| Change | Queries before | Queries after |
|--------|---------------|---------------|
| Current state | ~224 | — |
| Remove dual datasource | ~112 | -50% |
| Back-reference direction | ~90 | -20% |
| N+1 batching | ~15 | -83% |
| All three combined | ~224 | **~8** |

The 8 remaining queries are:
- 2 for PipelineRun (2 commit_sha selectors, batched to 1 query each)
- 1 for Snapshot (commit_sha)
- 1 for TaskRun (all 10 pipelinerun_names batched)
- 1 for Pod (all 30 taskrun_names batched)
- 1 for Snapshot (pipelinerun_name)
- 1 for Release (snapshot_name)
- 1 for PipelineRun via snapshot_name (back-reference, skipped → 0)

---

## Implementation Order

1. ~~**Remove PipelineRun's `pipelinerun_name` identifierSelector**~~ — done. PipelineRuns don't carry `tekton.dev/pipelineRun` on themselves; the selector produced empty queries.
2. ~~**Reduce `max_depth` from 5 to 3**~~ — done. Traversal naturally terminates at depth 3; levels 4-5 were all cache hits.
3. **Provider batching** — see plan below.

---

## Batching Implementation Plan (DataLoader Pattern)

### Goal

Transform O(entities × hops) queries into O(entity_types × hops) queries. With 10 PipelineRuns at depth 1, instead of 10 separate TaskRun queries fire ONE:

```
GET /taskruns?labelSelector=tekton.dev/pipelineRun in (pr-1,pr-2,...,pr-10)
```

### What changes

**1. Replace `ByIdentifierQuery.value` with `values[]`** (`providers/types.ts`)

```typescript
// Before
export interface ByIdentifierQuery {
  identifierType: string;
  value: string;
  entityK8sConfig?: EntityK8sConfig;
  signal?: AbortSignal;
}

// After — single interface for one or many values
export interface ByIdentifierQuery {
  identifierType: string;
  values: string[];            // engine always passes all collected values for this hop
  entityK8sConfig?: EntityK8sConfig;
  signal?: AbortSignal;
}
```

**2. Rename method to `serveByIdentifiers`** (`providers/types.ts`)

```typescript
export interface ServesByIdentifier extends BaseProvider {
  serveByIdentifiers(
    entityType: string,
    query: ByIdentifierQuery,
    connection: ConnectionConfig,
  ): Promise<unknown[]>;
}
```

No optional variant, no capability flag. The engine always calls one method. Each provider owns the decision of how to handle `values`:
- KubeArchive / Kubernetes: `values.length === 1` → `labelSelector=key=value`; `values.length > 1` → `labelSelector=key in (v1,v2,...)`
- REST provider: loops internally and concatenates results
- Mock: handles whatever

**3. KubeArchive provider** (`providers/kubearchive.ts`)

```typescript
async serveByIdentifiers(entityType, query, connection) {
  const { identifierType, values, entityK8sConfig, signal } = query;
  const selectors = Array.isArray(entityK8sConfig.identifierSelectors?.[identifierType])
    ? entityK8sConfig.identifierSelectors[identifierType]
    : [entityK8sConfig.identifierSelectors?.[identifierType]];

  const results: unknown[] = [];
  for (const labelKey of selectors) {
    const selectorValue = values.length === 1
      ? `${labelKey}=${values[0]}`
      : `${labelKey} in (${values.join(",")})`;
    // fetch paginated as before
    results.push(...await this.fetchAllPages(url + `?labelSelector=${selectorValue}`, ...));
  }
  return deduplicateByName(results);
}
```

**4. Kubernetes provider** (`providers/kubernetes.ts`) — same pattern.

**5. REST provider** (`providers/rest-api.ts`) — loops over values sequentially, concatenates results. No `in` operator support needed; REST endpoints typically don't have it.

**6. Traversal engine — two phases** (`engine/traversal.ts`)

**Phase A — collect batches** (no I/O, replaces the current task-per-pending-ref loop)

```
batches: Map<`${datasource}::${entityType}::${identifierType}`, {
  datasource, datasourceDef, entityType, entityDef,
  pendingRefs: PendingRef[],  // to reconstruct source edges after fetch
  values: string[],           // deduplicated against queryCache
}>
```

For each pending in pendingQueue × datasource × entityType: if the entity has an identifierSelector for this identifierType, check the query cache per value, add uncached values to the batch, mark them in the cache.

**Phase B — execute batches** (I/O, with concurrency limit — unchanged)

One task per batch entry, executed via `withConcurrency`. Each task calls `provider.serveByIdentifiers(entityType, { identifierType, values, entityK8sConfig }, connection)`.

**7. Edge attribution**

Each returned entity contains the identifier value that matched it (e.g., a TaskRun carries `metadata.labels['tekton.dev/pipelineRun']` = the pipelinerun_name). After extracting identifiers from the entity, look up which `PendingRef` in `batch.pendingRefs` had that value to get the correct `sourceEntityId` and `sourceField` for the edge.

This is the same identifier extraction already done per entity — it just needs a lookup into the pendingRefs map:

```
pendingRefsByValue: Map<string, PendingRef> = new Map(
  batch.pendingRefs.map(ref => [ref.value, ref])
)
```

Then for each returned entity: extract `identifiers[identifierType]` → look up the originating pendingRef → draw the edge.

### Query cache

Key format stays `${datasource}::${entityType}::${identifierType}::${value}` (per value). Values are checked against the cache before being added to a batch — already-fetched values are excluded from the `values[]` passed to `serveByIdentifiers`.

### Expected query reduction

| Scenario | Before | After |
|----------|--------|-------|
| commit_sha, 1 PipelineRun, 3 TaskRuns, 3 Pods | ~28 HTTP calls | ~8 HTTP calls |
| commit_sha, 10 PipelineRuns, 30 TaskRuns, 30 Pods | ~224 HTTP calls | ~10 HTTP calls |
| commit_sha, 10 PipelineRuns, 30 TaskRuns, 30 Pods (2 datasources) | ~224 HTTP calls | ~20 HTTP calls |
