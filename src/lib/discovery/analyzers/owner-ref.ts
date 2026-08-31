import type {
  Analyzer,
  DetectedCorrelation,
  ResourceSample,
} from "../types";
import { getName, getOwnerRefs, labelKeyToIdentifierName, labelKeyToLabel } from "../utils";

/**
 * Detects parent-child relationships via metadata.ownerReferences.
 * This is the strongest signal — it's an explicit, typed reference.
 */
export class OwnerRefAnalyzer implements Analyzer {
  readonly name = "owner-ref";

  analyze(samples: ResourceSample[]): DetectedCorrelation[] {
    const correlations: DetectedCorrelation[] = [];
    const kindSet = new Set(samples.map((s) => s.type.kind));

    for (const sample of samples) {
      const sourceKind = sample.type.kind;

      // Group owner references by target kind
      const ownerGroups = new Map<
        string,
        { sourceName: string; ownerName: string }[]
      >();

      for (const instance of sample.instances) {
        const sourceName = getName(instance) ?? "";
        const refs = getOwnerRefs(instance);

        for (const ref of refs) {
          if (!kindSet.has(ref.kind)) continue;

          const group = ownerGroups.get(ref.kind) ?? [];
          group.push({ sourceName, ownerName: ref.name });
          ownerGroups.set(ref.kind, group);
        }
      }

      for (const [targetKind, matches] of ownerGroups) {
        const matchRatio = matches.length / sample.instances.length;
        if (matchRatio < 0.3) continue;

        // The identifier is the owner's name, typically carried as a label
        // on the child resource. Find the label key that matches.
        const labelKey = findOwnerLabelKey(sample, targetKind, matches);

        const identifierName = labelKey
          ? labelKeyToIdentifierName(labelKey)
          : `${targetKind.toLowerCase()}_name`;

        correlations.push({
          source: sourceKind,
          target: targetKind,
          signal: "owner_ref",
          confidence: 1.0 * matchRatio,
          evidence: {
            sourceField: "metadata.ownerReferences[*].name",
            targetField: "metadata.name",
            matchedValues: matches
              .slice(0, 5)
              .map((m) => m.ownerName),
            matchRatio,
          },
          suggestedIdentifier: {
            name: identifierName,
            label: labelKey ? labelKeyToLabel(labelKey) : `${targetKind} Name`,
            sourcePath: labelKey
              ? `metadata.labels['${labelKey}']`
              : "metadata.ownerReferences[*].name",
            targetPath: "metadata.name",
          },
          suggestedReference: {
            field: labelKey
              ? `metadata.labels['${labelKey}']`
              : "metadata.ownerReferences[*].name",
            points_to: targetKind,
            as: identifierName,
          },
        });
      }
    }

    return correlations;
  }
}

/**
 * Find a label on the child resource whose values match the owner names.
 * e.g., TaskRun has label `tekton.dev/pipelineRun` whose value matches
 * the ownerReference name.
 */
function findOwnerLabelKey(
  sample: ResourceSample,
  targetKind: string,
  matches: { sourceName: string; ownerName: string }[],
): string | null {
  const ownerNames = new Set(matches.map((m) => m.ownerName));

  // Check each label key on the child instances
  for (const labelKey of sample.labelKeys) {
    let labelMatchCount = 0;

    for (const instance of sample.instances) {
      const labels =
        ((instance as Record<string, unknown>).metadata as Record<string, unknown>)
          ?.labels as Record<string, string> | undefined;
      if (!labels) continue;

      const labelValue = labels[labelKey];
      if (labelValue && ownerNames.has(labelValue)) {
        labelMatchCount++;
      }
    }

    if (labelMatchCount / sample.instances.length > 0.5) {
      return labelKey;
    }
  }

  return null;
}
