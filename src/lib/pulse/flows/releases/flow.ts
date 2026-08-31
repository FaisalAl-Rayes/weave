import type { WeaveSchema } from "@/lib/schema/types";
import type { DataContext, Flow, FlowResult } from "../../types";
import { getReleaseStatus } from "../../types";
import type { ReleaseStatus } from "../../types";

export interface ReleaseItem {
  name: string;
  namespace: string;
  snapshot: string;
  status: ReleaseStatus;
  releasePlan?: string;
  commitSha?: string;
  startTime?: string;
  completionTime?: string;
}

export interface ReleasesData {
  total: number;
  succeeded: number;
  failed: number;
  running: number;
  successRate: number;
  releases: ReleaseItem[];
}

export const releasesFlow: Flow<ReleasesData> = {
  id: "releases",
  title: "Releases",
  description: "Release CR success rate and history. Shows how many releases shipped vs failed in the selected period.",
  dependencies: ["Release"],
  widePanel: true,

  isApplicable(schema: WeaveSchema): boolean {
    return "Release" in schema.entities;
  },

  async execute(ctx: DataContext): Promise<FlowResult<ReleasesData>> {
    try {
      const releases = ctx.resources["Release"] ?? [];

      let succeeded = 0;
      let failed = 0;
      let running = 0;

      const releaseList: ReleaseItem[] = releases.map((r) => {
        const spec = r.spec as { snapshot?: string; releasePlan?: string } | undefined;
        const status = r.status as { startTime?: string; completionTime?: string } | undefined;
        const releaseStatus = getReleaseStatus(r);

        if (releaseStatus === "succeeded") succeeded++;
        else if (releaseStatus === "failed") failed++;
        else running++;

        const labels = r.metadata?.labels as Record<string, string> | undefined;
        return {
          name: r.metadata?.name ?? "unknown",
          namespace: r.metadata?.namespace ?? "unknown",
          snapshot: spec?.snapshot ?? "unknown",
          status: releaseStatus,
          releasePlan: spec?.releasePlan,
          commitSha: labels?.["pac.test.appstudio.openshift.io/sha"],
          startTime: status?.startTime,
          completionTime: status?.completionTime,
        };
      });

      releaseList.sort((a, b) => {
        const ta = a.startTime ? new Date(a.startTime).getTime() : 0;
        const tb = b.startTime ? new Date(b.startTime).getTime() : 0;
        return tb - ta;
      });

      const completed = succeeded + failed;
      return {
        status: "success",
        data: {
          total: releases.length,
          succeeded,
          failed,
          running,
          successRate: completed > 0 ? Math.round((succeeded / completed) * 100) : 0,
          releases: releaseList,
        },
      };
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
  },
};
