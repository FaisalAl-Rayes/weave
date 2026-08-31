"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

import { Header } from "@/components/layout/header";
import { SummaryHeader } from "./summary-header";
import { FlowCard } from "./flow-card";
import { NamespaceSelect } from "./namespace-select";
import { PulseQueryLog } from "./query-log";
import { DEFAULT_PROJECT_ID } from "@/lib/shared";
import type { AnalyzeResponse } from "@/lib/pulse/types";

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm" for datetime-local
}

function defaultRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return { start: toDateInputValue(start), end: toDateInputValue(end) };
}

export function PulsePage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project") ?? DEFAULT_PROJECT_ID;

  // Namespaces from Kubernetes — populated on mount
  const [availableNamespaces, setAvailableNamespaces] = useState<string[]>([]);
  const [namespacesLoading, setNamespacesLoading] = useState(true);
  const [selectedNamespaces, setSelectedNamespaces] = useState<string[]>([]);

  const defaults = defaultRange();
  const [startTime, setStartTime] = useState(defaults.start);
  const [endTime, setEndTime] = useState(defaults.end);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch available namespaces from Kubernetes on mount
  useEffect(() => {
    setNamespacesLoading(true);
    fetch(`/api/pulse/namespaces?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => r.json())
      .then((data: { namespaces?: string[] }) => {
        const ns = data.namespaces ?? [];
        setAvailableNamespaces(ns);
        // Auto-select only if the list is small enough to be safe (≤5 namespaces).
        // On large clusters with hundreds of tenant namespaces, start empty
        // so the user consciously picks what they want to analyze.
        if (ns.length <= 5) {
          setSelectedNamespaces(ns);
        }
      })
      .catch(() => setAvailableNamespaces([]))
      .finally(() => setNamespacesLoading(false));
  }, [projectId]);

  const toggleNamespace = (ns: string) => {
    setSelectedNamespaces((prev) =>
      prev.includes(ns) ? prev.filter((n) => n !== ns) : [...prev, ns],
    );
  };

  const handleAnalyze = useCallback(async () => {
    if (selectedNamespaces.length === 0) {
      setError("Select at least one namespace.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/pulse/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          namespaces: selectedNamespaces,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? `Server error ${res.status}`);
        return;
      }

      setResult(await res.json() as AnalyzeResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedNamespaces, startTime, endTime]);

  return (
    <div>
      <Header title="Pulse" breadcrumbs={[{ label: "Pulse" }]} />

      <div className="flex flex-1 flex-col gap-6 p-4 max-w-5xl">
        {/* Controls */}
        <div className="rounded-lg border border-border/50 bg-card p-4 space-y-4">
          {/* Namespace selection */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Namespaces</Label>
            <NamespaceSelect
              namespaces={availableNamespaces}
              selected={selectedNamespaces}
              onChange={setSelectedNamespaces}
              loading={namespacesLoading}
            />
            {!namespacesLoading && availableNamespaces.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No namespaces found. Check Kubernetes connection in Project settings.
              </p>
            )}
          </div>

          {/* Time range */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="h-8 text-xs w-[200px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="h-8 text-xs w-[200px]"
              />
            </div>
            <Button
              onClick={handleAnalyze}
              disabled={loading || selectedNamespaces.length === 0 || namespacesLoading}
              className="h-8"
            >
              {loading ? "Analyzing…" : "Analyze"}
            </Button>
          </div>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>

        {/* Results */}
        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-10 rounded-lg" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-32 rounded-lg" />
              ))}
            </div>
          </div>
        )}

        {result && !loading && (
          <div className="space-y-4">
            <SummaryHeader summary={result.summary} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {result.flows.map((flow) => (
                <div key={flow.flowId} className={flow.widePanel ? "sm:col-span-2" : ""}>
                  <FlowCard flow={flow} projectId={projectId} />
                </div>
              ))}
            </div>
            <PulseQueryLog entries={result.queryLog} />
          </div>
        )}

        {!result && !loading && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Select namespaces and a time range, then click Analyze.
          </p>
        )}
      </div>
    </div>
  );
}
