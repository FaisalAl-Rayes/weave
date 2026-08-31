import { NextRequest, NextResponse } from "next/server";
import { loadSchema } from "@/lib/schema/loader";
import { traverse } from "@/lib/engine";
import { apiError } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const projectId = searchParams.get("projectId");
  const seedType = searchParams.get("seed_type");
  const seedValue = searchParams.get("seed_value");
  const depthParam = searchParams.get("depth");

  if (!projectId || !seedType || !seedValue) {
    return NextResponse.json(
      { error: "projectId, seed_type, and seed_value are required" },
      { status: 400 },
    );
  }

  try {
    const schema = loadSchema(projectId);

    let options: { depth?: number } = {};
    if (depthParam != null) {
      const parsed = parseInt(depthParam, 10);
      if (isNaN(parsed) || parsed <= 0) {
        return NextResponse.json({ error: "depth must be a positive integer" }, { status: 400 });
      }
      options = { depth: parsed }; // traverse() caps at max_depth
    }

    const graph = await traverse(projectId, schema, seedType, seedValue, options);
    return NextResponse.json(graph);
  } catch (err) {
    return apiError(err);
  }
}
