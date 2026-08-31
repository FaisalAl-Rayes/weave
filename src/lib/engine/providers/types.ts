// EntityK8sConfig and EnrichQueryConfig are defined in schema/types.ts
// (the schema layer is the foundation; providers depend on it, not vice versa).
import type { EntityK8sConfig, EnrichQueryConfig } from "@/lib/schema/types";
export type { EntityK8sConfig, EnrichQueryConfig };

// -------------------------------------------------------
// Capability tokens
// -------------------------------------------------------

export type ProviderCapability =
  | "serve:by-identifier"
  | "serve:list-namespace"
  | "enrich";

// -------------------------------------------------------
// Base
// -------------------------------------------------------

export interface BaseProvider {
  readonly type: string;
  readonly capabilities: ReadonlySet<ProviderCapability>;
}

// -------------------------------------------------------
// Connection config — what providers need from a datasource.
// Decouples providers from the full DatasourceDef schema type.
// -------------------------------------------------------

export interface ConnectionConfig {
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
}

// -------------------------------------------------------
// Typed query objects — one per capability
// -------------------------------------------------------

export interface ByIdentifierQuery {
  identifierType: string;
  // All identifier values collected for this (entityType, identifierType) at this BFS level.
  // One value = single query; multiple values = batched query (provider decides how).
  values: string[];
  entityK8sConfig?: EntityK8sConfig;
  signal?: AbortSignal;
}

export interface ListNamespaceQuery {
  namespace: string;
  entityK8sConfig?: EntityK8sConfig; // mirrors ByIdentifierQuery — provider derives endpoint from this
  timeRange?: { start: Date; end: Date };
  labelSelector?: string;
  signal?: AbortSignal;
  // Called on each paginated API response — allows callers to log per-request details.
  onPage?: (pageIndex: number, recordCount: number, durationMs: number) => void;
}


export interface PaginationInfo {
  sid: string;
  offset: number;
  count: number;
  total: number;
}

export interface EnrichQuery {
  queryName: string;
  queryConfig: EnrichQueryConfig;
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

// -------------------------------------------------------
// Capability interfaces — providers implement what they support
// -------------------------------------------------------

export interface ServesByIdentifier extends BaseProvider {
  serveByIdentifiers(
    entityType: string,
    query: ByIdentifierQuery,
    connection: ConnectionConfig,
  ): Promise<unknown[]>;
}

export interface ListsByNamespace extends BaseProvider {
  listByNamespace(
    entityType: string,
    query: ListNamespaceQuery,
    connection: ConnectionConfig,
  ): Promise<unknown[]>;
}

export interface Enriches extends BaseProvider {
  enrich(
    entityType: string,
    query: EnrichQuery,
    connection: ConnectionConfig,
  ): Promise<EnrichResult>;
}

// -------------------------------------------------------
// Type guards — the only way callers discover capabilities.
// Checks both the declared capability set (intent) and method
// presence (catches implementation bugs where the set was
// updated but the method was not added).
// -------------------------------------------------------

export function canServeByIdentifier(p: BaseProvider): p is ServesByIdentifier {
  return p.capabilities.has("serve:by-identifier") && "serveByIdentifiers" in p;
}

export function canListByNamespace(p: BaseProvider): p is ListsByNamespace {
  return p.capabilities.has("serve:list-namespace") && "listByNamespace" in p;
}

export function canEnrich(p: BaseProvider): p is Enriches {
  return p.capabilities.has("enrich") && "enrich" in p;
}
