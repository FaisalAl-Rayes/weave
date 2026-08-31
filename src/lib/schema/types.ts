// EntityK8sConfig and EnrichQueryConfig live here (schema layer) and are
// imported by providers/types.ts — not the other way around.

export interface EntityK8sConfig {
  // K8s API endpoint pattern — {namespace} substituted at runtime.
  // e.g. /apis/tekton.dev/v1/namespaces/{namespace}/pipelineruns
  endpoint: string;
  // Maps identifierType → K8s label selector key(s).
  // Array form runs one query per selector and merges results.
  // e.g. { commit_sha: ["pipelinesascode.tekton.dev/sha", "pac.test.appstudio.openshift.io/sha"] }
  identifierSelectors?: Record<string, string | string[]>;
}

export type EnrichQueryConfig =
  | { type: "promql"; promql: string; step?: string; start?: string; end?: string }
  | { type: "splunk"; search: string; mode?: "oneshot" | "blocking" | "normal" }
  | { type: "rest"; endpoint: string; method?: string; params?: Record<string, string> }
  | { type: "tempo"; traceId?: string; tags?: Record<string, string>; limit?: number; endpoint?: string };

export interface IdentifierDef {
  label: string;
  pattern?: string;
  normalize?: "lowercase" | "uppercase";
}

export interface SeedDef {
  identifier: string;
  primary?: boolean;
}

export interface SourcedPath {
  path: string;
  source?: string;
}

export interface ReferenceDef {
  field: string;
  points_to: string;
  as: string;
  source?: string;
}

export interface EntityStatusDef {
  // Full JSONPath expression to extract the status value from the raw resource.
  // Supports filter expressions: $.status.conditions[?(@.type=='Released')].reason
  // Simple paths also work: $.status.phase
  path: string;
}

export interface EntityDef {
  label: string;
  description?: string;
  format: "kubernetes_resource" | "json";
  identifiers: Record<string, SourcedPath>;
  references?: ReferenceDef[];
  display?: Record<string, SourcedPath>;
  status?: EntityStatusDef;
  k8s?: EntityK8sConfig; // only for kubernetes_resource format
}

export interface ResponseMapping {
  list_path?: string;
  field_map?: Record<string, string>;
}

// Typed enrichment query entry — replaces [key: string]: unknown.
// The queryConfig discriminates on type to route to the right provider method.
export interface EnrichesQueryEntry {
  as: string;
  format?: string;
  query: EnrichQueryConfig;
}

export interface EnrichesEntityDef {
  queries: Record<string, EnrichesQueryEntry>;
}

export interface DatasourceDef {
  provider: string;
  types: string[];
  connection: {
    url: string;
    auth?: {
      type: string;
      token?: string;
      username?: string;
      password?: string;
      headers?: Record<string, string>;
      [key: string]: unknown;
    };
    headers?: Record<string, string>;
  };
  // Entity types this datasource can serve via traversal — just names, no query templates.
  // Query construction logic lives in the provider's serveByIdentifiers() method.
  serves?: string[];
  enriches?: Record<string, EnrichesEntityDef>;
}

export interface ContextQueryDef {
  datasource: string;
  query: Record<string, unknown>;
  display: {
    label: string;
    type: "timeseries" | "scalar";
  };
}

export interface TraversalConfig {
  max_depth: number;
  max_queue_per_level: number; // was max_entities_per_hop — caps the pending ref queue between BFS levels
  max_total_entities: number;
  timeout_seconds: number;
  concurrency: number;
  priority?: string[];
}

export interface WeaveSchema {
  identifiers: Record<string, IdentifierDef>;
  seeds: SeedDef[];
  entities: Record<string, EntityDef>;
  datasources: Record<string, DatasourceDef>;
  traversal: TraversalConfig;
  context?: Record<string, ContextQueryDef>;
}
