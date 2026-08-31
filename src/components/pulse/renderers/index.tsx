"use client";

import type { ComponentType } from "react";
import { BuildHealthRenderer } from "./build-health/renderer";
import { TestHealthRenderer } from "./test-health/renderer";
import { ReleaseHealthRenderer } from "./release-health/renderer";
import { ReleasePerformanceRenderer } from "./release-performance/renderer";
import { FailureAnalysisRenderer } from "./failure-analysis/renderer";
import { PerformanceRenderer } from "./performance/renderer";

// Renderers accept data (unknown, cast internally) and projectId for drill-down links.
// Adding a new renderer: create the component and add it here keyed by flowId.
type RendererProps = { data: unknown; projectId: string };

const RENDERERS: Record<string, ComponentType<RendererProps>> = {
  "build-health": BuildHealthRenderer,
  "test-health": TestHealthRenderer,
  "release-health": ReleaseHealthRenderer,
  "releases": ReleasePerformanceRenderer,
  "build-performance": PerformanceRenderer,
  "test-performance": PerformanceRenderer,
  "release-performance": PerformanceRenderer,
  "failure-analysis": FailureAnalysisRenderer,
};

export function getRenderer(flowId: string): ComponentType<RendererProps> {
  return RENDERERS[flowId] ?? FallbackRenderer;
}

function FallbackRenderer({ data }: RendererProps) {
  return (
    <pre className="text-xs text-muted-foreground overflow-auto">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
