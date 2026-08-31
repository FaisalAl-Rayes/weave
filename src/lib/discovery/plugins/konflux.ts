import type { ResourceTypeInfo, ResourceSample } from "../types";
import type { DomainPlugin, PluginProposal, PluginSourcedPath } from "./types";
import { getLabels } from "../utils";

/**
 * Konflux / AppStudio plugin.
 *
 * Understands the Konflux pipeline lifecycle and labels from multiple
 * Konflux controllers (AppStudio operators + Integration Test Service).
 *
 * Lifecycle:
 *   Build PipelineRun (by commit_sha via PaC)
 *     → Snapshot (created by Konflux, build-pipelinerun label → build PR)
 *       → Test PipelineRuns (snapshot label, pac.test.* labels from integration test service)
 *         → Release PipelineRuns (snapshot label, in managed-tenant namespace)
 *
 * Labels from AppStudio operators (on PipelineRuns):
 *   appstudio.openshift.io/component      — component name
 *   appstudio.openshift.io/application    — application name
 *   appstudio.openshift.io/snapshot       — Snapshot name (label on test/release, annotation on build)
 *   pipelines.appstudio.openshift.io/type — pipeline type (build/test/release/managed)
 *
 * Labels from Integration Test Service (on test PipelineRuns + Snapshots):
 *   pac.test.appstudio.openshift.io/sha   — commit SHA (propagated to test PRs and Snapshots)
 *
 * Annotations from AppStudio operators (on build PipelineRuns):
 *   appstudio.openshift.io/snapshot       — Snapshot name (set after Snapshot creation)
 *
 * Snapshot CRD (appstudio.redhat.com/v1alpha1):
 *   metadata.labels['appstudio.openshift.io/build-pipelinerun'] — build PipelineRun name
 *   metadata.labels['pac.test.appstudio.openshift.io/sha']      — commit SHA
 *   metadata.labels['appstudio.openshift.io/component']         — component name
 *   spec.application                                            — application name
 */
export class KonfluxPlugin implements DomainPlugin {
  readonly name = "konflux";
  readonly label = "Konflux";

  detect(resourceTypes: ResourceTypeInfo[]): boolean {
    return resourceTypes.some((r) => r.kind === "PipelineRun");
  }

  propose(samples: ResourceSample[]): PluginProposal {
    const prSample = samples.find((s) => s.type.kind === "PipelineRun");
    if (!prSample || !hasKonfluxLabels(prSample)) {
      return { identifiers: {}, seeds: [], entities: {} };
    }

    const S = "konflux";
    const hasSnapshot = samples.some((s) => s.type.kind === "Snapshot");

    const identifiers: PluginProposal["identifiers"] = {
      component_name: { label: "Component" },
      application_name: { label: "Application" },
    };

    if (hasSnapshot) {
      identifiers.snapshot_name = { label: "Snapshot Name" };
    }

    // PipelineRun identifiers
    const prIdentifiers: Record<string, PluginSourcedPath> = {
      component_name: {
        path: "metadata.labels['appstudio.openshift.io/component']",
        source: S,
      },
      application_name: {
        path: "metadata.labels['appstudio.openshift.io/application']",
        source: S,
      },
    };

    // PipelineRun references
    const prReferences: PluginProposal["entities"][string]["references"] = [];

    if (hasSnapshot) {
      // test/release PipelineRuns have snapshot in labels
      prIdentifiers.snapshot_name = {
        path: "metadata.labels['appstudio.openshift.io/snapshot']",
        source: S,
      };
      prReferences.push({
        field: "metadata.labels['appstudio.openshift.io/snapshot']",
        points_to: "Snapshot",
        as: "snapshot_name",
        source: S,
      });
      // build PipelineRuns have snapshot in annotations
      prReferences.push({
        field: "metadata.annotations['appstudio.openshift.io/snapshot']",
        points_to: "Snapshot",
        as: "snapshot_name",
        source: S,
      });
    }

    const entities: PluginProposal["entities"] = {
      PipelineRun: {
        label: "Pipeline Run",
        format: "kubernetes_resource",
        identifiers: prIdentifiers,
        references: prReferences,
        display: {
          pipeline_type: {
            path: "metadata.labels['pipelines.appstudio.openshift.io/type']",
            source: S,
          },
          component: {
            path: "metadata.labels['appstudio.openshift.io/component']",
            source: S,
          },
          application: {
            path: "metadata.labels['appstudio.openshift.io/application']",
            source: S,
          },
        },
      },
    };

    // Snapshot entity
    if (hasSnapshot) {
      entities.Snapshot = {
        label: "Snapshot",
        format: "kubernetes_resource",
        identifiers: {
          snapshot_name: { path: "metadata.name", source: S },
          application_name: { path: "spec.application", source: S },
          component_name: {
            path: "metadata.labels['appstudio.openshift.io/component']",
            source: S,
          },
          pipelinerun_name: {
            path: "metadata.labels['appstudio.openshift.io/build-pipelinerun']",
            source: S,
          },
          commit_sha: {
            path: "metadata.labels['pac.test.appstudio.openshift.io/sha']",
            source: S,
          },
        },
        references: [
          // Snapshot → build PipelineRun (via build-pipelinerun label)
          {
            field: "metadata.labels['appstudio.openshift.io/build-pipelinerun']",
            points_to: "PipelineRun",
            as: "pipelinerun_name",
            source: S,
          },
          // Snapshot → test/release PipelineRuns (they carry this snapshot's name as a label)
          {
            field: "metadata.name",
            points_to: "PipelineRun",
            as: "snapshot_name",
            source: S,
          },
        ],
        display: {
          application: { path: "spec.application", source: S },
          component: {
            path: "metadata.labels['appstudio.openshift.io/component']",
            source: S,
          },
          namespace: { path: "metadata.namespace", source: S },
        },
      };
    }

    // Serves declarations
    const serves: Record<string, { labelSelector: string; identifier: string; source: string }[]> = {
      // Test PipelineRuns queryable by commit SHA via integration test service label
      PipelineRun: [
        { labelSelector: `pac.test.appstudio.openshift.io/sha=\${commit_sha}`, identifier: "commit_sha", source: S },
      ],
    };

    if (hasSnapshot) {
      // Test/release PipelineRuns queryable by snapshot name
      serves.PipelineRun.push(
        { labelSelector: `appstudio.openshift.io/snapshot=\${snapshot_name}`, identifier: "snapshot_name", source: S },
      );
    }

    return {
      identifiers,
      seeds: [],
      entities,
      serves,
    };
  }
}

function hasKonfluxLabels(sample: ResourceSample): boolean {
  const KONFLUX_LABEL = "appstudio.openshift.io/component";
  let count = 0;
  for (const instance of sample.instances) {
    const labels = getLabels(instance);
    if (labels[KONFLUX_LABEL]) count++;
  }
  return count / sample.instances.length > 0.3;
}
