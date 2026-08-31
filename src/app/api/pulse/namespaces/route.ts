import { NextRequest, NextResponse } from "next/server";
import { loadSchema } from "@/lib/schema/loader";
import { getDatasourceOverride, resolveEnvVars } from "@/lib/datasource-config";
import { getProvider } from "@/lib/engine/providers/registry";
import { canListByNamespace } from "@/lib/engine/providers/types";
import { apiError } from "@/lib/api-utils";

// Returns the namespaces visible to the configured Kubernetes token.
// Queries /api/v1/namespaces — the token must have list permission.
// Falls back to an empty list if the token lacks permission.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  try {
    const schema = loadSchema(projectId);

    // Find a kubernetes or kubearchive datasource to use for the namespace query
    const kubeDatasource = Object.entries(schema.datasources).find(
      ([, def]) => def.provider === "kubernetes" || def.provider === "kubearchive",
    );

    if (!kubeDatasource) {
      return NextResponse.json({ namespaces: [] });
    }

    const [datasourceName, datasourceDef] = kubeDatasource;
    const override = getDatasourceOverride(projectId, datasourceName);

    const connection = {
      url: override.url ?? resolveEnvVars(datasourceDef.connection.url),
      auth: datasourceDef.connection.auth
        ? resolveAuth(datasourceDef.connection.auth)
        : undefined,
      headers: datasourceDef.connection.headers,
    };

    // Use the kubernetes provider's underlying fetch mechanism directly
    // by calling listByNamespace with a special Namespace entity config.
    // More cleanly: just fetch /api/v1/namespaces directly with the token.
    const url = `${connection.url.replace(/\/$/, "")}/api/v1/namespaces`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (connection.auth?.type === "bearer" && connection.auth.token) {
      headers["Authorization"] = `Bearer ${connection.auth.token}`;
    }

    const res = await fetch(url, {
      headers,
      // Disable TLS verification for local clusters
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      // Permission denied or unreachable — return empty list, not an error
      return NextResponse.json({ namespaces: [] });
    }

    const data = await res.json() as {
      items?: Array<{ metadata?: { name?: string } }>;
    };

    const namespaces = (data.items ?? [])
      .map((ns) => ns.metadata?.name)
      .filter((name): name is string => !!name)
      .sort();

    return NextResponse.json({ namespaces });
  } catch (err) {
    return apiError(err);
  }
}

function resolveAuth(
  auth: Record<string, unknown>,
): Record<string, unknown> {
  const resolved = { ...auth };
  if (typeof resolved.token === "string") resolved.token = resolveEnvVars(resolved.token);
  if (typeof resolved.username === "string") resolved.username = resolveEnvVars(resolved.username);
  if (typeof resolved.password === "string") resolved.password = resolveEnvVars(resolved.password);
  return resolved;
}
