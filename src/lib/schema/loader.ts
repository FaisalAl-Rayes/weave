import { readFileSync, statSync } from "fs";
import { parseSchemaYaml } from "./parser";
import type { WeaveSchema } from "./types";
import { getProjectPaths, ensureDefaultProject } from "@/lib/projects";

interface CacheEntry {
  schema: WeaveSchema | null;
  raw: string;
  mtime: number;
}

const cache = new Map<string, CacheEntry>();

function getCurrentMtime(projectId: string): number {
  try {
    const { schema: schemaPath } = getProjectPaths(projectId);
    return statSync(schemaPath).mtime.getTime();
  } catch {
    return 0;
  }
}

function getOrRefreshCache(projectId: string): CacheEntry {
  const mtime = getCurrentMtime(projectId);
  const cached = cache.get(projectId);
  if (cached && cached.mtime === mtime) return cached;

  const { schema: schemaPath } = getProjectPaths(projectId);
  const raw = readFileSync(schemaPath, "utf-8");
  const entry: CacheEntry = { schema: null, raw, mtime };
  cache.set(projectId, entry);
  return entry;
}

export function loadSchema(projectId: string): WeaveSchema {
  ensureDefaultProject();
  const entry = getOrRefreshCache(projectId);
  if (!entry.schema) {
    entry.schema = parseSchemaYaml(entry.raw);
  }
  return entry.schema;
}

export function loadSchemaRaw(projectId: string): string {
  ensureDefaultProject();
  return getOrRefreshCache(projectId).raw;
}
