import type { WeaveSchema } from "@/lib/schema/types";
import type { DataContext, Flow, FlowResult, K8sResource, PipelineStats } from "../../types";
import { isSucceeded, isFailed } from "../../types";

export interface TestRow extends PipelineStats {
  namespace: string;
  application: string;
  component: string;
  scenario: string;
  eventType: string;
  eventTypeLabel: string;
}

export interface TestHealthData {
  total: number;
  succeeded: number;
  failed: number;
  successRate: number;
  rows: TestRow[];
}

function isTestPipelineRun(run: K8sResource): boolean {
  const labels = run.metadata?.labels as Record<string, string> | undefined;
  return labels?.["pipelines.appstudio.openshift.io/type"] === "test";
}

function getLabels(run: K8sResource): Record<string, string> {
  return (run.metadata?.labels as Record<string, string> | undefined) ?? {};
}

function eventTypeLabel(type: string): string {
  if (type === "pull_request") return "Pull Request";
  if (type === "push") return "Push";
  return type;
}

export const testHealthFlow: Flow<TestHealthData> = {
  id: "test-health",
  title: "Test Health",
  description: "Integration test pipeline success rate by namespace, application, component, and scenario.",
  dependencies: ["PipelineRun"],
  widePanel: true,

  isApplicable(schema: WeaveSchema): boolean {
    return "PipelineRun" in schema.entities;
  },

  async execute(ctx: DataContext): Promise<FlowResult<TestHealthData>> {
    try {
      const testRuns = (ctx.resources["PipelineRun"] ?? []).filter(isTestPipelineRun);

      const rowMap = new Map<string, TestRow>();
      let succeeded = 0;
      let failed = 0;

      for (const run of testRuns) {
        const labels = getLabels(run);
        const namespace = run.metadata?.namespace ?? "unknown";
        const application = labels["appstudio.openshift.io/application"] ?? "unknown";
        const component = labels["appstudio.openshift.io/component"] ?? "unknown";
        const scenario = labels["test.appstudio.openshift.io/scenario"] ?? "unknown";
        const eventType = labels["pac.test.appstudio.openshift.io/event-type"] ?? "unknown";
        const key = `${namespace}::${application}::${component}::${scenario}::${eventType}`;

        if (!rowMap.has(key)) {
          rowMap.set(key, {
            namespace,
            application,
            component,
            scenario,
            eventType,
            eventTypeLabel: eventTypeLabel(eventType),
            total: 0,
            succeeded: 0,
            failed: 0,
          });
        }

        const row = rowMap.get(key)!;
        row.total++;
        if (isSucceeded(run)) { row.succeeded++; succeeded++; }
        else if (isFailed(run)) { row.failed++; failed++; }
      }

      // Sort by most failures first
      const rows = [...rowMap.values()].sort((a, b) => b.failed - a.failed);

      const total = testRuns.length;
      const completed = succeeded + failed;

      return {
        status: "success",
        data: {
          total,
          succeeded,
          failed,
          successRate: completed > 0 ? Math.round((succeeded / completed) * 100) : 0,
          rows,
        },
      };
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
  },
};
