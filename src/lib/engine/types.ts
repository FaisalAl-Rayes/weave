export interface GraphEntity {
  id: string;
  type: string;
  label: string;
  format: string;
  identifiers: Record<string, string>;
  display: Record<string, unknown>;
  enrichments: Record<string, unknown>;
  raw: unknown;
  discoveredBy: string[];
  depth: number;
  // Resolved from schema entity.status.path — the meaningful status string
  // (e.g. "Succeeded", "Failed", "Running", "Pending"). Undefined when the
  // entity type has no status definition.
  status?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  referenceField: string;
  identifierType: string;
  datasourceName: string;
}

export interface QueryLogEntry {
  timestamp: string;
  datasource: string;
  providerType: string;
  entityType: string;
  identifierType: string;
  // Comma-joined when batched (multiple values in one query).
  identifierValue: string;
  // Number of distinct identifier values in this query (1 = single, >1 = batched).
  // Optional for backward compatibility with serialized log entries from before batching.
  valueCount?: number;
  status: "success" | "error" | "skipped";
  entitiesFound: number;
  duration: number;
  error?: string;
  depth: number;
  // What reference caused this query. Absent for depth-0 seed queries.
  triggeredBy?: {
    entityType: string; // e.g. "PipelineRun"
    field: string;      // e.g. "metadata.name"
  };
  query?: unknown;
  response?: unknown;
}

export interface KnowledgeGraph {
  entities: GraphEntity[];
  edges: GraphEdge[];
  seed: { identifierType: string; value: string };
  queryLog: QueryLogEntry[];
  stats: {
    totalEntities: number;
    totalEdges: number;
    depthReached: number;
    duration: number;
    queriesExecuted: number;
  };
}
