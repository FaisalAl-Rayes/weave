"use client";

import { useState, useMemo, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import type { GraphEntity } from "@/lib/engine/types";
import type { WeaveSchema } from "@/lib/schema/types";
import type { SignalType, EnrichmentQuery, TimeRange, PaginationState } from "./types";
import { SIGNAL_TYPES, SIGNAL_LABELS } from "./types";
import { SplunkView } from "./splunk-view";
import { PrometheusView } from "./prometheus-view";
import { GenericView } from "./generic-view";
import { DateTimePicker } from "./datetime-picker";

interface EnrichmentPanelProps {
  entity: GraphEntity;
  schema: WeaveSchema | null;
  enrichments: Record<string, unknown>;
  onRunEnrichment: (
    entityId: string,
    datasource: string,
    queryName: string,
    as: string,
    timeRange?: TimeRange,
    pagination?: { sid?: string; offset?: number; fetchAll?: boolean },
  ) => Promise<void>;
}

/**
 * Resolve the provider view component for a given provider type.
 */
function getProviderView(provider: string) {
  switch (provider) {
    case "splunk":
      return SplunkView;
    case "prometheus":
      return PrometheusView;
    default:
      return GenericView;
  }
}

export function EnrichmentPanel({
  entity,
  schema,
  enrichments,
  onRunEnrichment,
}: EnrichmentPanelProps) {
  // Collect all enrichment queries grouped by signal type
  const querysBySignal = useMemo(() => {
    const map = new Map<SignalType, EnrichmentQuery[]>();

    if (!schema) return map;

    for (const [dsName, dsDef] of Object.entries(schema.datasources)) {
      const enrichDef = dsDef.enriches?.[entity.type];
      if (!enrichDef) continue;

      for (const [queryName, queryEntry] of Object.entries(enrichDef.queries)) {
        const { as, format: fmt, ...queryConfig } = queryEntry;
        const signal: SignalType = (fmt === "logs" || fmt === "metrics" || fmt === "traces")
          ? fmt
          : "json";

        const queries = map.get(signal) ?? [];
        queries.push({
          datasource: dsName,
          provider: dsDef.provider,
          queryName,
          queryConfig: queryConfig as Record<string, unknown>,
          as,
          format: signal,
        });
        map.set(signal, queries);
      }
    }

    return map;
  }, [schema, entity.type]);

  // Determine which tabs are available
  const availableTabs = useMemo(
    () => SIGNAL_TYPES.filter((t) => (querysBySignal.get(t)?.length ?? 0) > 0),
    [querysBySignal],
  );

  if (availableTabs.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
      <Tabs defaultValue={availableTabs[0]}>
        <div className="flex items-center border-b border-border/30 bg-muted/10 px-4">
          <TabsList className="bg-transparent h-9 gap-1">
            {SIGNAL_TYPES.map((signal) => {
              const queries = querysBySignal.get(signal);
              const count = queries?.length ?? 0;
              const isAvailable = count > 0;

              return (
                <TabsTrigger
                  key={signal}
                  value={signal}
                  disabled={!isAvailable}
                  className="text-[11px] data-[state=active]:bg-background px-3 py-1"
                >
                  {SIGNAL_LABELS[signal]}
                  {isAvailable && (
                    <Badge variant="secondary" className="ml-1.5 text-[9px] px-1 py-0">
                      {count}
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {availableTabs.map((signal) => (
          <TabsContent key={signal} value={signal} className="mt-0">
            <SignalTab
              signal={signal}
              queries={querysBySignal.get(signal) ?? []}
              entity={entity}
              enrichments={enrichments}
              onRunEnrichment={onRunEnrichment}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

/**
 * Content for a single signal type tab.
 * Shows datasource selector and the provider-specific view.
 */
function SignalTab({
  signal,
  queries,
  entity,
  enrichments,
  onRunEnrichment,
}: {
  signal: SignalType;
  queries: EnrichmentQuery[];
  entity: GraphEntity;
  enrichments: Record<string, unknown>;
  onRunEnrichment: EnrichmentPanelProps["onRunEnrichment"];
}) {
  // Group queries by datasource for the selector
  const datasources = useMemo(() => {
    const seen = new Map<string, { provider: string; queries: EnrichmentQuery[] }>();
    for (const q of queries) {
      const existing = seen.get(q.datasource);
      if (existing) {
        existing.queries.push(q);
      } else {
        seen.set(q.datasource, { provider: q.provider, queries: [q] });
      }
    }
    return seen;
  }, [queries]);

  const dsNames = Array.from(datasources.keys());
  const [selectedDs, setSelectedDs] = useState(dsNames[0] ?? "");
  const [selectedQuery, setSelectedQuery] = useState(queries[0]?.queryName ?? "");
  const [loading, setLoading] = useState(false);

  // Entity time anchors
  const entityStart = entity.display?.started as string | undefined;
  const entityEnd = entity.display?.completed as string | undefined;
  const hasEntityTime = !!entityStart;

  // Time range state
  const [selectedPreset, setSelectedPreset] = useState<string>(hasEntityTime ? "lifetime" : "none");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const resolvedTimeRange = useMemo((): TimeRange | undefined => {
    if (selectedPreset === "none") return undefined;
    if (selectedPreset === "custom") {
      return (customStart || customEnd) ? { start: customStart, end: customEnd } : undefined;
    }

    const startDate = entityStart ? new Date(entityStart) : null;
    const endDate = entityEnd ? new Date(entityEnd) : new Date();

    if (!startDate) return undefined;

    const offsetMs: Record<string, number> = {
      "lifetime": 0,
      "5m": 5 * 60_000,
      "15m": 15 * 60_000,
      "1h": 60 * 60_000,
    };
    const offset = offsetMs[selectedPreset] ?? 0;

    return {
      start: new Date(startDate.getTime() - offset).toISOString(),
      end: new Date(endDate.getTime() + offset).toISOString(),
    };
  }, [selectedPreset, entityStart, entityEnd, customStart, customEnd]);

  const dsInfo = datasources.get(selectedDs);
  const activeQuery = queries.find(
    (q) => q.datasource === selectedDs && q.queryName === selectedQuery,
  ) ?? dsInfo?.queries[0];

  // When datasource changes, select first query for that datasource
  const handleDsChange = useCallback((ds: string) => {
    setSelectedDs(ds);
    const first = datasources.get(ds)?.queries[0];
    if (first) setSelectedQuery(first.queryName);
  }, [datasources]);

  const handleRun = useCallback(async () => {
    if (!activeQuery) return;
    setLoading(true);
    try {
      await onRunEnrichment(entity.id, activeQuery.datasource, activeQuery.queryName, activeQuery.as, resolvedTimeRange);
    } finally {
      setLoading(false);
    }
  }, [entity.id, activeQuery, onRunEnrichment, resolvedTimeRange]);

  const handlePageChange = useCallback(async (offset: number) => {
    if (!activeQuery) return;
    const enrichKey = `${activeQuery.datasource}::${activeQuery.as}`;
    const pag = enrichments[`${enrichKey}__pagination`] as PaginationState | null;
    if (!pag?.sid) return;
    setLoading(true);
    try {
      await onRunEnrichment(entity.id, activeQuery.datasource, activeQuery.queryName, activeQuery.as, resolvedTimeRange, { sid: pag.sid, offset });
    } finally {
      setLoading(false);
    }
  }, [entity.id, activeQuery, enrichments, onRunEnrichment, resolvedTimeRange]);

  const handleFetchAll = useCallback(async () => {
    if (!activeQuery) return;
    const enrichKey = `${activeQuery.datasource}::${activeQuery.as}`;
    const pag = enrichments[`${enrichKey}__pagination`] as PaginationState | null;
    if (!pag?.sid) return;
    setLoading(true);
    try {
      await onRunEnrichment(entity.id, activeQuery.datasource, activeQuery.queryName, activeQuery.as, resolvedTimeRange, { sid: pag.sid, fetchAll: true });
    } finally {
      setLoading(false);
    }
  }, [entity.id, activeQuery, enrichments, onRunEnrichment, resolvedTimeRange]);

  if (!activeQuery || !dsInfo) return null;

  const ProviderView = getProviderView(dsInfo.provider);
  const enrichKey = `${activeQuery.datasource}::${activeQuery.as}`;
  const result = enrichments[enrichKey];
  const paginationState = (enrichments[`${enrichKey}__pagination`] as PaginationState | null) ?? null;

  return (
    <div className="p-4 space-y-3">
      {/* Datasource + query selector */}
      <div className="flex items-center gap-3">
        <div className="space-y-0.5">
          <span className="text-[10px] text-muted-foreground">Datasource</span>
          <Select value={selectedDs} onValueChange={handleDsChange}>
            <SelectTrigger className="h-7 text-[11px] w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dsNames.map((ds) => (
                <SelectItem key={ds} value={ds} className="text-[11px]">
                  {ds}
                  <span className="ml-1 text-muted-foreground">({datasources.get(ds)?.provider})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-0.5">
          <span className="text-[10px] text-muted-foreground">Query</span>
          <Select value={selectedQuery} onValueChange={setSelectedQuery}>
            <SelectTrigger className="h-7 text-[11px] w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dsInfo.queries.map((q) => (
                <SelectItem key={q.queryName} value={q.queryName} className="text-[11px]">
                  {q.queryName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="ml-auto self-end">
          <TimeRangePicker
            selectedPreset={selectedPreset}
            onPresetChange={setSelectedPreset}
            hasEntityTime={hasEntityTime}
            resolvedRange={resolvedTimeRange}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
          />
        </div>
      </div>

      {/* Provider-specific view */}
      <ProviderView
        query={activeQuery}
        entityId={entity.id}
        entityIdentifiers={entity.identifiers}
        entityDisplay={entity.display}
        result={result}
        pagination={paginationState}
        loading={loading}
        onRun={handleRun}
        onPageChange={handlePageChange}
        onFetchAll={handleFetchAll}
      />
    </div>
  );
}

const ENTITY_PRESETS = [
  { value: "lifetime", label: "Entity lifetime", description: "Exact start → end" },
  { value: "5m", label: "± 5 min", description: "5 min buffer" },
  { value: "15m", label: "± 15 min", description: "15 min buffer" },
  { value: "1h", label: "± 1 hour", description: "1 hour buffer" },
] as const;

function formatTimeCompact(iso: string): string {
  try {
    return format(new Date(iso), "MMM d, HH:mm:ss");
  } catch {
    return iso;
  }
}

function TimeRangePicker({
  selectedPreset,
  onPresetChange,
  hasEntityTime,
  resolvedRange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
}: {
  selectedPreset: string;
  onPresetChange: (preset: string) => void;
  hasEntityTime: boolean;
  resolvedRange: TimeRange | undefined;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (v: string) => void;
  onCustomEndChange: (v: string) => void;
}) {
  const triggerLabel = useMemo(() => {
    if (selectedPreset === "none") return "No time filter";
    if (selectedPreset === "custom" && resolvedRange) {
      return `${formatTimeCompact(resolvedRange.start)} → ${formatTimeCompact(resolvedRange.end)}`;
    }
    if (selectedPreset === "custom") return "Custom range";
    return ENTITY_PRESETS.find((p) => p.value === selectedPreset)?.label ?? selectedPreset;
  }, [selectedPreset, resolvedRange]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-7 text-[11px] px-2.5 gap-1.5 font-normal border-border/50 hover:bg-muted/30"
        >
          <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="max-w-56 truncate">{triggerLabel}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end" sideOffset={6}>
        <div className="py-1.5">
          {/* Entity-anchored section */}
          <div className="px-3 py-1.5">
            <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-widest">
              Relative to entity
            </span>
          </div>
          {ENTITY_PRESETS.map((preset) => {
            const isActive = selectedPreset === preset.value;
            return (
              <button
                key={preset.value}
                disabled={!hasEntityTime}
                onClick={() => onPresetChange(preset.value)}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-[11px] transition-colors ${
                  isActive
                    ? "bg-muted/60 text-foreground"
                    : hasEntityTime
                      ? "text-muted-foreground hover:bg-muted/30 hover:text-foreground cursor-pointer"
                      : "text-muted-foreground/40 cursor-not-allowed"
                }`}
              >
                <span>{preset.label}</span>
                <span className="text-[9px] text-muted-foreground">{preset.description}</span>
              </button>
            );
          })}

          {/* Resolved time preview */}
          {resolvedRange && selectedPreset !== "none" && selectedPreset !== "custom" && (
            <div className="mx-3 mt-1 mb-0.5 rounded bg-muted/20 px-2.5 py-1.5">
              <div className="flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground">
                <span>{formatTimeCompact(resolvedRange.start)}</span>
                <span className="text-muted-foreground/50">→</span>
                <span>{formatTimeCompact(resolvedRange.end)}</span>
              </div>
            </div>
          )}

          <div className="mx-3 my-1.5 border-t border-border/20" />

          {/* Other options */}
          <button
            onClick={() => onPresetChange("none")}
            className={`w-full flex items-center px-3 py-1.5 text-[11px] transition-colors cursor-pointer ${
              selectedPreset === "none"
                ? "bg-muted/60 text-foreground"
                : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            }`}
          >
            No time filter
          </button>

          <button
            onClick={() => onPresetChange("custom")}
            className={`w-full flex items-center px-3 py-1.5 text-[11px] transition-colors cursor-pointer ${
              selectedPreset === "custom"
                ? "bg-muted/60 text-foreground"
                : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            }`}
          >
            Custom range
          </button>

          {selectedPreset === "custom" && (
            <div className="mx-3 mt-1.5 space-y-2 pb-1">
              <div className="space-y-1">
                <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-widest">From</span>
                <DateTimePicker
                  value={customStart}
                  onChange={onCustomStartChange}
                  placeholder="Pick start time"
                  className="w-full"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-widest">To</span>
                <DateTimePicker
                  value={customEnd}
                  onChange={onCustomEndChange}
                  placeholder="Pick end time"
                  className="w-full"
                />
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
