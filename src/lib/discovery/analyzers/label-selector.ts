import type {
  Analyzer,
  DetectedCorrelation,
  ResourceSample,
} from "../types";
import { getLabels, labelKeyToIdentifierName, labelKeyToLabel } from "../utils";

/**
 * Detects correlations via spec.selector.matchLabels.
 * Services, Deployments, StatefulSets, Jobs, etc. declare which
 * resources they select via label selectors. This is a definitive signal.
 */
export class LabelSelectorAnalyzer implements Analyzer {
  readonly name = "label-selector";

  analyze(samples: ResourceSample[]): DetectedCorrelation[] {
    const correlations: DetectedCorrelation[] = [];

    for (const sample of samples) {
      const sourceKind = sample.type.kind;

      // Extract selector labels from instances
      const selectorMatches = new Map<
        string,
        { selectorLabels: Record<string, string>; count: number }
      >();

      for (const instance of sample.instances) {
        const selector = extractSelector(instance);
        if (!selector || Object.keys(selector).length === 0) continue;

        const key = JSON.stringify(selector);
        const existing = selectorMatches.get(key);
        if (existing) {
          existing.count++;
        } else {
          selectorMatches.set(key, { selectorLabels: selector, count: 1 });
        }
      }

      if (selectorMatches.size === 0) continue;

      // For each selector, find resource types that have matching labels
      for (const [, { selectorLabels, count }] of selectorMatches) {
        for (const targetSample of samples) {
          if (targetSample.type.kind === sourceKind) continue;

          let matchCount = 0;
          const matchedNames: string[] = [];

          for (const targetInstance of targetSample.instances) {
            const targetLabels = getLabels(targetInstance);

            const allMatch = Object.entries(selectorLabels).every(
              ([k, v]) => targetLabels[k] === v,
            );

            if (allMatch) {
              matchCount++;
              const meta = (targetInstance as Record<string, unknown>)
                .metadata as Record<string, unknown> | undefined;
              const name = meta?.name as string | undefined;
              if (name && matchedNames.length < 5) matchedNames.push(name);
            }
          }

          if (matchCount === 0) continue;

          const matchRatio = matchCount / targetSample.instances.length;
          // Use the first selector label as the primary identifier
          const primaryLabelKey = Object.keys(selectorLabels)[0];
          const identifierName = labelKeyToIdentifierName(primaryLabelKey);

          correlations.push({
            source: sourceKind,
            target: targetSample.type.kind,
            signal: "label_selector",
            confidence: 0.9 * matchRatio,
            evidence: {
              sourceField: "spec.selector.matchLabels",
              targetField: `metadata.labels['${primaryLabelKey}']`,
              matchedValues: matchedNames,
              matchRatio,
            },
            suggestedIdentifier: {
              name: identifierName,
              label: labelKeyToLabel(primaryLabelKey),
              sourcePath: `spec.selector.matchLabels['${primaryLabelKey}']`,
              targetPath: `metadata.labels['${primaryLabelKey}']`,
            },
          });
        }
      }
    }

    return correlations;
  }
}

/**
 * Extract label selector from a resource.
 * Handles spec.selector.matchLabels (Deployments, StatefulSets, Jobs)
 * and spec.selector (Services, older format).
 */
function extractSelector(obj: unknown): Record<string, string> | null {
  const spec = (obj as Record<string, unknown>)?.spec as
    | Record<string, unknown>
    | undefined;
  if (!spec?.selector) return null;

  const selector = spec.selector as Record<string, unknown>;

  // spec.selector.matchLabels (Deployment, StatefulSet, Job, ReplicaSet)
  if (selector.matchLabels && typeof selector.matchLabels === "object") {
    return selector.matchLabels as Record<string, string>;
  }

  // spec.selector as direct key-value (Service v1)
  if (typeof selector === "object" && !Array.isArray(selector)) {
    const entries = Object.entries(selector).filter(
      ([k, v]) =>
        typeof v === "string" && k !== "matchLabels" && k !== "matchExpressions",
    );
    if (entries.length > 0) {
      return Object.fromEntries(entries) as Record<string, string>;
    }
  }

  return null;
}
