import type { Analyzer, DetectedCorrelation, ResourceSample } from "../types";
import { OwnerRefAnalyzer } from "./owner-ref";
import { LabelCorrelationAnalyzer } from "./label-correlation";
import { FieldRefAnalyzer } from "./field-ref";
import { LabelSelectorAnalyzer } from "./label-selector";
import { NamePatternAnalyzer } from "./name-pattern";
import { SeedLabelAnalyzer } from "./seed-label";

const EDGE_ANALYZERS: Analyzer[] = [
  new OwnerRefAnalyzer(),
  new LabelSelectorAnalyzer(),
  new LabelCorrelationAnalyzer(),
  new FieldRefAnalyzer(),
  new NamePatternAnalyzer(),
];

const SEED_ANALYZER = new SeedLabelAnalyzer();

/**
 * Run edge analyzers (cross-type correlations) and seed analyzer separately.
 * Edge correlations go through the scorer; seed labels bypass it.
 */
export function runAnalyzers(
  samples: ResourceSample[],
): { edgeCorrelations: DetectedCorrelation[]; seedCorrelations: DetectedCorrelation[] } {
  const edgeCorrelations: DetectedCorrelation[] = [];

  for (const analyzer of EDGE_ANALYZERS) {
    edgeCorrelations.push(...analyzer.analyze(samples));
  }

  const seedCorrelations = SEED_ANALYZER.analyze(samples);

  return { edgeCorrelations, seedCorrelations };
}
