import { NextRequest, NextResponse } from "next/server";
import { loadSchema, loadSchemaRaw } from "@/lib/schema/loader";
import { saveSchema } from "@/lib/schema/writer";
import type { WeaveSchema } from "@/lib/schema/types";
import { apiError } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const projectId = searchParams.get("projectId");
  const raw = searchParams.get("raw") === "true";

  if (!projectId) {
    return NextResponse.json(
      { error: "projectId is required" },
      { status: 400 },
    );
  }

  try {
    if (raw) {
      return new NextResponse(loadSchemaRaw(projectId), {
        headers: { "Content-Type": "text/yaml" },
      });
    }

    return NextResponse.json(loadSchema(projectId));
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, schema } = body as { projectId: string; schema: WeaveSchema };

    if (!projectId || !schema) {
      return NextResponse.json(
        { error: "projectId and schema are required" },
        { status: 400 },
      );
    }

    saveSchema(projectId, schema);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err, 400);
  }
}
