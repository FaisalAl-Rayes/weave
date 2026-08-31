import type { WeaveSchema } from "@/lib/schema/types";
import type { DataContext, Flow, FlowResult, K8sResource } from "../../types";
import { isSucceeded, isFailed } from "../../types";

export interface ReleasePipelineRun {
  name: string;
  namespace: string;
  status: "succeeded" | "failed" | "running";
  application?: string;
  snapshot?: string;
  startTime?: string;
  completionTime?: string;
}

export interface ReleaseHealthData {
  total: number;
  succeeded: number;
  failed: number;
  running: number;
  successRate: number;
  runs: ReleasePipelineRun[];
}

function isReleasePipelineRun(run: K8sResource): boolean {
  const labels = run.metadata?.labels as Record<string, string> | undefined;
  return labels?.["pipelines.appstudio.openshift.io/type"] === "managed";
}

export const releaseHealthFlow: Flow<ReleaseHealthData> = {
  id: "release-health",
  title: "Release Health",
  description: "Release pipeline (managed) success rate over the selected period.",
  dependencies: ["PipelineRun"],

  isApplicable(schema: WeaveSchema): boolean {
    return "PipelineRun" in schema.entities;
  },

  async execute(ctx: DataContext): Promise<FlowResult<ReleaseHealthData>> {
    try {
      const releaseRuns = (ctx.resources["PipelineRun"] ?? []).filter(isReleasePipelineRun);

      let succeeded = 0;
      let failed = 0;
      let running = 0;

      const runs: ReleasePipelineRun[] = releaseRuns.map((run) => {
        const labels = run.metadata?.labels as Record<string, string> | undefined;
        const status = run.status as { startTime?: string; completionTime?: string } | undefined;

        let runStatus: "succeeded" | "failed" | "running" = "running";
        if (isSucceeded(run)) { runStatus = "succeeded"; succeeded++; }
        else if (isFailed(run)) { runStatus = "failed"; failed++; }
        else running++;

        return {
          name: run.metadata?.name ?? "unknown",
          namespace: run.metadata?.namespace ?? "unknown",
          status: runStatus,
          application: labels?.["appstudio.openshift.io/application"],
          snapshot: labels?.["appstudio.openshift.io/snapshot"],
          startTime: status?.startTime,
          completionTime: status?.completionTime,
        };
      });

      // Most recent first
      runs.sort((a, b) => {
        const ta = a.startTime ? new Date(a.startTime).getTime() : 0;
        const tb = b.startTime ? new Date(b.startTime).getTime() : 0;
        return tb - ta;
      });

      const total = releaseRuns.length;
      const completed = succeeded + failed;

      return {
        status: "success",
        data: {
          total,
          succeeded,
          failed,
          running,
          successRate: completed > 0 ? Math.round((succeeded / completed) * 100) : 0,
          runs,
        },
      };
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
  },
};
