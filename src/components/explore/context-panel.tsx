"use client";

import { useState, useMemo, useEffect } from "react";
import { format, setHours, setMinutes } from "date-fns";
import { CalendarIcon, Play, Loader2, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GraphEntity } from "@/lib/engine/types";
import type { WeaveSchema } from "@/lib/schema/types";

interface ContextPanelProps {
  entities: GraphEntity[];
  schema: WeaveSchema | null;
  projectId: string;
}

function DateTimePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
}) {
  const timeValue = format(value, "HH:mm");

  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-56 justify-start text-left font-normal h-8 text-xs",
              !value && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
            {format(value, "MMM d, yyyy  HH:mm")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={(day) => {
              if (!day) return;
              const updated = setMinutes(
                setHours(day, value.getHours()),
                value.getMinutes(),
              );
              onChange(updated);
            }}
            initialFocus
          />
          <div className="border-t px-3 py-2 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="time"
              className="h-7 text-xs w-28"
              value={timeValue}
              onChange={(e) => {
                const [h, m] = e.target.value.split(":").map(Number);
                if (isNaN(h) || isNaN(m)) return;
                onChange(setMinutes(setHours(value, h), m));
              }}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function computeDefaultTimeRange(entities: GraphEntity[]): {
  start: Date;
  end: Date;
} {
  let minStart: number | null = null;
  let maxEnd: number | null = null;

  for (const entity of entities) {
    const started = entity.display.started ?? entity.display.startTime;
    const completed =
      entity.display.completed ?? entity.display.completionTime;

    if (!started || !completed) continue;

    const s = new Date(String(started)).getTime();
    const e = new Date(String(completed)).getTime();

    if (isNaN(s) || isNaN(e)) continue;

    if (minStart === null || s < minStart) minStart = s;
    if (maxEnd === null || e > maxEnd) maxEnd = e;
  }

  if (minStart === null || maxEnd === null) {
    const now = Date.now();
    return {
      start: new Date(now - 30 * 60_000),
      end: new Date(now),
    };
  }

  const padding = 5 * 60_000;
  return {
    start: new Date(minStart - padding),
    end: new Date(maxEnd + padding),
  };
}

export function ContextPanel({ entities, schema, projectId }: ContextPanelProps) {
  const defaultRange = useMemo(
    () => computeDefaultTimeRange(entities),
    [entities],
  );

  const [start, setStart] = useState(defaultRange.start);
  const [end, setEnd] = useState(defaultRange.end);

  useEffect(() => {
    setStart(defaultRange.start);
    setEnd(defaultRange.end);
  }, [defaultRange]);

  const [results, setResults] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const contextQueries = schema?.context ?? {};
  const queryNames = Object.keys(contextQueries);

  const handleRun = async (queryName: string) => {
    setLoading((prev) => ({ ...prev, [queryName]: true }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[queryName];
      return next;
    });

    try {
      const res = await fetch("/api/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          queryName,
          start: start.toISOString(),
          end: end.toISOString(),
        }),
      });

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error ?? `Request failed (${res.status})`);
      }

      const { result } = await res.json();
      setResults((prev) => ({ ...prev, [queryName]: result }));
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [queryName]: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [queryName]: false }));
    }
  };

  const handleRunAll = async () => {
    await Promise.all(queryNames.map((name) => handleRun(name)));
  };

  if (queryNames.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No context queries defined in the schema. Add a{" "}
        <code className="text-xs bg-muted px-1 py-0.5 rounded">context</code>{" "}
        section to your schema to see environmental data during explorations.
      </p>
    );
  }

  const entitiesWithRange = entities.filter((e) => {
    const s = e.display.started ?? e.display.startTime;
    const c = e.display.completed ?? e.display.completionTime;
    return s && c;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <DateTimePicker label="Start" value={start} onChange={setStart} />
        <DateTimePicker label="End" value={end} onChange={setEnd} />
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={handleRunAll}
          disabled={Object.values(loading).some(Boolean)}
        >
          Run All
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <Clock className="h-3 w-3" />
        Time range computed from {entitiesWithRange.length} entities with
        start/end times, with 5 min padding.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {queryNames.map((name) => {
          const def = contextQueries[name];
          const result = results[name];
          const isLoading = loading[name] ?? false;
          const error = errors[name];

          return (
            <Card key={name} className="overflow-hidden">
              <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
                <div className="space-y-0.5">
                  <CardTitle className="text-sm font-medium">
                    {def.display.label}
                  </CardTitle>
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0"
                    >
                      {def.datasource}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0"
                    >
                      {def.display.type}
                    </Badge>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => handleRun(name)}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                </Button>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0">
                {error && (
                  <div className="flex items-start gap-1.5 text-destructive text-xs">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                {!error && result !== undefined && (
                  <pre className="text-xs bg-muted/50 rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap">
                    {typeof result === "object"
                      ? JSON.stringify(result, null, 2)
                      : String(result)}
                  </pre>
                )}
                {!error && result === undefined && !isLoading && (
                  <p className="text-xs text-muted-foreground">
                    Click play to run this query.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
