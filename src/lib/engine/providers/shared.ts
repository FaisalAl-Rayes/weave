import type { ConnectionConfig } from "./types";
import { extractValue } from "@/lib/schema/jsonpath";

export function substituteParams(
  template: string,
  params: Record<string, string>,
): string {
  return template.replace(/\$\{([^}]+)}/g, (_, key) => params[key.trim()] ?? "");
}

export function buildHeaders(
  connection: ConnectionConfig,
  contentType = "application/json",
): Record<string, string> {
  const headers: Record<string, string> = {
    ...(contentType ? { "Content-Type": contentType } : {}),
    ...(connection.headers ?? {}),
  };

  const auth = connection.auth;
  if (!auth || auth.type === "none") return headers;

  switch (auth.type) {
    case "bearer":
      if (auth.token) headers["Authorization"] = `Bearer ${auth.token}`;
      break;
    case "basic": {
      const username = auth.username ?? "admin";
      const password = auth.password ?? "";
      headers["Authorization"] = `Basic ${btoa(`${username}:${password}`)}`;
      break;
    }
    case "apikey":
      if (auth.headers) Object.assign(headers, auth.headers);
      break;
  }

  return headers;
}

export function extractEntities(
  raw: unknown,
  listPath?: string,
): unknown[] {
  if (listPath) {
    const extracted = extractValue(raw, listPath);
    return Array.isArray(extracted) ? extracted : extracted ? [extracted] : [];
  }
  if (Array.isArray(raw)) return raw;
  return raw ? [raw] : [];
}
