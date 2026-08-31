import { NextRequest, NextResponse } from "next/server";
import { listProjects, createProject, deleteProject } from "@/lib/projects";
import { join } from "path";
import { apiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const projects = listProjects();
    return NextResponse.json({ projects });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, template } = body;

    if (!id || !name) {
      return NextResponse.json(
        { error: "id and name are required" },
        { status: 400 },
      );
    }

    // Validate template to prevent path traversal
    if (template && !/^[a-zA-Z0-9_-]+$/.test(template)) {
      return NextResponse.json(
        { error: "Invalid template name. Only alphanumeric characters, hyphens, and underscores are allowed." },
        { status: 400 },
      );
    }

    // If a template is specified, use its schema as the seed
    const seedSchemaPath = template
      ? join(process.cwd(), "schemas", `${template}.schema.yaml`)
      : undefined;

    const project = createProject(id, name, seedSchemaPath);
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg.includes("already exists") ? 409 : 400;
    return apiError(err, status);
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "id is required" },
      { status: 400 },
    );
  }

  try {
    deleteProject(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err, 404);
  }
}
