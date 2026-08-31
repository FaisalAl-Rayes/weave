import YAML from "yaml";
import type { DetectedCorrelation, ResourceSample, ResourceTypeInfo } from "./types";
import type { PluginProposal, PluginSourcedPath } from "./plugins/types";

interface ProposedIdentifier {
  name: string;
  label: string;
}

interface ProposedSourcedPath {
  path: string;
  source?: string;
}

interface ProposedReference {
  field: string;
  points_to: string;
  as: string;
  source?: string;
}

interface ProposedEntity {
  label: string;
  description?: string;
  format: string;
  identifiers: Record<string, ProposedSourcedPath>;
  references: ProposedReference[];
  display: Record<string, ProposedSourcedPath>;
}

interface ProposedServes {
  query: Record<string, unknown>;
  response_mapping: { list_path?: string };
}

/** A single serves entry in the output array */
type ServesEntry = ProposedServes;

/**
 * Convert scored correlations + resource samples into a Weave schema YAML.
 */
export function proposeSchema(
  correlations: DetectedCorrelation[],
  samples: ResourceSample[],
  namespace: string,
  datasourceName = "discovered-kubernetes",
  pluginProposal?: PluginProposal,
): string {
  const identifiers: Record<string, ProposedIdentifier> = {};
  const entities: Record<string, ProposedEntity> = {};
  const serves: Record<string, ServesEntry[]> = {};

  // Start with plugin-provided identifiers and entities (source tags preserved)
  if (pluginProposal) {
    for (const [name, def] of Object.entries(pluginProposal.identifiers)) {
      identifiers[name] = { name, label: def.label };
    }
    for (const [kind, entity] of Object.entries(pluginProposal.entities)) {
      const sample = samples.find((s) => s.type.kind === kind);
      entities[kind] = {
        label: entity.label,
        description: sample ? sample.type.apiVersion : undefined,
        format: entity.format ?? "kubernetes_resource",
        identifiers: toSourcedPaths(entity.identifiers),
        references: entity.references.map((r) => ({
          field: r.field,
          points_to: r.points_to,
          as: r.as,
          source: r.source,
        })),
        display: toSourcedPaths(entity.display),
      };
    }
  }

  // Collect all kinds involved in correlations
  const involvedKinds = new Set<string>();
  for (const corr of correlations) {
    involvedKinds.add(corr.source);
    involvedKinds.add(corr.target);
  }

  // Build identifier registry from correlations
  for (const corr of correlations) {
    if (corr.suggestedIdentifier) {
      const id = corr.suggestedIdentifier;
      if (!identifiers[id.name]) {
        identifiers[id.name] = { name: id.name, label: id.label };
      }
    }
  }

  // Identify seed-label identifiers per kind (high-cardinality labels)
  const seedLabelIdentsMap = new Map<string, Set<string>>();
  for (const corr of correlations) {
    if (corr.source === corr.target && corr.suggestedIdentifier) {
      const set = seedLabelIdentsMap.get(corr.source) ?? new Set();
      set.add(corr.suggestedIdentifier.name);
      seedLabelIdentsMap.set(corr.source, set);
    }
  }

  // Build a map of which identifiers each kind is referenced by (incoming)
  const incomingIdentsMap = new Map<string, Set<string>>();
  for (const corr of correlations) {
    if (corr.suggestedReference) {
      const set = incomingIdentsMap.get(corr.suggestedReference.points_to) ?? new Set();
      set.add(corr.suggestedReference.as);
      incomingIdentsMap.set(corr.suggestedReference.points_to, set);
    }
  }

  // Build/extend entities from generic correlations
  // Plugin-defined entities get generic fields merged in (plugin fields take priority)
  for (const kind of involvedKinds) {
    const sample = samples.find((s) => s.type.kind === kind);
    if (!sample) continue;

    const existing = entities[kind];

    // Collect generic identifiers
    const genericIdentifiers: Record<string, ProposedSourcedPath> = {};
    const nameIdent = `${kind.toLowerCase()}_name`;
    if (!identifiers[nameIdent]) {
      identifiers[nameIdent] = { name: nameIdent, label: `${humanizeKind(kind)} Name` };
    }
    if (!existing?.identifiers[nameIdent]) {
      genericIdentifiers[nameIdent] = { path: "metadata.name", source: "generic" };
    }

    for (const corr of correlations) {
      if (!corr.suggestedIdentifier) continue;

      if (corr.source === kind && !corr.suggestedIdentifier.sourcePath.includes("[*]")) {
        const idName = corr.suggestedIdentifier.name;
        const idPath = corr.suggestedIdentifier.sourcePath;
        if (idPath === "metadata.name" && idName !== nameIdent) continue;
        // Skip if plugin already defined this identifier
        if (existing?.identifiers[idName]) continue;

        genericIdentifiers[idName] = { path: idPath, source: "generic" };
      }
      if (corr.target === kind && !corr.suggestedIdentifier.targetPath.includes("[*]")) {
        const idName = corr.suggestedIdentifier.name;
        if (existing?.identifiers[idName]) continue;

        genericIdentifiers[idName] = {
          path: corr.suggestedIdentifier.targetPath,
          source: "generic",
        };
      }
    }

    // Collect generic references (skip those already defined by plugins)
    const genericReferences: ProposedReference[] = [];
    const existingRefKeys = new Set(
      (existing?.references ?? []).map((r) => `${r.field}→${r.points_to}`),
    );
    for (const corr of correlations) {
      if (corr.source !== kind) continue;
      if (!corr.suggestedReference) continue;

      const refKey = `${corr.suggestedReference.field}→${corr.suggestedReference.points_to}`;
      if (existingRefKeys.has(refKey)) continue;
      if (genericReferences.some((r) => `${r.field}→${r.points_to}` === refKey)) continue;

      genericReferences.push({ ...corr.suggestedReference, source: "generic" });
    }

    // Generate generic display fields from sample instances
    const genericDisplay = generateDisplayFields(sample);
    // Remove display fields already defined by plugins
    if (existing?.display) {
      for (const key of Object.keys(existing.display)) {
        delete genericDisplay[key];
      }
    }

    if (existing) {
      // Merge generic findings into plugin-defined entity
      if (!existing.description) {
        existing.description = sample.type.apiVersion;
      }
      Object.assign(existing.identifiers, genericIdentifiers);
      existing.references.push(...genericReferences);
      Object.assign(existing.display, genericDisplay);
    } else {
      entities[kind] = {
        label: humanizeKind(kind),
        description: `${sample.type.apiVersion}`,
        format: "kubernetes_resource",
        identifiers: genericIdentifiers,
        references: genericReferences,
        display: genericDisplay,
      };
    }

  }

  // Generate serves for ALL entities (after merge is complete)
  for (const [kind, entity] of Object.entries(entities)) {
    const sample = samples.find((s) => s.type.kind === kind);
    if (!sample) continue;

    const entries: ServesEntry[] = serves[kind] ?? [];

    // 1. Plugin-declared label selectors → cluster-scoped queries
    const pluginServes = pluginProposal?.serves?.[kind] ?? [];
    for (const ps of pluginServes) {
      const type = sample.type;
      const groupPath = type.group ? `apis/${type.group}/${type.version}` : `api/${type.version}`;
      entries.push({
        query: {
          endpoint: `/${groupPath}/${type.resource}`,
          method: "GET",
          params: { labelSelector: ps.labelSelector },
        },
        response_mapping: { list_path: "items" },
      });
    }

    // 2. Generic label selector serves from seed-label identifiers
    const queryableIdents = new Set(incomingIdentsMap.get(kind) ?? []);
    for (const seedIdent of seedLabelIdentsMap.get(kind) ?? []) {
      queryableIdents.add(seedIdent);
    }
    for (const seed of pluginProposal?.seeds ?? []) {
      if (entity.identifiers[seed.identifier]) {
        queryableIdents.add(seed.identifier);
      }
    }
    // Only generate generic serves if no plugin serves cover this entity
    if (entries.length === 0) {
      const genericEntries = generateServes(sample, entity.identifiers, namespace, queryableIdents);
      entries.push(...genericEntries);
    }

    // 3. Always add get-by-name as a fallback
    const nameIdent = `${kind.toLowerCase()}_name`;
    const hasGetByName = entries.some((e) => {
      const ep = (e.query as Record<string, unknown>).endpoint as string;
      return ep.includes(`\${${nameIdent}}`);
    });
    if (!hasGetByName && entity.identifiers[nameIdent]) {
      const type = sample.type;
      const groupPath = type.group ? `apis/${type.group}/${type.version}` : `api/${type.version}`;
      entries.push({
        query: {
          endpoint: `/${groupPath}/namespaces/${namespace}/${type.resource}/\${${nameIdent}}`,
          method: "GET",
        },
        response_mapping: {},
      });
    }

    serves[kind] = entries;
  }

  // Compute edge direction stats for seed ranking
  const outgoing = new Map<string, number>();
  const incoming = new Map<string, number>();
  for (const corr of correlations) {
    if (corr.source === corr.target) continue;
    outgoing.set(corr.source, (outgoing.get(corr.source) ?? 0) + 1);
    incoming.set(corr.target, (incoming.get(corr.target) ?? 0) + 1);
  }

  // Determine seeds
  const seeds: { identifier: string; primary?: boolean }[] = [];
  const addedSeedIdents = new Set<string>();

  // 0. Plugin seeds first (highest priority — deterministic)
  if (pluginProposal) {
    for (const seed of pluginProposal.seeds) {
      if (addedSeedIdents.has(seed.identifier)) continue;
      addedSeedIdents.add(seed.identifier);
      seeds.push({ ...seed });
    }
  }

  // 1. Seed-label identifiers (high-cardinality labels like commit SHA)
  //    Boosted by root-ness of their entity (more outgoing = better seed host)
  const seedLabelCorrs = correlations
    .filter((c) => c.source === c.target && c.suggestedIdentifier && c.confidence >= 0.5)
    .map((c) => {
      const out = outgoing.get(c.source) ?? 0;
      const inc = incoming.get(c.source) ?? 0;
      const rootBonus = Math.max(0, out - inc) * 0.15;
      return { ...c, seedScore: c.confidence + rootBonus };
    })
    .sort((a, b) => b.seedScore - a.seedScore);

  for (const corr of seedLabelCorrs.slice(0, 3)) {
    const identName = corr.suggestedIdentifier!.name;
    if (addedSeedIdents.has(identName)) continue;
    addedSeedIdents.add(identName);
    seeds.push({
      identifier: identName,
      primary: seeds.length === 0 ? true : undefined,
    });
  }

  // 2. Root entity name identifiers

  const rootKinds = Array.from(involvedKinds)
    .map((kind) => ({
      kind,
      score: (outgoing.get(kind) ?? 0) - (incoming.get(kind) ?? 0),
      outDegree: outgoing.get(kind) ?? 0,
      inDegree: incoming.get(kind) ?? 0,
    }))
    .sort((a, b) => b.score - a.score || b.outDegree - a.outDegree || a.inDegree - b.inDegree || a.kind.localeCompare(b.kind));

  // Track seed labels to avoid duplicate-looking seeds (e.g. "PipelineRun Name" appearing twice)
  const addedSeedLabels = new Set<string>(
    seeds.map((s) => identifiers[s.identifier]?.label ?? s.identifier),
  );

  for (const root of rootKinds.slice(0, 3)) {
    if (root.score <= 0 && seeds.length > 0) break;
    const identName = `${root.kind.toLowerCase()}_name`;
    if (addedSeedIdents.has(identName)) continue;
    const label = identifiers[identName]?.label ?? identName;
    if (addedSeedLabels.has(label)) continue;
    addedSeedIdents.add(identName);
    addedSeedLabels.add(label);
    seeds.push({
      identifier: identName,
      primary: seeds.length === 1 && seedLabelCorrs.length === 0 ? true : undefined,
    });
  }

  // Build the schema object
  const schema = {
    identifiers: Object.fromEntries(
      Object.entries(identifiers).map(([name, def]) => [
        name,
        { label: def.label },
      ]),
    ),
    seeds,
    entities,
    datasources: {
      [datasourceName]: {
        provider: "kubernetes",
        types: ["json"],
        connection: {
          url: "${KUBERNETES_API_URL}",
          auth: { type: "bearer", token: "${KUBERNETES_TOKEN}" },
        },
        serves,
      },
    },
    traversal: {
      max_depth: 4,
      max_entities_per_hop: 50,
      max_total_entities: 200,
      timeout_seconds: 30,
      concurrency: 5,
    },
  };

  return YAML.stringify(schema, {
    lineWidth: 120,
    defaultKeyType: "PLAIN",
    defaultStringType: "PLAIN",
  });
}

/**
 * Generate display fields from a resource sample.
 * Picks status conditions, timestamps, and a few interesting spec fields.
 */
function generateDisplayFields(
  sample: ResourceSample,
): Record<string, ProposedSourcedPath> {
  const display: Record<string, ProposedSourcedPath> = {};
  const g = "generic";

  const firstInstance = sample.instances[0] as Record<string, unknown> | undefined;
  if (!firstInstance) return display;

  const meta = firstInstance.metadata as Record<string, unknown> | undefined;
  const status = firstInstance.status as Record<string, unknown> | undefined;

  if (meta?.creationTimestamp) {
    display.started = { path: "metadata.creationTimestamp", source: g };
  }
  if (status?.completionTime) {
    display.completed = { path: "status.completionTime", source: g };
  } else if (status?.startTime) {
    display.started = { path: "status.startTime", source: g };
  }

  if (Array.isArray(status?.conditions)) {
    display.status = { path: "status.conditions[-1].reason", source: g };
  } else if (typeof status?.phase === "string") {
    display.status = { path: "status.phase", source: g };
  }

  if (meta?.namespace) {
    display.namespace = { path: "metadata.namespace", source: g };
  }

  return display;
}

/**
 * Generate a serves entry for a resource type.
 *
 * Strategy: prefer label selector queries when the incoming references
 * use a label-based identifier (finds multiple resources in one call).
 * Always also include a get-by-name query if any reference uses the
 * entity's name directly. Since the current schema supports one serves
 * entry per entity type, we pick the best match for incoming references.
 *
 * When both label and name queries are needed, we use label selector
 * (returns multiple results) as it subsumes get-by-name for BFS.
 * The label selector query template includes both the label identifier
 * AND the name identifier so the query template matching check passes
 * for either.
 */
function generateServes(
  sample: ResourceSample,
  identifiers: Record<string, ProposedSourcedPath>,
  namespace: string,
  incomingIdentifiers: Set<string>,
): ServesEntry[] {
  const type = sample.type;
  const groupPath = type.group ? `apis/${type.group}/${type.version}` : `api/${type.version}`;
  const entries: ServesEntry[] = [];

  // Label selector queries — cluster-scoped (no namespace)
  const usedLabelIdents = Object.entries(identifiers)
    .filter(([name, { path }]) => path.startsWith("metadata.labels[") && incomingIdentifiers.has(name))
    .sort((a, b) => {
      const aIsUnique = /sha|revision|commit|uid|id$/i.test(a[0]) ? 1 : 0;
      const bIsUnique = /sha|revision|commit|uid|id$/i.test(b[0]) ? 1 : 0;
      return bIsUnique - aIsUnique;
    });

  for (const [identName, { path: identPath }] of usedLabelIdents) {
    const labelKey = identPath.match(/metadata\.labels\['(.+)'\]/)?.[1] ?? "";
    entries.push({
      query: {
        endpoint: `/${groupPath}/${type.resource}`,
        method: "GET",
        params: {
          labelSelector: `${labelKey}=\${${identName}}`,
        },
      },
      response_mapping: { list_path: "items" },
    });
  }

  // Get by name (namespace-scoped) as fallback if no label selectors
  if (entries.length === 0) {
    const nameIdent = `${type.kind.toLowerCase()}_name`;
    entries.push({
      query: {
        endpoint: `/${groupPath}/namespaces/${namespace}/${type.resource}/\${${nameIdent}}`,
        method: "GET",
      },
      response_mapping: {},
    });
  }

  return entries;
}

function humanizeKind(kind: string): string {
  return kind.replace(/([a-z])([A-Z])/g, "$1 $2");
}

/**
 * Convert PluginSourcedPath records to ProposedSourcedPath records.
 */
function toSourcedPaths(
  record: Record<string, PluginSourcedPath>,
): Record<string, ProposedSourcedPath> {
  const result: Record<string, ProposedSourcedPath> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = { path: value.path, source: value.source };
  }
  return result;
}
