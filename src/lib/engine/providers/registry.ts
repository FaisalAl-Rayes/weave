import type { BaseProvider } from "./types";
import { RestApiProvider } from "./rest-api";
import { SplunkProvider } from "./splunk";
import { PrometheusProvider } from "./prometheus";
import { TempoProvider } from "./tempo";
import { KubernetesProvider } from "./kubernetes";
import { KubeArchiveProvider } from "./kubearchive";

const providers: Record<string, BaseProvider> = {
  rest: new RestApiProvider(),
  splunk: new SplunkProvider(),
  prometheus: new PrometheusProvider(),
  tempo: new TempoProvider(),
  kubernetes: new KubernetesProvider(),
  kubearchive: new KubeArchiveProvider(),
};

export function getProvider(type: string): BaseProvider {
  const provider = providers[type];
  if (!provider) {
    throw new Error(
      `Unknown provider type: ${type}. Available: ${Object.keys(providers).join(", ")}`,
    );
  }
  return provider;
}
