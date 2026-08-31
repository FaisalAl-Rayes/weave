import type { WeaveSchema } from "@/lib/schema/types";
import type { DataContext, Flow, FlowResult, K8sResource } from "../../types";
import { calcPerformance } from "../utils/performance";
import type { PipelinePerformanceData } from "../utils/performance";

export type { PipelinePerformanceData as ReleasePerformanceData };

function isReleasePipelineRun(run: K8sResource): boolean {
  const labels = run.metadata?.labels as Record<string, string> | undefined;
  return labels?.["pipelines.appstudio.openshift.io/type"] === "managed";
}

export const releasePerformanceFlow: Flow<PipelinePerformanceData> = {
  id: "release-performance",
  title: "Release Performance",
  widePanel: true,
  description: "Min / max / avg wait time and execution time for release pipeline runs (managed).",
  dependencies: ["PipelineRun"],

  isApplicable(schema: WeaveSchema): boolean {
    return "PipelineRun" in schema.entities;
  },

  async execute(ctx: DataContext): Promise<FlowResult<PipelinePerformanceData>> {
    try {
      const runs = (ctx.resources["PipelineRun"] ?? []).filter(isReleasePipelineRun);
      return { status: "success", data: calcPerformance(runs) };
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
  },
};
