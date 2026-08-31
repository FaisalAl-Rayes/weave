import * as k8s from "@kubernetes/client-node";
import type { DiscoveryResult, ResourceTypeInfo, DetectedCorrelation } from "./types";
import { enumerateResourceTypes } from "./enumerate";
import { sampleResources } from "./sampler";
import { runAnalyzers } from "./analyzers";
import { scoreAndRank } from "./scorer";
import { proposeSchema } from "./proposer";
import { runPlugins } from "./plugins";

export type { DiscoveryResult, ResourceTypeInfo };

/**
 * Run the full discovery pipeline:
 * 1. Connect to Kubernetes cluster
 * 2. Enumerate resource types
 * 3. Sample instances
 * 4. Run domain plugins (deterministic, high-confidence)
 * 5. Run generic analyzers (for unclaimed resource types)
 * 6. Score and rank
 * 7. Propose schema (plugin results + generic results merged)
 */
export async function runDiscovery(
  url: string,
  token: string,
  namespace: string,
  datasourceName: string,
  selectedKinds?: string[],
  samplesPerType = 20,
  useGenericAnalyzers = false,
): Promise<DiscoveryResult> {
  const kc = buildKubeConfig(url, token);

  // Step 1: Enumerate resource types (cluster-scoped)
  const allTypes = await enumerateResourceTypes(kc);

  // Step 2: Filter to selected kinds
  const resourceTypes = selectedKinds
    ? allTypes.filter((t) => selectedKinds.includes(t.kind))
    : allTypes;

  // Step 3: Sample instances
  const samples = await sampleResources(kc, namespace, resourceTypes, samplesPerType);

  // Step 4: Run domain plugins
  const pluginResult = runPlugins(allTypes, samples);

  // Step 5: Run generic analyzers (only if enabled)
  let genericCorrelations: DetectedCorrelation[] = [];
  if (useGenericAnalyzers) {
    const { edgeCorrelations, seedCorrelations } = runAnalyzers(samples);
    genericCorrelations = [...scoreAndRank(edgeCorrelations), ...seedCorrelations];
  }

  // Step 7: Propose schema (plugin fields take priority over generic on conflict)
  const proposedSchema = proposeSchema(
    genericCorrelations,
    samples,
    namespace,
    datasourceName,
    pluginResult.proposal,
  );

  return {
    namespace,
    resourceTypes: allTypes,
    samples,
    correlations: genericCorrelations,
    proposedSchema,
    timestamp: new Date().toISOString(),
    activePlugins: pluginResult.activePlugins,
  };
}

/**
 * Enumerate resource types (cluster-scoped, no namespace needed).
 */
export async function enumerateOnly(
  url: string,
  token: string,
): Promise<ResourceTypeInfo[]> {
  const kc = buildKubeConfig(url, token);
  return enumerateResourceTypes(kc);
}

/**
 * List all namespaces the service account can see.
 */
export async function listNamespaces(
  url: string,
  token: string,
): Promise<string[]> {
  const kc = buildKubeConfig(url, token);
  const api = kc.makeApiClient(k8s.CoreV1Api);
  try {
    const res = await api.listNamespace();
    return (res.items ?? [])
      .map((ns) => ns.metadata?.name ?? "")
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  }
}

function buildKubeConfig(url: string, token: string): k8s.KubeConfig {
  const kc = new k8s.KubeConfig();
  kc.loadFromClusterAndUser(
    { name: "discovery", server: url, skipTLSVerify: true },
    { name: "discovery-user", token },
  );
  return kc;
}
