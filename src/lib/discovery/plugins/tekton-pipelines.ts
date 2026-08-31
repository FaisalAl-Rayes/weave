import type { ResourceTypeInfo, ResourceSample } from "../types";
import type { DomainPlugin, PluginProposal, PluginSourcedPath } from "./types";

/**
 * Tekton Pipelines plugin.
 *
 * Understands the core Tekton resource hierarchy and the labels
 * the Tekton Pipelines controller automatically sets.
 *
 * Reference: https://tekton.dev/docs/pipelines/labels/
 *
 * Labels set by the controller:
 *   tekton.dev/pipeline      — on PipelineRun → Pipeline name
 *   tekton.dev/pipelineRun   — on TaskRun → parent PipelineRun name
 *   tekton.dev/task          — on TaskRun → Task name
 *   tekton.dev/taskRun       — on Pod → parent TaskRun name
 *   tekton.dev/pipelineTask  — on TaskRun → pipeline task name (step name)
 *   tekton.dev/memberOf      — on TaskRun → "tasks" or "finally"
 *
 * Key spec/status fields:
 *   PipelineRun.spec.pipelineRef.name         → Pipeline
 *   PipelineRun.status.childReferences[*].name → TaskRun
 *   TaskRun.spec.taskRef.name                 → Task
 *   TaskRun.status.podName                    → Pod
 */
export class TektonPipelinesPlugin implements DomainPlugin {
  readonly name = "tekton-pipelines";
  readonly label = "Tekton Pipelines";

  detect(resourceTypes: ResourceTypeInfo[]): boolean {
    const kinds = new Set(resourceTypes.map((r) => r.kind));
    return kinds.has("PipelineRun") && kinds.has("TaskRun");
  }

  propose(samples: ResourceSample[]): PluginProposal {
    const hasPipeline = samples.some((s) => s.type.kind === "Pipeline");
    const hasTask = samples.some((s) => s.type.kind === "Task");
    const hasPod = samples.some((s) => s.type.kind === "Pod");

    const identifiers: PluginProposal["identifiers"] = {
      pipelinerun_name: { label: "PipelineRun Name" },
      taskrun_name: { label: "TaskRun Name" },
    };

    if (hasPipeline) {
      identifiers.pipeline_name = { label: "Pipeline Name" };
    }
    if (hasTask) {
      identifiers.task_name = { label: "Task Name" };
    }
    if (hasPod) {
      identifiers.pod_name = { label: "Pod Name" };
    }

    const entities: PluginProposal["entities"] = {};

    // PipelineRun
    const S = "tekton-pipelines";

    const prIdentifiers: Record<string, PluginSourcedPath> = {
      pipelinerun_name: { path: "metadata.name", source: S },
    };
    const prReferences: PluginProposal["entities"][string]["references"] = [
      {
        field: "metadata.name",
        points_to: "TaskRun",
        as: "pipelinerun_name",
        source: S,
      },
    ];
    const prDisplay: Record<string, PluginSourcedPath> = {
      status: { path: "status.conditions[-1].reason", source: S },
      started: { path: "metadata.creationTimestamp", source: S },
      completed: { path: "status.completionTime", source: S },
      namespace: { path: "metadata.namespace", source: S },
    };

    if (hasPipeline) {
      prIdentifiers.pipeline_name = { path: "spec.pipelineRef.name", source: S };
      prReferences.push({
        field: "spec.pipelineRef.name",
        points_to: "Pipeline",
        as: "pipeline_name",
        source: S,
      });
      prDisplay.pipeline = { path: "metadata.labels['tekton.dev/pipeline']", source: S };
    }

    entities.PipelineRun = {
      label: "Pipeline Run",
      format: "kubernetes_resource",
      identifiers: prIdentifiers,
      references: prReferences,
      display: prDisplay,
    };

    // TaskRun
    const trIdentifiers: Record<string, PluginSourcedPath> = {
      taskrun_name: { path: "metadata.name", source: S },
      pipelinerun_name: { path: "metadata.labels['tekton.dev/pipelineRun']", source: S },
    };
    const trReferences: PluginProposal["entities"][string]["references"] = [
      {
        field: "metadata.labels['tekton.dev/pipelineRun']",
        points_to: "PipelineRun",
        as: "pipelinerun_name",
        source: S,
      },
    ];
    const trDisplay: Record<string, PluginSourcedPath> = {
      task: { path: "metadata.labels['tekton.dev/pipelineTask']", source: S },
      status: { path: "status.conditions[-1].reason", source: S },
      started: { path: "status.startTime", source: S },
      completed: { path: "status.completionTime", source: S },
      namespace: { path: "metadata.namespace", source: S },
    };

    if (hasTask) {
      trIdentifiers.task_name = { path: "spec.taskRef.name", source: S };
      trReferences.push({
        field: "spec.taskRef.name",
        points_to: "Task",
        as: "task_name",
        source: S,
      });
    }
    if (hasPod) {
      // TaskRun → Pod: use TaskRun's own name to find Pods labeled with tekton.dev/taskRun
      trReferences.push({
        field: "metadata.name",
        points_to: "Pod",
        as: "taskrun_name",
        source: S,
      });
    }

    entities.TaskRun = {
      label: "Task Run",
      format: "kubernetes_resource",
      identifiers: trIdentifiers,
      references: trReferences,
      display: trDisplay,
    };

    // Pipeline (if present)
    if (hasPipeline) {
      entities.Pipeline = {
        label: "Pipeline",
        format: "kubernetes_resource",
        identifiers: { pipeline_name: { path: "metadata.name", source: S } },
        references: hasTask
          ? [
              {
                field: "spec.tasks[*].taskRef.name",
                points_to: "Task",
                as: "task_name",
                source: S,
              },
            ]
          : [],
        display: {
          started: { path: "metadata.creationTimestamp", source: S },
          namespace: { path: "metadata.namespace", source: S },
        },
      };
    }

    // Task (if present)
    if (hasTask) {
      entities.Task = {
        label: "Task",
        format: "kubernetes_resource",
        identifiers: { task_name: { path: "metadata.name", source: S } },
        references: [],
        display: {
          started: { path: "metadata.creationTimestamp", source: S },
          namespace: { path: "metadata.namespace", source: S },
        },
      };
    }

    // Pod (if present) — Tekton creates one Pod per TaskRun
    if (hasPod) {
      entities.Pod = {
        label: "Pod",
        format: "kubernetes_resource",
        identifiers: {
          pod_name: { path: "metadata.name", source: S },
          taskrun_name: { path: "metadata.labels['tekton.dev/taskRun']", source: S },
        },
        references: [
          {
            field: "metadata.labels['tekton.dev/taskRun']",
            points_to: "TaskRun",
            as: "taskrun_name",
            source: S,
          },
        ],
        display: {
          status: { path: "status.phase", source: S },
          started: { path: "status.startTime", source: S },
          namespace: { path: "metadata.namespace", source: S },
        },
      };
    }

    // Serves declarations — label selectors for querying entities
    const serves: Record<string, { labelSelector: string; identifier: string; source: string }[]> = {
      TaskRun: [
        { labelSelector: `tekton.dev/pipelineRun=\${pipelinerun_name}`, identifier: "pipelinerun_name", source: S },
      ],
    };
    if (hasPod) {
      serves.Pod = [
        { labelSelector: `tekton.dev/taskRun=\${taskrun_name}`, identifier: "taskrun_name", source: S },
      ];
    }

    return {
      identifiers,
      seeds: [{ identifier: "pipelinerun_name", primary: true }],
      entities,
      serves,
    };
  }
}
