import type { WeaveSchema } from "@/lib/schema/types";
import type { DataContext, Flow, FlowResult, K8sResource } from "../../types";
import { isCompleted, isFailed, getConditionReason } from "../../types";

export interface FailureGroup {
  reason: string;
  count: number;
  pipelineRuns: Array<{
    name: string;
    namespace: string;
    failingTask?: string;
    startTime?: string;
    completionTime?: string;
  }>;
}

export interface FailureAnalysisData {
  totalFailed: number;
  groups: FailureGroup[];
}

function getFailingTask(run: K8sResource): string | undefined {
  // Tekton stores the failing task name in the condition message or childStatus
  const childStatuses = (run.status as {
    childReferences?: Array<{ name: string; displayName?: string; conditions?: { reason?: string }[] }>;
  } | undefined)?.childReferences;

  if (childStatuses) {
    const failed = childStatuses.find((c) =>
      c.conditions?.some((cond) => cond.reason === "Failed" || cond.reason === "TaskRunFailed"),
    );
    return failed?.displayName ?? failed?.name;
  }
  return undefined;
}

function groupKey(run: K8sResource): string {
  const reason = getConditionReason(run);
  const task = getFailingTask(run);
  return task ? `${reason} — ${task}` : reason;
}

export const failureAnalysisFlow: Flow<FailureAnalysisData> = {
  id: "failure-analysis",
  title: "Failure Analysis",
  description: "Failed pipeline runs grouped by failure reason and task. Identifies the most common failure patterns.",
  dependencies: ["PipelineRun"],

  isApplicable(schema: WeaveSchema): boolean {
    return "PipelineRun" in schema.entities;
  },

  async execute(ctx: DataContext): Promise<FlowResult<FailureAnalysisData>> {
    try {
      const pipelineRuns = ctx.resources["PipelineRun"] ?? [];
      const failed = pipelineRuns.filter((r) => isCompleted(r) && isFailed(r));

      // Group by failure reason + failing task
      const groupMap = new Map<string, FailureGroup>();

      for (const run of failed) {
        const key = groupKey(run);
        if (!groupMap.has(key)) {
          groupMap.set(key, { reason: key, count: 0, pipelineRuns: [] });
        }
        const group = groupMap.get(key)!;
        group.count++;
        group.pipelineRuns.push({
          name: run.metadata?.name ?? "unknown",
          namespace: run.metadata?.namespace ?? "unknown",
          failingTask: getFailingTask(run),
          startTime: (run.status as { startTime?: string } | undefined)?.startTime,
          completionTime: (run.status as { completionTime?: string } | undefined)?.completionTime,
        });
      }

      // Sort groups by count descending
      const groups = [...groupMap.values()].sort((a, b) => b.count - a.count);

      return {
        status: "success",
        data: {
          totalFailed: failed.length,
          groups,
        },
      };
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
  },
};
