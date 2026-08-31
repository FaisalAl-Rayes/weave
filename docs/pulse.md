# Pulse

## What it is

A stakeholder-facing health view for a CI/CD tenant. Where Explore answers "what happened to this specific commit?", Pulse answers "how is this tenant performing over a period of time?"

**Audience**: product owners, team leads, release managers — people who care about delivery health, not individual run logs.

---

## Inputs

- **Namespaces** — multi-select, populated from the cluster API based on what the configured token can see
- **Time range** — start + end datetime; data is fetched by `creationTimestamp`, completed-resource filter applied client-side

---

## Navigation model

Pulse lives at `/pulse`. The top-level header provides navigation between Explore, Pulse, and Project.

When a user clicks a specific resource from any flow, it opens Explore in a **new browser tab** pre-seeded via URL params (`?seed_type=pipelinerun_name&seed_value=xxx&depth=2`).

**Prerequisite:** The explore API route (`/api/explore`) already reads `seed_type`, `seed_value`, and `depth` from query params. What still needs implementing: `src/app/page.tsx` must read these params on mount and initialize React state from them, so deep-linked URLs actually seed the graph.

Pulse state (namespaces + date range) lives in the URL — results for a fixed time range are deterministic, no sessionStorage needed.

---

## Architecture

### Two-layer model

**Data plane** — fetches raw K8s resources once, shared across all flows.

Each flow declares which entity types it needs (`dependencies: string[]`). Before execution, the system collects all dependencies across all applicable flows, deduplicates, and fetches from KubeArchive (primary) and the live cluster (supplement) in parallel. The result is a `DataContext` — a shared in-memory bag of fetched resources all flows read from.

`fetcher.ts` builds the DataContext by:
1. Collecting unique entity types across all applicable flows
2. For each entity type, finding which datasource `serves` it (from `schema.datasources`)
3. Getting the provider for that datasource and calling `provider.listByNamespace(entityType, { namespace, entityK8sConfig: entityDef.k8s, timeRange }, connection)`
4. Results are deduplicated by `metadata.name` and stored in `DataContext.resources[entityType]`

```
Flow A needs: ['PipelineRun', 'TaskRun']
Flow B needs: ['PipelineRun', 'Release']
Flow C needs: ['PipelineRun']
→ Fetch: PipelineRun (once), TaskRun (once), Release (once)
→ All flows receive the same DataContext
```

**Flow plane** — pure computation on the DataContext. No I/O (unless a flow makes a secondary datasource query via `ctx.query`). Each flow filters, groups, and aggregates to produce a typed `FlowResult<T>`.

---

## Types

```typescript
import type { KubernetesObject } from '@kubernetes/client-node';

interface AnalysisParams {
  projectId: string;
  namespaces: string[];
  startTime: Date;
  endTime: Date;
}

// Extends KubernetesObject (which provides typed metadata via V1ObjectMeta).
// spec and status are open records — they vary per resource type.
interface K8sResource extends KubernetesObject {
  spec?: Record<string, unknown>;
  status?: Record<string, unknown>;
}

interface DataContext {
  params: AnalysisParams;
  resources: Record<string, K8sResource[]>; // entityType → fetched resources
  // For secondary datasource queries (Splunk, Prometheus, etc.) within execute().
  // Datasource name matches the name defined in schema.yaml.
  query: (datasource: string, params: Record<string, unknown>) => Promise<unknown>;
}

// Discriminated union — TypeScript narrows correctly after status check.
type FlowResult<T> =
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };

// What the API sends to the client.
type FlowResponse = { flowId: string; title: string } & FlowResult<unknown>;

interface Flow<T = unknown> {
  id: string;
  title: string;
  description: string;
  dependencies: string[]; // entity type names, matching schema entity definitions
  // Currently checks schema only (datasources configured + entity types defined).
  // TODO: extend with live namespace CRD probing when needed:
  //   isApplicable(schema: WeaveSchema, availableCRDs: string[]): boolean
  isApplicable(schema: WeaveSchema): boolean;
  execute(ctx: DataContext): Promise<FlowResult<T>>;
}
```

`T` in `Flow<T>` provides type safety within a flow's implementation. The framework always deals with `Flow<unknown>` — `T` is erased in the registry. Renderers cast `data` to the type they know.

---

## Registry

Flows are plain stateless objects (no classes, no `new`). Server-side registry is a simple array; client-side renderer registry is a record keyed by `flowId`.

```typescript
// src/lib/pulse/registry.ts
export const FLOWS: Flow[] = [failureAnalysisFlow, buildHealthFlow, ...];

// src/components/pulse/renderers/index.ts
export const RENDERERS: Record<string, React.ComponentType<{ data: unknown }>> = {
  'failure-analysis': FailureAnalysisRenderer,
  'build-health': BuildHealthRenderer,
};

export function getRenderer(flowId: string): React.ComponentType<{ data: unknown }> {
  return RENDERERS[flowId] ?? FallbackRenderer;
}
```

---

## API

`POST /api/pulse/analyze` — `{ projectId, namespaces, startTime, endTime }`

1. Load schema for `projectId`
2. Filter `FLOWS` by `isApplicable(schema)`
3. Collect and deduplicate `dependencies` across all applicable flows
4. Fetch each unique entity type from KubeArchive + cluster in parallel → build `DataContext`
5. Execute all flows against the shared `DataContext`
6. Return `{ summary: KonfluxSummaryData, flows: FlowResponse[] }`

Single blocking response. Client shows flow card skeletons while waiting. Total latency = slowest single fetch, not the sum.

---

## Summary header

A single row rendered before flows:
`84 PipelineRuns · 71 succeeded (85%) · 13 failed · 6 releases shipped`

Answers "is this good or bad?" before the user reads any flow.

Summary data is project-type specific — a Konflux project has different meaningful metrics than a generic Tekton setup:

```typescript
// Konflux-specific summary — shown when Release entity is available
interface KonfluxSummaryData {
  totalPipelineRuns: number;
  succeededPipelineRuns: number;
  failedPipelineRuns: number;
  totalReleases: number;
  succeededReleases: number;
}
```

`isApplicable(schema)` on each flow determines which flows (and thus which summary fields) are relevant for a given project's schema.

---

## Initial flows

| Flow | Dependencies | What it produces |
|------|-------------|-----------------|
| **Build Health** | `PipelineRun` | PR vs push success rate |
| **Release Performance** | `PipelineRun`, `Release` | Release success rate, count shipped |
| **Failure Analysis** | `PipelineRun`, `TaskRun` | Failed runs grouped by failing task + status reason |
| **Test Gate Health** | `PipelineRun` | Integration test pass/fail by scenario |

Failure grouping: by `status.conditions[0].reason` + the task that caused it. No NLP clustering.

---

## Directory structure

```
src/
├── app/
│   ├── pulse/
│   │   └── page.tsx                        ← route, renders PulsePage
│   └── api/
│       └── pulse/
│           └── analyze/
│               └── route.ts                ← POST handler
│
├── lib/
│   └── pulse/
│       ├── types.ts                        ← all shared types
│       ├── fetcher.ts                      ← deduplication + KubeArchive/cluster fetch
│       ├── registry.ts                     ← FLOWS array
│       └── flows/
│           ├── index.ts                    ← imports + exports all flows
│           ├── failure-analysis/
│           │   └── flow.ts
│           ├── build-health/
│           │   └── flow.ts
│           ├── release-performance/
│           │   └── flow.ts
│           └── test-gate-health/
│               └── flow.ts
│
└── components/
    └── pulse/
        ├── pulse-page.tsx                  ← namespace selector, date picker, flow grid
        ├── summary-header.tsx              ← key numbers row
        ├── flow-card.tsx                   ← skeleton → result wrapper
        └── renderers/
            ├── index.ts                    ← RENDERERS record + getRenderer()
            ├── failure-analysis/
            │   └── renderer.tsx
            ├── build-health/
            │   └── renderer.tsx
            ├── release-performance/
            │   └── renderer.tsx
            └── test-gate-health/
                └── renderer.tsx
```

**Convention**: `src/lib/pulse/flows/<name>/flow.ts` (server logic) is always paired with `src/components/pulse/renderers/<name>/renderer.tsx` (client renderer), linked by `flowId`. Same name, different roots.

---

## Decisions made

- **In-app tabs**: rejected. Explore is made deep-linkable via URL params; drill-down opens a new browser tab.
- **Flow definitions**: code (plain objects), not schema. Flows contain real aggregation logic.
- **Flow generic `T`**: for flow author type safety only — erased to `unknown` in the framework.
- **`DataDependency` interface**: dropped in favour of `dependencies: string[]` — simpler, extend if needed.
- **`K8sResource`**: extends `KubernetesObject` from `@kubernetes/client-node` rather than reinventing metadata typing.
- **Time filtering**: by `creationTimestamp` (only field KubeArchive supports); completed-run filter applied in flows.
- **Release CR**: lives in `default-tenant`, has `status.conditions` with reason/message.
- **Streaming API**: deferred. Single response with parallel server-side fetching is sufficient.
- **Classes for flows**: rejected. Plain stateless objects.
- **`empty` status**: dropped. Renderers handle empty data via `data.length === 0`.
- **Namespace in `DataDependency`**: dropped. Namespace is an `AnalysisParams` concern; flows filter by `metadata.namespace` if needed.
