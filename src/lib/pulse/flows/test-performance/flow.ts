import type { WeaveSchema } from "@/lib/schema/types";
import type { DataContext, Flow, FlowResult, K8sResource } from "../../types";
import { calcPerformance } from "../utils/performance";
import type { PipelinePerformanceData } from "../utils/performance";

export type { PipelinePerformanceData as TestPerformanceData };

function isTestPipelineRun(run: K8sResource): boolean {
  const labels = run.metadata?.labels as Record<string, string> | undefined;
  return labels?.["pipelines.appstudio.openshift.io/type"] === "test";
}

function getScenario(run: K8sResource): string | null {
  const labels = run.metadata?.labels as Record<string, string> | undefined;
  return labels?.["test.appstudio.openshift.io/scenario"] ?? null;
}

export const testPerformanceFlow: Flow<PipelinePerformanceData> = {
  id: "test-performance",
  title: "Test Performance",
  widePanel: true,
  description: "Min / max / avg wait time and execution time for integration test pipeline runs, grouped by application, component, and scenario.",
  dependencies: ["PipelineRun"],

  isApplicable(schema: WeaveSchema): boolean {
    return "PipelineRun" in schema.entities;
  },

  async execute(ctx: DataContext): Promise<FlowResult<PipelinePerformanceData>> {
    try {
      const runs = (ctx.resources["PipelineRun"] ?? []).filter(isTestPipelineRun);
      return { status: "success", data: calcPerformance(runs, { scenarioKey: getScenario }) };
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
  },
};
