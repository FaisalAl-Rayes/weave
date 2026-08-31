import type { ResourceTypeInfo, ResourceSample } from "../types";
import type { DomainPlugin, PluginProposal, PluginEntity, PluginSourcedPath, PluginServesEntry } from "./types";
import { TektonPipelinesPlugin } from "./tekton-pipelines";
import { PipelinesAsCodePlugin } from "./pipelines-as-code";
import { KonfluxPlugin } from "./konflux";
import { CertManagerPlugin } from "./cert-manager";

export type { DomainPlugin, PluginProposal };

/**
 * All registered domain plugins, in priority order.
 * Plugins later in the list can overlay/extend entities defined by earlier ones.
 */
const ALL_PLUGINS: DomainPlugin[] = [
  new TektonPipelinesPlugin(),
  new PipelinesAsCodePlugin(),
  new KonfluxPlugin(),
  new CertManagerPlugin(),
];

export interface PluginResult {
  /** Which plugins were activated */
  activePlugins: string[];

  /** Merged proposal from all active plugins */
  proposal: PluginProposal;
}

/**
 * Detect which plugins are relevant for the cluster, run them,
 * and merge their proposals.
 *
 * Merge rules:
 * - Identifiers are merged (later plugins add to earlier ones)
 * - Seeds from later plugins override earlier ones for the same identifier;
 *   if a later plugin sets primary, it takes precedence
 * - Entities are deep-merged: identifiers, references, and display fields
 *   from later plugins are added to earlier ones (not replaced)
 */
export function runPlugins(
  resourceTypes: ResourceTypeInfo[],
  samples: ResourceSample[],
): PluginResult {
  const activePlugins: string[] = [];
  const merged: PluginProposal = {
    identifiers: {},
    seeds: [],
    entities: {},
    serves: {},
  };

  for (const plugin of ALL_PLUGINS) {
    if (!plugin.detect(resourceTypes)) continue;

    const proposal = plugin.propose(samples);

    // Skip if plugin returned empty (e.g., PaC detected but no labels found)
    const entityCount = Object.keys(proposal.entities).length;
    if (entityCount === 0 && proposal.seeds.length === 0) continue;

    activePlugins.push(plugin.name);

    // Merge identifiers
    Object.assign(merged.identifiers, proposal.identifiers);

    // Merge seeds: later plugins can override primary
    for (const seed of proposal.seeds) {
      const existing = merged.seeds.find(
        (s) => s.identifier === seed.identifier,
      );
      if (existing) {
        if (seed.primary) existing.primary = true;
      } else {
        merged.seeds.push({ ...seed });
      }
    }

    // If a later plugin sets a new primary, clear primary from earlier seeds
    if (proposal.seeds.some((s) => s.primary)) {
      const primaryIdent = proposal.seeds.find((s) => s.primary)?.identifier;
      for (const seed of merged.seeds) {
        seed.primary = seed.identifier === primaryIdent ? true : undefined;
      }
    }

    // Merge entities (deep merge — extend, don't replace)
    for (const [kind, entity] of Object.entries(proposal.entities)) {
      const existing = merged.entities[kind];
      if (existing) {
        merged.entities[kind] = mergeEntity(existing, entity);
      } else {
        merged.entities[kind] = { ...entity };
      }
    }

    // Merge serves (append, deduplicate by labelSelector)
    if (proposal.serves) {
      for (const [kind, entries] of Object.entries(proposal.serves)) {
        const existing = merged.serves![kind] ?? [];
        for (const entry of entries) {
          if (!existing.some((e) => e.labelSelector === entry.labelSelector)) {
            existing.push(entry);
          }
        }
        merged.serves![kind] = existing;
      }
    }
  }

  return { activePlugins, proposal: merged };
}

/**
 * Deep merge two entity definitions.
 * Later entity's fields are added to earlier entity's fields (not replaced).
 */
function mergeEntity(base: PluginEntity, overlay: PluginEntity): PluginEntity {
  // Merge identifiers (overlay wins on key collision)
  const identifiers = { ...base.identifiers, ...overlay.identifiers };

  // Merge references (deduplicate by field + points_to)
  const refKeys = new Set(
    base.references.map((r) => `${r.field}→${r.points_to}`),
  );
  const references = [...base.references];
  for (const ref of overlay.references) {
    const key = `${ref.field}→${ref.points_to}`;
    if (!refKeys.has(key)) {
      references.push(ref);
      refKeys.add(key);
    }
  }

  // Merge display (overlay wins on key collision)
  const display = { ...base.display, ...overlay.display };

  return {
    label: overlay.label || base.label,
    format: overlay.format || base.format,
    identifiers,
    references,
    display,
  };
}
