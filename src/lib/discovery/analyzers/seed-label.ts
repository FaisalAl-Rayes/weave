import type {
  Analyzer,
  DetectedCorrelation,
  ResourceSample,
} from "../types";
import {
  buildLabelIndex,
  isInfrastructureLabel,
  labelKeyToIdentifierName,
  labelKeyToLabel,
  getLabels,
} from "../utils";

/**
 * Detects labels that are good seed candidates — high-cardinality labels
 * on root-like entities that a user would naturally search by.
 *
 * Also detects low-cardinality "type" labels that are useful as display
 * fields (e.g., pipeline type: build/test/release).
 *
 * Produces correlations with signal "shared_label" that carry seed
 * metadata, and generates labelSelector-based serves queries.
 */
export class SeedLabelAnalyzer implements Analyzer {
  readonly name = "seed-label";

  analyze(samples: ResourceSample[]): DetectedCorrelation[] {
    const correlations: DetectedCorrelation[] = [];
    const labelIndex = buildLabelIndex(samples);

    for (const [labelKey, valueMap] of labelIndex.byKey) {
      if (isInfrastructureLabel(labelKey)) continue;

      // Compute stats for this label
      const distinctValues = valueMap.size;
      const kindsWithLabel = new Set<string>();
      let totalInstances = 0;

      for (const [, entries] of valueMap) {
        for (const entry of entries) {
          kindsWithLabel.add(entry.kind);
          totalInstances++;
        }
      }

      if (kindsWithLabel.size === 0) continue;

      if (distinctValues < 2) continue;

      // Find the best kind for this label — the one with highest per-kind cardinality
      let bestKind: string | null = null;
      let bestConfidence = 0;
      let bestCoverage = 0;
      let bestValues: Set<string> = new Set();

      for (const sample of samples) {
        const kind = sample.type.kind;
        if (!kindsWithLabel.has(kind)) continue;

        let instancesWithLabel = 0;
        const valuesForKind = new Set<string>();

        for (const instance of sample.instances) {
          const labels = getLabels(instance);
          const val = labels[labelKey];
          if (val !== undefined) {
            instancesWithLabel++;
            valuesForKind.add(val);
          }
        }

        if (instancesWithLabel === 0) continue;

        const coverage = instancesWithLabel / sample.instances.length;
        if (coverage < 0.5) continue;

        const kindCardinality = valuesForKind.size / instancesWithLabel;
        if (valuesForKind.size < 2 || kindCardinality < 0.25) continue;

        // Skip labels whose values are names/UIDs of other resource types
        // (those are references, not seed identifiers)
        // e.g., tekton.dev/taskRun on Pod — that's a reference to TaskRun, not a seed
        const labelBaseName = labelKey.split("/").pop()?.toLowerCase() ?? "";
        const isReferenceLabel = samples.some(
          (s) => s.type.kind.toLowerCase() === labelBaseName.replace(/uid$/, ""),
        );
        if (isReferenceLabel) continue;

        const confidence = 0.85 * coverage * Math.min(1, kindCardinality * 2);
        if (confidence > bestConfidence) {
          bestKind = kind;
          bestConfidence = confidence;
          bestCoverage = coverage;
          bestValues = valuesForKind;
        }
      }

      if (bestKind) {
        const identifierName = labelKeyToIdentifierName(labelKey);
        const labelPath = `metadata.labels['${labelKey}']`;

        correlations.push({
          source: bestKind,
          target: bestKind,
          signal: "shared_label",
          confidence: bestConfidence,
          evidence: {
            sourceField: labelPath,
            targetField: labelPath,
            matchedValues: Array.from(bestValues).slice(0, 5),
            matchRatio: bestCoverage,
          },
          suggestedIdentifier: {
            name: identifierName,
            label: labelKeyToLabel(labelKey),
            sourcePath: labelPath,
            targetPath: labelPath,
          },
        });
      }
    }

    return correlations;
  }
}
