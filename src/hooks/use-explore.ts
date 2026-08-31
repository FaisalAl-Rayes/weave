"use client";

import useSWR from "swr";
import { apiFetcher } from "@/lib/shared";

export function useProjects() {
  return useSWR("/api/projects", apiFetcher);
}

export function useExplore(
  projectId: string,
  seedType?: string,
  seedValue?: string,
  depth?: number,
) {
  const key =
    seedType && seedValue
      ? `/api/explore?projectId=${encodeURIComponent(projectId)}&seed_type=${encodeURIComponent(seedType)}&seed_value=${encodeURIComponent(seedValue)}${depth != null ? `&depth=${depth}` : ""}`
      : null;

  return useSWR(key, apiFetcher);
}

export function useSchema(projectId: string) {
  return useSWR(
    `/api/schema?projectId=${encodeURIComponent(projectId)}`,
    apiFetcher,
  );
}

export function useSchemaRaw(projectId: string) {
  return useSWR(
    `/api/schema?projectId=${encodeURIComponent(projectId)}&raw=true`,
    (url: string) => fetch(url).then((r) => r.text()),
  );
}


export function useDatasources(projectId: string) {
  return useSWR(
    `/api/datasources?projectId=${encodeURIComponent(projectId)}`,
    apiFetcher,
    { refreshInterval: 10_000 },
  );
}
