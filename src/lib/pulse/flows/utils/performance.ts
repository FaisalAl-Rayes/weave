import type { K8sResource } from "../../types";
import { isSucceeded } from "../../types";

export interface PerformanceStats {
  min: number;  // seconds
  max: number;  // seconds
  avg: number;  // seconds
  count: number;
}

export interface PerformanceRow {
  namespace: string;
  application: string;
  component: string;
  scenario?: string;
  // wait time: creationTimestamp → startTime
  waitTime: PerformanceStats;
  // execution time: startTime → completionTime (succeeded only)
  executionTime: PerformanceStats;
}

export interface PipelinePerformanceData {
  total: number;
  overall: {
    waitTime: PerformanceStats;
    executionTime: PerformanceStats;
  };
  rows: PerformanceRow[];
}

function toMs(ts: unknown): number | null {
  if (!ts) return null;
  const d = ts instanceof Date ? ts : new Date(ts as string);
  return isNaN(d.getTime()) ? null : d.getTime();
}

function statsFromValues(values: number[]): PerformanceStats {
  if (values.length === 0) return { min: 0, max: 0, avg: 0, count: 0 };
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((s, v) => s + v, 0) / values.length,
    count: values.length,
  };
}

interface RawAccum {
  namespace: string;
  application: string;
  component: string;
  scenario?: string;
  waitValues: number[];
  execValues: number[];
}

export interface CalcOptions {
  scenarioKey?: (run: K8sResource) => string | null;
}

export function calcPerformance(
  runs: K8sResource[],
  options: CalcOptions = {},
): PipelinePerformanceData {
  const overallWait: number[] = [];
  const overallExec: number[] = [];
  const rowMap = new Map<string, RawAccum>();

  for (const run of runs) {
    const labels = (run.metadata?.labels as Record<string, string> | undefined) ?? {};
    const status = run.status as { startTime?: unknown; completionTime?: unknown } | undefined;

    const created = toMs(run.metadata?.creationTimestamp);
    const started = toMs(status?.startTime);
    const completed = toMs(status?.completionTime);

    const waitSec =
      created != null && started != null && started >= created
        ? (started - created) / 1000
        : null;

    const execSec =
      started != null && completed != null && completed >= started && isSucceeded(run)
        ? (completed - started) / 1000
        : null;

    if (waitSec != null) overallWait.push(waitSec);
    if (execSec != null) overallExec.push(execSec);

    const namespace = run.metadata?.namespace ?? "unknown";
    const application = labels["appstudio.openshift.io/application"] ?? "unknown";
    const component = labels["appstudio.openshift.io/component"] ?? "unknown";
    const scenario = options.scenarioKey ? (options.scenarioKey(run) ?? undefined) : undefined;

    const key = [namespace, application, component, scenario ?? ""].join("::");

    if (!rowMap.has(key)) {
      rowMap.set(key, {
        namespace,
        application,
        component,
        ...(scenario != null ? { scenario } : {}),
        waitValues: [],
        execValues: [],
      });
    }
    const accum = rowMap.get(key)!;
    if (waitSec != null) accum.waitValues.push(waitSec);
    if (execSec != null) accum.execValues.push(execSec);
  }

  const rows: PerformanceRow[] = [...rowMap.values()]
    .map(({ waitValues, execValues, ...dims }) => ({
      ...dims,
      waitTime: statsFromValues(waitValues),
      executionTime: statsFromValues(execValues),
    }))
    .sort((a, b) => b.executionTime.avg - a.executionTime.avg);

  return {
    total: runs.length,
    overall: {
      waitTime: statsFromValues(overallWait),
      executionTime: statsFromValues(overallExec),
    },
    rows,
  };
}

// Human-readable duration: "45s", "2m 34s", "1h 23m"
export function formatDuration(seconds: number): string {
  if (seconds < 1) return "<1s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}
