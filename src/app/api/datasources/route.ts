import { NextRequest, NextResponse } from "next/server";
import { loadSchema } from "@/lib/schema/loader";
import {
  getAllDatasourceOverrides,
  getDatasourceOverride,
  setDatasourceOverride,
  resolveEnvVars,
  type DatasourceOverride,
} from "@/lib/datasource-config";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json(
      { error: "projectId is required" },
      { status: 400 },
    );
  }

  const schema = loadSchema(projectId);
  const overrides = getAllDatasourceOverrides(projectId);

  const datasources = Object.entries(schema.datasources).map(
    ([name, def]) => {
      const override = overrides[name] ?? {};
      const resolvedUrl = resolveEnvVars(def.connection.url);
      const effectiveUrl = override.url ?? resolvedUrl;
      const isPlaceholder = effectiveUrl.includes("${");

      return {
        name,
        provider: def.provider,
        types: def.types,
        serves: def.serves ?? [],
        enriches: Object.keys(def.enriches ?? {}),
        connection: {
          schemaUrl: def.connection.url,
          resolvedUrl: isPlaceholder ? null : effectiveUrl,
          effectiveUrl: isPlaceholder ? null : effectiveUrl,
          authType: override.auth?.type ?? def.connection.auth?.type ?? "none",
          hasOverride: !!overrides[name],
          overrideUrl: override.url ?? null,
          overrideAuth: override.auth ?? null,
        },
      };
    },
  );

  return NextResponse.json({ datasources });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { projectId, name, url, auth } = body;

  if (!projectId || !name) {
    return NextResponse.json(
      { error: "projectId and name are required" },
      { status: 400 },
    );
  }

  const schema = loadSchema(projectId);
  if (!(name in schema.datasources)) {
    return NextResponse.json(
      { error: `Datasource '${name}' not found in schema` },
      { status: 404 },
    );
  }

  const current = getDatasourceOverride(projectId, name);
  const updated: DatasourceOverride = {
    url: url ?? current.url,
    auth: auth ?? current.auth,
  };

  setDatasourceOverride(projectId, name, updated);

  return NextResponse.json({ ok: true, datasource: { name, ...updated } });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { projectId, name, url: inlineUrl, auth: inlineAuth } = body;

  if (!projectId || !name) {
    return NextResponse.json(
      { error: "projectId and name are required" },
      { status: 400 },
    );
  }

  const schema = loadSchema(projectId);
  const def = schema.datasources[name];
  if (!def) {
    return NextResponse.json(
      { error: `Datasource '${name}' not found` },
      { status: 404 },
    );
  }

  const savedOverride = getDatasourceOverride(projectId, name);
  const override = {
    ...savedOverride,
    url: inlineUrl ?? savedOverride.url,
    auth: inlineAuth ?? savedOverride.auth,
  };

  const effectiveUrl = override.url ?? resolveEnvVars(def.connection.url);
  if (effectiveUrl.includes("${")) {
    return NextResponse.json({
      name,
      healthy: false,
      message: `URL contains unresolved variables: ${effectiveUrl}`,
    });
  }

  try {
    if (def.provider === "splunk") {
      const headers: Record<string, string> = {};
      const auth = override.auth ?? def.connection.auth;
      if (auth?.type === "basic") {
        const username = resolveEnvVars(String(auth.username ?? "admin"));
        const password = resolveEnvVars(String(auth.password ?? ""));
        headers["Authorization"] = `Basic ${btoa(`${username}:${password}`)}`;
      } else if (auth?.type === "bearer" && auth.token) {
        headers["Authorization"] = `Bearer ${resolveEnvVars(String(auth.token))}`;
      }
      const res = await fetch(`${effectiveUrl}/services/server/info?output_mode=json`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      return NextResponse.json({
        name,
        healthy: res.ok,
        message: res.ok ? `Connected (${res.status})` : `Splunk returned ${res.status}`,
      });
    }

    if (def.provider === "prometheus") {
      const res = await fetch(`${effectiveUrl}/-/ready`, { signal: AbortSignal.timeout(5000) });
      return NextResponse.json({
        name,
        healthy: res.ok,
        message: res.ok ? `Connected (${res.status})` : `Prometheus returned ${res.status}`,
      });
    }

    if (def.provider === "kubearchive") {
      const headers: Record<string, string> = {};
      const auth = override.auth ?? def.connection.auth;
      if (auth?.type === "bearer" && auth.token) {
        headers["Authorization"] = `Bearer ${resolveEnvVars(String(auth.token))}`;
      }
      const res = await fetch(`${effectiveUrl}/api/v1/namespaces/kubearchive/pods`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      return NextResponse.json({
        name,
        healthy: res.ok,
        message: res.ok ? `Connected (${res.status})` : `KubeArchive returned ${res.status}`,
      });
    }

    if (def.provider === "kubernetes") {
      const res = await fetch(`${effectiveUrl}/healthz`, { signal: AbortSignal.timeout(5000) });
      return NextResponse.json({
        name,
        healthy: res.ok,
        message: res.ok ? `Connected (${res.status})` : `Kubernetes returned ${res.status}`,
      });
    }

    const res = await fetch(effectiveUrl, { signal: AbortSignal.timeout(5000) });
    return NextResponse.json({
      name,
      healthy: res.ok || res.status === 401 || res.status === 403,
      message: `Endpoint responded (${res.status})`,
    });
  } catch (err) {
    return NextResponse.json({
      name,
      healthy: false,
      message: err instanceof Error ? err.message : "Connection failed",
    });
  }
}
