import type { WeaveSchema } from "@/lib/schema/types";
import type { DataContext, Flow, FlowResult, K8sResource, PipelineStats } from "../../types";
import { isSucceeded, isFailed } from "../../types";

export interface BuildRow extends PipelineStats {
  namespace: string;
  application: string;
  component: string;
  eventType: string;
  eventTypeLabel: string;
}

export interface BuildHealthData {
  total: number;
  succeeded: number;
  failed: number;
  successRate: number;
  rows: BuildRow[];
}

function isBuildPipelineRun(run: K8sResource): boolean {
  const labels = run.metadata?.labels as Record<string, string> | undefined;
  return labels?.["pipelines.appstudio.openshift.io/type"] === "build";
}

function getLabels(run: K8sResource): Record<string, string> {
  return (run.metadata?.labels as Record<string, string> | undefined) ?? {};
}

function eventTypeLabel(type: string): string {
  if (type === "pull_request") return "Pull Request";
  if (type === "push") return "Push";
  return type;
}

export const buildHealthFlow: Flow<BuildHealthData> = {
  id: "build-health",
  title: "Build Health",
  description: "Build pipeline success rate by namespace, application, component, and event type.",
  dependencies: ["PipelineRun"],
  widePanel: true,

  isApplicable(schema: WeaveSchema): boolean {
    return "PipelineRun" in schema.entities;
  },

  async execute(ctx: DataContext): Promise<FlowResult<BuildHealthData>> {
    try {
      const buildRuns = (ctx.resources["PipelineRun"] ?? []).filter(isBuildPipelineRun);

      const rowMap = new Map<string, BuildRow>();
      let succeeded = 0;
      let failed = 0;

      for (const run of buildRuns) {
        const labels = getLabels(run);
        const namespace = run.metadata?.namespace ?? "unknown";
        const application = labels["appstudio.openshift.io/application"] ?? "unknown";
        const component = labels["appstudio.openshift.io/component"] ?? "unknown";
        const eventType = labels["pipelinesascode.tekton.dev/event-type"] ?? "other";
        const key = `${namespace}::${application}::${component}::${eventType}`;

        if (!rowMap.has(key)) {
          rowMap.set(key, {
            namespace,
            application,
            component,
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

      const rows = [...rowMap.values()].sort((a, b) =>
        a.namespace.localeCompare(b.namespace) ||
        a.application.localeCompare(b.application) ||
        a.component.localeCompare(b.component) ||
        a.eventType.localeCompare(b.eventType),
      );

      const total = buildRuns.length;
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
