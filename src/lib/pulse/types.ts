import type { KubernetesObject } from "@kubernetes/client-node";
import type { WeaveSchema } from "@/lib/schema/types";

// -------------------------------------------------------
// Analysis inputs
// -------------------------------------------------------

export interface AnalysisParams {
  projectId: string;
  namespaces: string[];
  startTime: Date;
  endTime: Date;
}

// -------------------------------------------------------
// K8s resource shape — extends the client-node base type.
// spec and status are open records since they vary per resource kind.
// -------------------------------------------------------

export interface K8sResource extends KubernetesObject {
  spec?: Record<string, unknown>;
  status?: Record<string, unknown>;
}

// -------------------------------------------------------
// Data context — shared across all flows in one analysis run.
// Resources are fetched once and deduplicated before flows execute.
// -------------------------------------------------------

export interface DataContext {
  params: AnalysisParams;
  // entityType → fetched resources (all namespaces merged, filtered to time range in flows)
  resources: Record<string, K8sResource[]>;
  // Secondary datasource queries for flows that need Splunk/Prometheus data.
  // Datasource name matches the name defined in schema.yaml.
  query: (datasource: string, params: Record<string, unknown>) => Promise<unknown>;
}

// -------------------------------------------------------
// Flow result — discriminated union so TypeScript narrows correctly.
// -------------------------------------------------------

export type FlowResult<T> =
  | { status: "success"; data: T }
  | { status: "error"; error: string };

// What the API sends to the client — framework wraps each flow result.
export type FlowResponse = { flowId: string; title: string; widePanel?: boolean } & FlowResult<unknown>;

// -------------------------------------------------------
// Flow interface — plain stateless objects, no classes.
// T is for the flow author's type safety; erased to unknown in the registry.
// -------------------------------------------------------

export interface Flow<T = unknown> {
  id: string;
  title: string;
  description: string;
  // Entity type names from the schema — drives data fetching deduplication.
  dependencies: string[];
  // When true the flow card spans full width instead of half the grid.
  // Use for flows with many columns that need horizontal space.
  widePanel?: boolean;
  // Returns false if required entities or datasources are missing from the schema.
  // TODO: extend with live CRD probing when needed:
  //   isApplicable(schema: WeaveSchema, availableCRDs: string[]): boolean
  isApplicable(schema: WeaveSchema): boolean;
  execute(ctx: DataContext): Promise<FlowResult<T>>;
}

// -------------------------------------------------------
// Summary — Konflux-specific key numbers shown before flows.
// Derived from resources already fetched by the data plane.
// -------------------------------------------------------

export interface PipelineStats {
  total: number;
  succeeded: number;
  failed: number;
}

export interface KonfluxSummaryData {
  // Tekton PipelineRuns broken down by Konflux pipeline type label
  pipelineRuns: PipelineStats & {
    build: PipelineStats;       // pipelines.appstudio.openshift.io/type = build
    test: PipelineStats;        // pipelines.appstudio.openshift.io/type = test
    managedRelease: PipelineStats; // pipelines.appstudio.openshift.io/type = managed
  };
  // Release CRs (appstudio.redhat.com/v1alpha1)
  releases: PipelineStats;
}

// -------------------------------------------------------
// Query log — one entry per datasource fetch in the data plane
// -------------------------------------------------------

export interface PulseQueryLogEntry {
  datasource: string;
  provider: string;
  entityType: string;
  namespace: string;
  // Page index within a paginated sequence (0-based). Providers that
  // paginate (KubeArchive) emit one entry per HTTP request.
  pageIndex: number;
  recordsFetched: number;
  durationMs: number;
  status: "success" | "error";
  error?: string;
}

// -------------------------------------------------------
// API response
// -------------------------------------------------------

export interface AnalyzeResponse {
  summary: KonfluxSummaryData;
  flows: FlowResponse[];
  queryLog: PulseQueryLogEntry[];
}

// -------------------------------------------------------
// Helpers — used by flows to classify resources
// -------------------------------------------------------

export function isCompleted(resource: K8sResource): boolean {
  return !!(resource.status as { completionTime?: string } | undefined)?.completionTime;
}

// Returns the condition with type "Succeeded" from a Tekton PipelineRun/TaskRun.
// reason varies by pipeline type ("Succeeded" for build/test, "Completed" for managed),
// so status ("True"/"False") is the reliable indicator — not reason.
function getSucceededCondition(
  resource: K8sResource,
): { type?: string; reason?: string; status?: string } | undefined {
  const conditions = (resource.status as {
    conditions?: Array<{ type?: string; reason?: string; status?: string }>;
  } | undefined)?.conditions;
  return conditions?.find((c) => c.type === "Succeeded");
}

// For Tekton PipelineRuns — check status="True" on the Succeeded condition.
// reason is unreliable: build/test use "Succeeded" but release pipelines use "Completed".
export function isSucceeded(resource: K8sResource): boolean {
  return getSucceededCondition(resource)?.status === "True";
}

export function isFailed(resource: K8sResource): boolean {
  return getSucceededCondition(resource)?.status === "False";
}

// Kept for schema display paths that still use reason strings.
export function getConditionReason(resource: K8sResource): string {
  return getSucceededCondition(resource)?.reason ?? "Unknown";
}

// For Release CRs — check the condition with type "Released".
// The Released condition carries reason "Succeeded" and status "True" on success.
// conditions[-1].reason is unreliable because there are multiple condition types.
export type ReleaseStatus = "succeeded" | "failed" | "running";

export function getReleaseStatus(resource: K8sResource): ReleaseStatus {
  const conditions = (resource.status as {
    conditions?: Array<{ type?: string; reason?: string; status?: string }>;
  } | undefined)?.conditions;

  const releasedCondition = conditions?.find((c) => c.type === "Released");

  if (releasedCondition) {
    if (releasedCondition.reason === "Succeeded" || releasedCondition.status === "True") {
      return "succeeded";
    }
    // Condition exists but not succeeded — failed or still progressing
    if (releasedCondition.status === "False") return "failed";
  }

  // Fall back to status.phase when conditions are absent
  const phase = (resource.status as { phase?: string } | undefined)?.phase;
  if (phase === "Succeeded") return "succeeded";
  if (phase === "Failed") return "failed";

  return "running";
}

export function inTimeRange(resource: K8sResource, start: Date, end: Date): boolean {
  const ts = resource.metadata?.creationTimestamp;
  if (!ts) return false;
  // V1ObjectMeta.creationTimestamp is typed as Date by the k8s client
  const created = ts instanceof Date ? ts : new Date(ts as unknown as string);
  return created >= start && created <= end;
}
