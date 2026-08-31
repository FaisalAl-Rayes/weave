import { NextRequest, NextResponse } from "next/server";
import { loadSchema } from "@/lib/schema/loader";
import { FLOWS } from "@/lib/pulse/registry";
import { buildDataContext } from "@/lib/pulse/fetcher";
import { isSucceeded, isFailed, getReleaseStatus } from "@/lib/pulse/types";
import type {
  AnalysisParams,
  AnalyzeResponse,
  FlowResponse,
  KonfluxSummaryData,
  K8sResource,
  PipelineStats,
} from "@/lib/pulse/types";
import { apiError } from "@/lib/api-utils";

function emptyStats(): PipelineStats {
  return { total: 0, succeeded: 0, failed: 0 };
}

function getPipelineType(run: K8sResource): "build" | "test" | "managedRelease" | "other" {
  const labels = run.metadata?.labels as Record<string, string> | undefined;
  const type = labels?.["pipelines.appstudio.openshift.io/type"];
  if (type === "build") return "build";
  if (type === "test") return "test";
  if (type === "managed") return "managedRelease";
  return "other";
}

function accumulateStats(stats: PipelineStats, run: K8sResource): void {
  stats.total++;
  if (isSucceeded(run)) stats.succeeded++;
  else if (isFailed(run)) stats.failed++;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      projectId?: string;
      namespaces?: string[];
      startTime?: string;
      endTime?: string;
    };

    const { projectId, namespaces, startTime: startRaw, endTime: endRaw } = body;

    if (!projectId || !namespaces?.length || !startRaw || !endRaw) {
      return NextResponse.json(
        { error: "projectId, namespaces, startTime, and endTime are required" },
        { status: 400 },
      );
    }

    const startTime = new Date(startRaw);
    const endTime = new Date(endRaw);

    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      return NextResponse.json(
        { error: "startTime and endTime must be valid ISO date strings" },
        { status: 400 },
      );
    }

    if (startTime >= endTime) {
      return NextResponse.json(
        { error: "startTime must be before endTime" },
        { status: 400 },
      );
    }

    const schema = loadSchema(projectId);
    const applicableFlows = FLOWS.filter((f) => f.isApplicable(schema));

    if (applicableFlows.length === 0) {
      return NextResponse.json<AnalyzeResponse>({
        summary: {
          pipelineRuns: { ...emptyStats(), build: emptyStats(), test: emptyStats(), managedRelease: emptyStats() },
          releases: emptyStats(),
        },
        flows: [],
        queryLog: [],
      });
    }

    const params: AnalysisParams = { projectId, namespaces, startTime, endTime };
    const { ctx, queryLog } = await buildDataContext(params, schema, applicableFlows);

    // Execute all flows in parallel — they compute on already-fetched data
    const flowResults = await Promise.all(
      applicableFlows.map(async (flow): Promise<FlowResponse> => {
        const result = await flow.execute(ctx);
        return { flowId: flow.id, title: flow.title, widePanel: flow.widePanel, ...result } as FlowResponse;
      }),
    );

    // Build Konflux summary from the shared DataContext
    const pipelineRuns = ctx.resources["PipelineRun"] ?? [];
    const releaseResources = ctx.resources["Release"] ?? [];

    const all = emptyStats();
    const build = emptyStats();
    const test = emptyStats();
    const managedRelease = emptyStats();

    for (const run of pipelineRuns) {
      accumulateStats(all, run);
      const type = getPipelineType(run);
      if (type === "build") accumulateStats(build, run);
      else if (type === "test") accumulateStats(test, run);
      else if (type === "managedRelease") accumulateStats(managedRelease, run);
    }

    const releases = emptyStats();
    for (const r of releaseResources) {
      releases.total++;
      const status = getReleaseStatus(r);
      if (status === "succeeded") releases.succeeded++;
      else if (status === "failed") releases.failed++;
    }

    const summary: KonfluxSummaryData = {
      pipelineRuns: { ...all, build, test, managedRelease },
      releases,
    };

    return NextResponse.json<AnalyzeResponse>({ summary, flows: flowResults, queryLog });
  } catch (err) {
    return apiError(err);
  }
}
