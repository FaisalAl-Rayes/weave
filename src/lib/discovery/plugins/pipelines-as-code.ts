import type { ResourceTypeInfo, ResourceSample } from "../types";
import type { DomainPlugin, PluginProposal, PluginSourcedPath } from "./types";
import { getLabels } from "../utils";

/**
 * PipelinesAsCode plugin.
 *
 * Extends the Tekton Pipelines schema with PaC-specific labels
 * that the PipelinesAsCode controller sets on PipelineRuns.
 *
 * This plugin composes with the Tekton Pipelines plugin — it adds
 * identifiers, seeds, and display fields to PipelineRun without
 * replacing the base Tekton entity definition.
 *
 * Labels set by PaC controller on PipelineRuns:
 *   pipelinesascode.tekton.dev/sha              — commit SHA
 *   pipelinesascode.tekton.dev/url-org           — git org/owner
 *   pipelinesascode.tekton.dev/url-repository    — git repo name
 *   pipelinesascode.tekton.dev/event-type        — push, pull_request
 *   pipelinesascode.tekton.dev/branch            — target branch
 *   pipelinesascode.tekton.dev/original-prname   — original PipelineRun name
 *   pipelinesascode.tekton.dev/state             — started, completed
 *   pipelinesascode.tekton.dev/sender            — git user who triggered
 *   pipelinesascode.tekton.dev/pull-request      — PR number
 */
export class PipelinesAsCodePlugin implements DomainPlugin {
  readonly name = "pipelines-as-code";
  readonly label = "Pipelines as Code";

  detect(resourceTypes: ResourceTypeInfo[]): boolean {
    // PaC doesn't have its own CRDs — it adds labels to PipelineRuns.
    // Detect by checking if sampled PipelineRuns have PaC labels.
    // Since detect() only gets resourceTypes (not samples), we check
    // for PipelineRun existence. The propose() method validates further.
    return resourceTypes.some((r) => r.kind === "PipelineRun");
  }

  propose(samples: ResourceSample[]): PluginProposal {
    const prSample = samples.find((s) => s.type.kind === "PipelineRun");

    // Verify PaC labels actually exist on sampled PipelineRuns
    if (!prSample || !hasPacLabels(prSample)) {
      return { identifiers: {}, seeds: [], entities: {} };
    }

    const S = "pipelines-as-code";

    return {
      identifiers: {
        commit_sha: {
          label: "Commit SHA",
          pattern: "^[a-f0-9]{7,40}$",
        },
      },
      seeds: [
        { identifier: "commit_sha", primary: true },
      ],
      serves: {
        // Build PipelineRuns are queryable by commit SHA via PaC label
        PipelineRun: [
          { labelSelector: `pipelinesascode.tekton.dev/sha=\${commit_sha}`, identifier: "commit_sha", source: S },
        ],
      },
      entities: {
        // This is a partial entity — the merger will merge it with the
        // Tekton Pipelines plugin's PipelineRun definition
        PipelineRun: {
          label: "Pipeline Run",
          format: "kubernetes_resource",
          identifiers: {
            commit_sha: { path: "metadata.labels['pipelinesascode.tekton.dev/sha']", source: S },
          },
          references: [],
          display: {
            event_type: { path: "metadata.labels['pipelinesascode.tekton.dev/event-type']", source: S },
            repository: { path: "metadata.labels['pipelinesascode.tekton.dev/url-repository']", source: S },
            pr_number: { path: "metadata.labels['pipelinesascode.tekton.dev/pull-request']", source: S },
          },
        },
      },
    };
  }
}

/**
 * Check if PipelineRun samples have PipelinesAsCode labels.
 */
function hasPacLabels(sample: ResourceSample): boolean {
  const PAC_LABEL = "pipelinesascode.tekton.dev/sha";
  let count = 0;

  for (const instance of sample.instances) {
    const labels = getLabels(instance);
    if (labels[PAC_LABEL]) count++;
  }

  // At least 30% of PipelineRuns should have PaC labels
  return count / sample.instances.length > 0.3;
}
