import type { ResourceTypeInfo, ResourceSample } from "../types";

/**
 * A domain plugin contributes identifiers, references, and display fields
 * to entities it understands. Plugins don't claim entire resource types —
 * multiple plugins can contribute to the same entity, and generic analyzers
 * also contribute to all entities.
 *
 * Every field carries a `source` tag identifying which plugin produced it.
 * Plugin results take priority over generic analyzer results on conflict.
 */
export interface DomainPlugin {
  readonly name: string;
  readonly label: string;

  /** Check if this plugin is relevant for the cluster */
  detect(resourceTypes: ResourceTypeInfo[]): boolean;

  /** Produce a schema fragment with source-tagged fields */
  propose(samples: ResourceSample[]): PluginProposal;
}

export interface PluginProposal {
  identifiers: Record<string, { label: string; pattern?: string }>;
  seeds: PluginSeed[];
  entities: Record<string, PluginEntity>;
  /** Label selectors for querying entities. The proposer wraps these with
   *  the correct API endpoint. Key is the entity kind. */
  serves?: Record<string, PluginServesEntry[]>;
}

export interface PluginServesEntry {
  /** Label selector template, e.g., "tekton.dev/pipelineRun=${pipelinerun_name}" */
  labelSelector: string;
  /** Which identifier type this query accepts */
  identifier: string;
  /** Source plugin name */
  source: string;
}

export interface PluginSeed {
  identifier: string;
  primary?: boolean;
}

export interface PluginEntity {
  label: string;
  format?: string;
  identifiers: Record<string, PluginSourcedPath>;
  references: PluginReference[];
  display: Record<string, PluginSourcedPath>;
}

export interface PluginSourcedPath {
  path: string;
  source: string;
}

export interface PluginReference {
  field: string;
  points_to: string;
  as: string;
  source: string;
}
