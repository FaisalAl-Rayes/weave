/**
 * Multi-project support.
 *
 * Schemas live in schemas/<projectId>.schema.yaml and are tracked in git.
 * Runtime state (datasource overrides) lives in .weave/<projectId>/ and is gitignored.
 * Projects are discovered by scanning the schemas/ directory — no index file needed.
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  copyFileSync,
  rmSync,
  readdirSync,
  statSync,
} from "fs";
import { join } from "path";
import { DEFAULT_PROJECT_ID } from "@/lib/shared";

export { DEFAULT_PROJECT_ID };

export interface ProjectInfo {
  id: string;
  name: string;
  createdAt: string;
}

const PROJECT_ID_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const MAX_ID_LENGTH = 64;

export function getSchemasDir(): string {
  return join(process.cwd(), "schemas");
}

function getWeaveDir(): string {
  return join(process.cwd(), ".weave");
}

export function getProjectPaths(projectId: string): {
  dir: string;
  schema: string;
  overrides: string;
} {
  validateProjectId(projectId);
  return {
    dir: join(getWeaveDir(), projectId),
    schema: join(getSchemasDir(), `${projectId}.schema.yaml`),
    overrides: join(getWeaveDir(), projectId, "overrides.json"),
  };
}

function validateProjectId(id: string): void {
  if (!id) throw new Error("Project ID cannot be empty");
  if (id.length > MAX_ID_LENGTH) {
    throw new Error(`Project ID must be at most ${MAX_ID_LENGTH} characters`);
  }
  if (!PROJECT_ID_RE.test(id)) {
    throw new Error(
      "Project ID must be lowercase alphanumeric with hyphens, no leading/trailing hyphens",
    );
  }
}

function idToName(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, " ");
}

export function listProjects(): ProjectInfo[] {
  const schemasDir = getSchemasDir();
  if (!existsSync(schemasDir)) return [];

  return readdirSync(schemasDir)
    .filter((f) => f.endsWith(".schema.yaml"))
    .map((f) => {
      const id = f.slice(0, -".schema.yaml".length);
      if (!PROJECT_ID_RE.test(id)) return null;
      const stat = statSync(join(schemasDir, f));
      return {
        id,
        name: idToName(id),
        createdAt: stat.birthtime.toISOString(),
      };
    })
    .filter((p): p is ProjectInfo => p !== null);
}

export function getProject(projectId: string): ProjectInfo | null {
  const paths = getProjectPaths(projectId);
  if (!existsSync(paths.schema)) return null;
  const stat = statSync(paths.schema);
  return { id: projectId, name: idToName(projectId), createdAt: stat.birthtime.toISOString() };
}

const MINIMAL_SCHEMA = `identifiers: {}

seeds: []

entities: {}

datasources: {}

traversal:
  max_depth: 4
  max_queue_per_level: 50
  max_total_entities: 200
  timeout_seconds: 30
  concurrency: 5
`;

export function createProject(
  id: string,
  _name: string,
  seedSchemaPath?: string,
): ProjectInfo {
  validateProjectId(id);

  const paths = getProjectPaths(id);
  if (existsSync(paths.schema)) {
    throw new Error(`Project "${id}" already exists`);
  }

  mkdirSync(getSchemasDir(), { recursive: true });

  if (seedSchemaPath && existsSync(seedSchemaPath)) {
    copyFileSync(seedSchemaPath, paths.schema);
  } else {
    writeFileSync(paths.schema, MINIMAL_SCHEMA);
  }

  return getProject(id)!;
}

export function deleteProject(id: string): void {
  validateProjectId(id);

  const paths = getProjectPaths(id);
  if (!existsSync(paths.schema)) {
    throw new Error(`Project "${id}" not found`);
  }

  rmSync(paths.schema);
  if (existsSync(paths.dir)) {
    rmSync(paths.dir, { recursive: true, force: true });
  }
}

// No-op: the default schema is tracked in schemas/ and read directly.
// Nothing to bootstrap at runtime.
export function ensureDefaultProject(): void {}
