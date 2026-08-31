import { NextRequest, NextResponse } from "next/server";
import { loadSchema } from "@/lib/schema/loader";
import { runEnrichment } from "@/lib/engine";
import { apiError } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, datasource, queryName, entityType, identifiers, display, timeRange, pagination } = body;

    if (!projectId || !datasource || !queryName || !entityType || !identifiers) {
      return NextResponse.json(
        { error: "projectId, datasource, queryName, entityType, and identifiers are required" },
        { status: 400 },
      );
    }

    const schema = loadSchema(projectId);

    const enrichResult = await runEnrichment(
      projectId,
      schema,
      datasource,
      queryName,
      entityType,
      identifiers,
      display ?? {},
      timeRange,
      pagination,
    );

    return NextResponse.json({
      result: enrichResult.raw,
      pagination: enrichResult.pagination,
    });
  } catch (err) {
    return apiError(err);
  }
}
