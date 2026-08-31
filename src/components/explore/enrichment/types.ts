export type SignalType = "logs" | "metrics" | "traces" | "json";

export const SIGNAL_TYPES: SignalType[] = ["logs", "metrics", "traces", "json"];

export const SIGNAL_LABELS: Record<SignalType, string> = {
  logs: "Logs",
  metrics: "Metrics",
  traces: "Traces",
  json: "JSON",
};

export interface EnrichmentQuery {
  datasource: string;
  provider: string;
  queryName: string;
  queryConfig: Record<string, unknown>;
  as: string;
  format: SignalType;
}

export interface TimeRange {
  start: string;
  end: string;
}

export interface PaginationState {
  sid: string;
  offset: number;
  count: number;
  total: number;
}

export interface ProviderViewProps {
  query: EnrichmentQuery;
  entityId: string;
  entityIdentifiers: Record<string, string>;
  entityDisplay: Record<string, unknown>;
  result: unknown | undefined;
  pagination: PaginationState | null;
  loading: boolean;
  onRun: () => void;
  onPageChange?: (offset: number) => void;
  onFetchAll?: () => void;
}
