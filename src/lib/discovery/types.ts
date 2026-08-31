import type { KubeConfig } from "@kubernetes/client-node";

// ============================================================
// Input: what we collect from the cluster
// ============================================================

export interface DiscoveryConfig {
  kubeConfig: KubeConfig;
  namespace: string;
  resourceTypes: ResourceTypeInfo[];
  samplesPerType: number;
}

export interface ResourceTypeInfo {
  apiVersion: string;
  kind: string;
  group: string;
  version: string;
  resource: string; // plural name for API calls
  namespaced: boolean;
}

export interface ResourceSample {
  type: ResourceTypeInfo;
  instances: Record<string, unknown>[];
  labelKeys: string[];
  annotationKeys: string[];
  fieldPaths: string[];
}

// ============================================================
// Output: what analyzers produce
// ============================================================

export type SignalType =
  | "owner_ref"
  | "label_selector"
  | "shared_label"
  | "field_ref"
  | "known_ref"
  | "name_pattern";

export interface CorrelationEvidence {
  sourceField: string;
  targetField: string;
  matchedValues: string[];
  matchRatio: number;
}

export interface DetectedCorrelation {
  source: string; // kind
  target: string; // kind
  signal: SignalType;
  confidence: number;
  evidence: CorrelationEvidence;
  suggestedIdentifier?: {
    name: string;
    label: string;
    sourcePath: string;
    targetPath: string;
  };
  suggestedReference?: {
    field: string;
    points_to: string;
    as: string;
  };
}

// ============================================================
// Analyzer interface
// ============================================================

export interface Analyzer {
  readonly name: string;
  analyze(samples: ResourceSample[]): DetectedCorrelation[];
}

// ============================================================
// Discovery result
// ============================================================

export interface DiscoveryResult {
  namespace: string;
  resourceTypes: ResourceTypeInfo[];
  samples: ResourceSample[];
  correlations: DetectedCorrelation[];
  proposedSchema: string; // YAML
  timestamp: string;
  activePlugins?: string[];
}

// ============================================================
// Name index for fast cross-reference lookups
// ============================================================

export interface NameIndex {
  // value → [(kind, instanceName)]
  byName: Map<string, { kind: string; name: string }[]>;
  byUid: Map<string, { kind: string; name: string }[]>;
}

// ============================================================
// Label index for correlation analysis
// ============================================================

export interface LabelIndex {
  // labelKey → { value → [{ kind, name }] }
  byKey: Map<string, Map<string, { kind: string; name: string }[]>>;
}

// ============================================================
// Exclusions
// ============================================================

export const EXCLUDED_RESOURCE_KINDS = new Set([
  "Event",
  "Endpoints",
  "EndpointSlice",
  "Lease",
  "ControllerRevision",
  "ReplicaSet",
  "ComponentStatus",
]);

export const INFRASTRUCTURE_LABEL_PREFIXES = [
  "app.kubernetes.io/managed-by",
  "app.kubernetes.io/version",
  "app.kubernetes.io/part-of",
  "helm.sh/",
  "kubernetes.io/",
  "control-plane.alpha.kubernetes.io/",
  "node.kubernetes.io/",
  "endpointslice.kubernetes.io/",
];
