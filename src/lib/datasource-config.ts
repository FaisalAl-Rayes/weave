/**
 * Runtime datasource connection overrides (per-project).
 * Persisted to projects/<id>/overrides.json (debounced async writes).
 * Uses globalThis for in-process caching across Next.js module reloads.
 */

import { readFileSync, writeFile, mkdir } from "fs";
import { getProjectPaths } from "@/lib/projects";

// Optional per-datasource connection overrides — URL and auth only.
// These take precedence over the schema connection config.
export interface DatasourceOverride {
  url?: string;
  auth?: {
    type: string;
    username?: string;
    password?: string;
    token?: string;
    [key: string]: unknown;
  };
}

function globalKey(projectId: string): string {
  return `__weave_overrides_${projectId}__`;
}

function timerKey(projectId: string): string {
  return `__weave_save_timer_${projectId}__`;
}

function loadFromFile(projectId: string): Record<string, DatasourceOverride> {
  try {
    const { overrides } = getProjectPaths(projectId);
    return JSON.parse(readFileSync(overrides, "utf-8"));
  } catch {
    return {};
  }
}

function scheduleSave(
  projectId: string,
  overrides: Record<string, DatasourceOverride>,
): void {
  const g = globalThis as Record<string, unknown>;
  const tk = timerKey(projectId);
  if (g[tk]) clearTimeout(g[tk] as ReturnType<typeof setTimeout>);
  g[tk] = setTimeout(() => {
    const { dir, overrides: filePath } = getProjectPaths(projectId);
    mkdir(dir, { recursive: true }, () => {
      writeFile(filePath, JSON.stringify(overrides, null, 2), () => {});
    });
  }, 500);
}

function getStore(projectId: string): Record<string, DatasourceOverride> {
  const g = globalThis as Record<string, unknown>;
  const gk = globalKey(projectId);
  if (!g[gk]) g[gk] = loadFromFile(projectId);
  return g[gk] as Record<string, DatasourceOverride>;
}

export function getDatasourceOverride(
  projectId: string,
  name: string,
): DatasourceOverride {
  return getStore(projectId)[name] ?? {};
}

export function setDatasourceOverride(
  projectId: string,
  name: string,
  override: DatasourceOverride,
): void {
  const store = getStore(projectId);
  store[name] = override;
  scheduleSave(projectId, store);
}

export function getAllDatasourceOverrides(
  projectId: string,
): Record<string, DatasourceOverride> {
  return { ...getStore(projectId) };
}

export function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)}/g, (match, varName) => {
    return process.env[varName.trim()] ?? match;
  });
}
