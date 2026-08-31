"use client";

import { useMemo, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { GraphEntity, GraphEdge } from "@/lib/engine/types";

interface TimelineViewProps {
  entities: GraphEntity[];
  edges: GraphEdge[];
}

interface TimelineRow {
  entity: GraphEntity;
  start: number;
  end: number;
  duration: number;
}

const TYPE_COLORS: Record<string, { bar: string; text: string }> = {
  PipelineRun: { bar: "#0ea5e9", text: "text-sky-400" },
  TaskRun:     { bar: "#8b5cf6", text: "text-violet-400" },
  ConfigMap:   { bar: "#fbbf24", text: "text-amber-400" },
};

const DEFAULT_COLOR = { bar: "#71717a", text: "text-zinc-400" };

const STATUS_COLORS: Record<string, string> = {
  succeeded: "#22c55e",
  failed: "#ef4444",
  running: "#3b82f6",
};

function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
}

function formatTime(ts: number, minTs: number): string {
  const sec = Math.round((ts - minTs) / 1000);
  if (sec < 120) return `+${sec}s`;
  return `+${Math.round(sec / 60)}m`;
}

/**
 * Get all entity IDs connected to a given entity (1-hop neighbors via edges).
 */
function getConnectedIds(entityId: string, edges: GraphEdge[]): Set<string> {
  const connected = new Set<string>([entityId]);
  for (const edge of edges) {
    if (edge.source === entityId) connected.add(edge.target);
    if (edge.target === entityId) connected.add(edge.source);
  }
  return connected;
}

export function TimelineView({ entities, edges }: TimelineViewProps) {
  const entityTypes = useMemo(() => {
    const types = new Set<string>();
    for (const e of entities) {
      if (e.display.started) types.add(e.type);
    }
    return Array.from(types);
  }, [entities]);

  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [focusedEntityId, setFocusedEntityId] = useState<string | null>(null);

  const toggleType = (type: string) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const handleRowClick = useCallback(
    (entityId: string) => {
      setFocusedEntityId((prev) => (prev === entityId ? null : entityId));
    },
    [],
  );

  // Compute connected IDs for focus filter
  const focusedConnectedIds = useMemo(() => {
    if (!focusedEntityId) return null;
    return getConnectedIds(focusedEntityId, edges);
  }, [focusedEntityId, edges]);

  const focusedEntity = focusedEntityId
    ? entities.find((e) => e.id === focusedEntityId)
    : null;

  const { rows, minTime, maxTime, totalDuration } = useMemo(() => {
    const timed: TimelineRow[] = [];

    for (const entity of entities) {
      if (hiddenTypes.has(entity.type)) continue;

      // If focused, only show connected entities
      if (focusedConnectedIds && !focusedConnectedIds.has(entity.id)) continue;

      const startStr = entity.display.started as string | undefined;
      if (!startStr) continue;

      const start = new Date(startStr).getTime();
      if (isNaN(start)) continue;

      const endStr = entity.display.completed as string | undefined;
      const end = endStr ? new Date(endStr).getTime() : start;
      const validEnd = isNaN(end) ? start : end;
      const duration = validEnd - start;

      timed.push({ entity, start, end: validEnd, duration });
    }

    if (timed.length === 0) {
      return { rows: [], minTime: 0, maxTime: 0, totalDuration: 0 };
    }

    timed.sort((a, b) => {
      const startDiff = a.start - b.start;
      if (startDiff !== 0) return startDiff;
      return b.duration - a.duration;
    });

    const ranged = timed.filter((r) => r.duration > 0);
    const minTime = ranged.length > 0
      ? Math.min(...ranged.map((r) => r.start))
      : Math.min(...timed.map((r) => r.start));
    const maxTime = ranged.length > 0
      ? Math.max(...ranged.map((r) => r.end))
      : Math.max(...timed.map((r) => r.start));
    const totalDuration = Math.max(maxTime - minTime, 1000);

    for (const row of timed) {
      if (row.duration === 0) {
        row.start = Math.max(row.start, minTime);
        row.start = Math.min(row.start, maxTime);
        row.end = row.start;
      }
    }

    return { rows: timed, minTime, maxTime, totalDuration };
  }, [entities, hiddenTypes, focusedConnectedIds]);

  if (entityTypes.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] rounded-lg border border-dashed border-border/50">
        <p className="text-sm text-muted-foreground">
          No timing data available. Entities need &quot;started&quot; and
          &quot;completed&quot; display fields.
        </p>
      </div>
    );
  }

  const ROW_HEIGHT = 32;
  const LABEL_WIDTH = 280;

  const tickCount = Math.min(8, Math.max(3, Math.ceil(totalDuration / 10000)));
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const t = minTime + (totalDuration * i) / tickCount;
    return { time: t, label: formatTime(t, minTime) };
  });

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
          Show
        </span>
        {entityTypes.map((type) => {
          const colors = TYPE_COLORS[type] ?? DEFAULT_COLOR;
          const active = !hiddenTypes.has(type);
          const totalCount = entities.filter(
            (e) => e.type === type && e.display.started,
          ).length;

          return (
            <button
              key={type}
              type="button"
              onClick={() => toggleType(type)}
              className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-mono transition-all cursor-pointer"
              style={{
                borderColor: active ? `${colors.bar}60` : "#27272a",
                background: active ? `${colors.bar}12` : "transparent",
                color: active ? colors.bar : "#52525b",
              }}
            >
              <div
                className="w-3 h-2 rounded-sm"
                style={{ background: active ? colors.bar : "#52525b" }}
              />
              {type}
              <span className="text-muted-foreground/60">{totalCount}</span>
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span>Total: {formatDuration(totalDuration)}</span>
          <span>{rows.length} entities</span>
        </div>
      </div>

      {/* Focus indicator */}
      {focusedEntity && (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5">
          <span className="text-xs text-muted-foreground">Focused on</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
            {focusedEntity.type}
          </Badge>
          <span className="text-xs font-mono">
            {Object.values(focusedEntity.identifiers)[0] ?? focusedEntity.id}
          </span>
          <span className="text-[10px] text-muted-foreground">
            showing {rows.length} connected entities
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 ml-auto"
            onClick={() => setFocusedEntityId(null)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Chart */}
      {rows.length > 0 && (
        <div className="rounded-lg border border-border/50 overflow-x-auto bg-zinc-950">
          <div className="flex" style={{ minWidth: LABEL_WIDTH + 600 }}>
            {/* Labels column */}
            <div
              className="shrink-0 border-r border-border/30"
              style={{ width: LABEL_WIDTH }}
            >
              <div
                className="border-b border-border/30"
                style={{ height: ROW_HEIGHT }}
              />
              {rows.map((row) => {
                const colors = TYPE_COLORS[row.entity.type] ?? DEFAULT_COLOR;
                const name = Object.values(row.entity.identifiers)[0] ?? "";
                const taskName = row.entity.display.task as string | undefined;
                const displayName = taskName ?? name;
                const isFocused = row.entity.id === focusedEntityId;

                return (
                  <div
                    key={row.entity.id}
                    className={`flex items-center gap-2 px-2 border-b border-border/10 cursor-pointer transition-colors ${
                      isFocused
                        ? "bg-primary/10"
                        : "hover:bg-muted/30"
                    }`}
                    style={{ height: ROW_HEIGHT }}
                    onClick={() => handleRowClick(row.entity.id)}
                  >
                    <Badge
                      variant="outline"
                      className={`shrink-0 text-[9px] px-1 py-0 ${colors.text} border-current/30`}
                    >
                      {row.entity.type}
                    </Badge>
                    <span className="text-[11px] font-mono truncate">
                      {displayName}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Bars column */}
            <div className="flex-1 relative pr-4">
              {/* Time axis */}
              <div
                className="flex items-end border-b border-border/30 px-2"
                style={{ height: ROW_HEIGHT }}
              >
                {ticks.map((tick, i) => {
                  const left =
                    ((tick.time - minTime) / totalDuration) * 100;
                  return (
                    <span
                      key={i}
                      className="absolute text-[9px] text-muted-foreground/50 -translate-x-1/2"
                      style={{ left: `${left}%`, bottom: 4 }}
                    >
                      {tick.label}
                    </span>
                  );
                })}
              </div>

              {/* Grid lines */}
              <div className="absolute inset-0" style={{ top: ROW_HEIGHT }}>
                {ticks.map((tick, i) => {
                  const left =
                    ((tick.time - minTime) / totalDuration) * 100;
                  return (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-l border-border/10"
                      style={{ left: `${left}%` }}
                    />
                  );
                })}
              </div>

              {/* Bars */}
              {rows.map((row) => {
                const colors = TYPE_COLORS[row.entity.type] ?? DEFAULT_COLOR;
                const clampedStart = Math.max(row.start, minTime);
                const clampedEnd = Math.min(row.end, maxTime);
                const left =
                  ((clampedStart - minTime) / totalDuration) * 100;
                const isPoint = row.duration < 1000;
                const width = isPoint
                  ? 0
                  : Math.max(
                      0.5,
                      ((clampedEnd - clampedStart) / totalDuration) * 100,
                    );
                const status = String(
                  row.entity.display.status ?? "",
                ).toLowerCase();
                const statusColor = STATUS_COLORS[status];
                const isFocused = row.entity.id === focusedEntityId;

                return (
                  <div
                    key={row.entity.id}
                    className={`relative border-b border-border/10 cursor-pointer transition-colors ${
                      isFocused ? "bg-primary/5" : "hover:bg-muted/20"
                    }`}
                    style={{ height: ROW_HEIGHT }}
                    onClick={() => handleRowClick(row.entity.id)}
                  >
                    {isPoint ? (
                      <div
                        className="absolute top-2"
                        style={{
                          left: `${left}%`,
                          transform: "translateX(-50%)",
                        }}
                      >
                        <div
                          className="w-3 h-3 rotate-45 rounded-sm"
                          style={{
                            background: colors.bar,
                            border: `1px solid ${colors.bar}`,
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        className="absolute top-1.5 rounded-sm flex items-center overflow-hidden"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          height: ROW_HEIGHT - 12,
                          background: isFocused ? `${colors.bar}33` : `${colors.bar}22`,
                          border: `1px solid ${isFocused ? `${colors.bar}88` : `${colors.bar}44`}`,
                          minWidth: 4,
                        }}
                      >
                        {statusColor && (
                          <div
                            className="w-1 h-full shrink-0"
                            style={{ background: statusColor }}
                          />
                        )}
                        {width > 3 && (
                          <span
                            className="text-[9px] px-1 truncate"
                            style={{ color: colors.bar }}
                          >
                            {formatDuration(row.duration)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
