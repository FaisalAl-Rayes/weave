import { NextRequest, NextResponse } from "next/server";
import { loadSchema } from "@/lib/schema/loader";
import { runContextQuery } from "@/lib/engine";
import { apiError } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, queryName, start, end } = body;

    if (!projectId || !queryName || !start || !end) {
      return NextResponse.json(
        { error: "projectId, queryName, start, and end are required" },
        { status: 400 },
      );
    }

    const schema = loadSchema(projectId);
    const result = await runContextQuery(projectId, schema, queryName, start, end);

    return NextResponse.json({ result });
  } catch (err) {
    return apiError(err);
  }
}
