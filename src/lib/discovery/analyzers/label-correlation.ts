import type {
  Analyzer,
  DetectedCorrelation,
  ResourceSample,
} from "../types";
import {
  buildLabelIndex,
  labelKeyToIdentifierName,
  labelKeyToLabel,
} from "../utils";

/**
 * Detects correlations via shared label key+value across resource types.
 * Scores by specificity: high-cardinality labels that create 1:1 or 1:N
 * mappings between specific instances score higher than broad labels.
 */
export class LabelCorrelationAnalyzer implements Analyzer {
  readonly name = "label-correlation";

  analyze(samples: ResourceSample[]): DetectedCorrelation[] {
    const correlations: DetectedCorrelation[] = [];
    const labelIndex = buildLabelIndex(samples);
    const instanceCounts = new Map<string, number>();

    for (const sample of samples) {
      instanceCounts.set(sample.type.kind, sample.instances.length);
    }

    for (const [labelKey, valueMap] of labelIndex.byKey) {
      // Find which kinds participate in this label
      const kindsWithLabel = new Map<string, Set<string>>();

      for (const [value, entries] of valueMap) {
        for (const entry of entries) {
          const kindValues = kindsWithLabel.get(entry.kind) ?? new Set();
          kindValues.add(value);
          kindsWithLabel.set(entry.kind, kindValues);
        }
      }

      // Need at least 2 kinds sharing this label
      if (kindsWithLabel.size < 2) continue;

      // Check cardinality: skip labels where >80% of ALL instances share the same value
      const totalInstances = Array.from(kindsWithLabel.keys()).reduce(
        (sum, kind) => sum + (instanceCounts.get(kind) ?? 0),
        0,
      );
      const maxValueCount = Math.max(
        ...Array.from(valueMap.values()).map((entries) => entries.length),
      );
      if (maxValueCount / totalInstances > 0.8) continue;

      const kinds = Array.from(kindsWithLabel.keys());

      // Generate correlations for each pair of kinds
      for (let i = 0; i < kinds.length; i++) {
        for (let j = i + 1; j < kinds.length; j++) {
          const kindA = kinds[i];
          const kindB = kinds[j];
          const valuesA = kindsWithLabel.get(kindA)!;
          const valuesB = kindsWithLabel.get(kindB)!;

          // Find overlapping values
          const overlap = new Set(
            [...valuesA].filter((v) => valuesB.has(v)),
          );
          if (overlap.size === 0) continue;

          // Match ratio: what % of kind A instances have a matching value in kind B
          const countA = instanceCounts.get(kindA) ?? 1;
          const countB = instanceCounts.get(kindB) ?? 1;
          const matchRatioA = overlap.size / valuesA.size;
          const matchRatioB = overlap.size / valuesB.size;
          const matchRatio = Math.max(matchRatioA, matchRatioB);

          if (matchRatio < 0.3) continue;

          // Specificity: prefer labels where values map to small sets
          const avgFanout =
            Array.from(overlap).reduce((sum, v) => {
              const entries = valueMap.get(v) ?? [];
              return sum + entries.length;
            }, 0) / overlap.size;
          const specificity = Math.min(1, 3 / avgFanout); // lower fanout = higher specificity

          const confidence = 0.7 * matchRatio * specificity;
          if (confidence < 0.2) continue;

          const identifierName = labelKeyToIdentifierName(labelKey);
          const labelPath = `metadata.labels['${labelKey}']`;

          // Create correlation in both directions
          correlations.push({
            source: kindA,
            target: kindB,
            signal: "shared_label",
            confidence,
            evidence: {
              sourceField: labelPath,
              targetField: labelPath,
              matchedValues: Array.from(overlap).slice(0, 5),
              matchRatio,
            },
            suggestedIdentifier: {
              name: identifierName,
              label: labelKeyToLabel(labelKey),
              sourcePath: labelPath,
              targetPath: labelPath,
            },
          });

          correlations.push({
            source: kindB,
            target: kindA,
            signal: "shared_label",
            confidence,
            evidence: {
              sourceField: labelPath,
              targetField: labelPath,
              matchedValues: Array.from(overlap).slice(0, 5),
              matchRatio,
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
    }

    return correlations;
  }
}
