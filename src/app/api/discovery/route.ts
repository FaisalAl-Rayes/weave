import { NextRequest, NextResponse } from "next/server";
import { runDiscovery, enumerateOnly, listNamespaces } from "@/lib/discovery";
import { loadSchema } from "@/lib/schema/loader";
import { getDatasourceOverride, resolveEnvVars } from "@/lib/datasource-config";
import { apiError } from "@/lib/api-utils";

function resolveK8sConnection(
  projectId: string,
  datasourceName: string,
): { url: string; token: string } {
  const schema = loadSchema(projectId);
  const def = schema.datasources[datasourceName];
  if (!def) throw new Error(`Datasource "${datasourceName}" not found`);
  if (def.provider !== "kubernetes") throw new Error(`"${datasourceName}" is not a Kubernetes provider`);

  const override = getDatasourceOverride(projectId, datasourceName);
  const url = override.url ?? resolveEnvVars(def.connection.url);
  const token =
    (override.auth?.token as string) ??
    (def.connection.auth?.token ? resolveEnvVars(def.connection.auth.token as string) : "");

  if (!url || url.includes("${")) throw new Error(`Unresolved URL: ${url}`);
  return { url, token };
}

/**
 * GET /api/discovery?projectId=...&datasource=...&action=enumerate|namespaces
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const projectId = searchParams.get("projectId");
  const datasourceName = searchParams.get("datasource");
  const action = searchParams.get("action") ?? "enumerate";

  if (!projectId || !datasourceName) {
    return NextResponse.json(
      { error: "projectId and datasource are required" },
      { status: 400 },
    );
  }

  try {
    const { url, token } = resolveK8sConnection(projectId, datasourceName);

    if (action === "namespaces") {
      const namespaces = await listNamespaces(url, token);
      return NextResponse.json({ namespaces });
    }

    const resourceTypes = await enumerateOnly(url, token);
    return NextResponse.json({ resourceTypes });
  } catch (err) {
    return apiError(err);
  }
}

/**
 * POST /api/discovery
 * Body: { projectId, datasource, namespaces, selectedKinds?, samplesPerType? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, datasource, namespaces, selectedKinds, samplesPerType, useGenericAnalyzers } = body;

    if (!projectId || !datasource || !namespaces || !Array.isArray(namespaces) || namespaces.length === 0) {
      return NextResponse.json(
        { error: "projectId, datasource, and namespaces are required" },
        { status: 400 },
      );
    }

    const { url, token } = resolveK8sConnection(projectId, datasource);

    const result = await runDiscovery(
      url, token, namespaces[0], datasource, selectedKinds, samplesPerType ?? 20, useGenericAnalyzers ?? false,
    );

    return NextResponse.json({
      namespace: namespaces[0],
      resourceTypes: result.resourceTypes,
      correlations: result.correlations,
      proposedSchema: result.proposedSchema,
      timestamp: result.timestamp,
      activePlugins: result.activePlugins ?? [],
      stats: {
        typesAnalyzed: result.samples.length,
        totalInstances: result.samples.reduce((sum, s) => sum + s.instances.length, 0),
        correlationsFound: result.correlations.length,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
