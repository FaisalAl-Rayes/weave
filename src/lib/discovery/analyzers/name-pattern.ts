import type {
  Analyzer,
  DetectedCorrelation,
  ResourceSample,
} from "../types";
import { getName } from "../utils";

/**
 * Detects correlations via name substring containment.
 * e.g., TaskRun "my-pipeline-git-clone" contains PipelineRun name "my-pipeline".
 *
 * Constraint: the substring must be the FULL metadata.name of a specific
 * instance of the target type, not just a shared prefix.
 */
export class NamePatternAnalyzer implements Analyzer {
  readonly name = "name-pattern";

  analyze(samples: ResourceSample[]): DetectedCorrelation[] {
    const correlations: DetectedCorrelation[] = [];

    // Build a map of kind → [name, ...]
    const namesByKind = new Map<string, string[]>();
    for (const sample of samples) {
      const names: string[] = [];
      for (const instance of sample.instances) {
        const name = getName(instance);
        if (name) names.push(name);
      }
      namesByKind.set(sample.type.kind, names);
    }

    const kinds = Array.from(namesByKind.keys());

    for (let i = 0; i < kinds.length; i++) {
      for (let j = 0; j < kinds.length; j++) {
        if (i === j) continue;

        const sourceKind = kinds[i]; // the child (longer name)
        const targetKind = kinds[j]; // the parent (shorter name, contained in child)
        const sourceNames = namesByKind.get(sourceKind) ?? [];
        const targetNames = namesByKind.get(targetKind) ?? [];

        if (sourceNames.length === 0 || targetNames.length === 0) continue;

        // For each source name, check if any target name is a prefix substring
        let matchCount = 0;
        const matchedParents: string[] = [];

        for (const sourceName of sourceNames) {
          for (const targetName of targetNames) {
            // Target name must be shorter and must be a prefix of source name
            // followed by a separator character (-, _, .)
            if (
              targetName.length < sourceName.length &&
              sourceName.startsWith(targetName) &&
              "-_.".includes(sourceName[targetName.length])
            ) {
              matchCount++;
              if (
                !matchedParents.includes(targetName) &&
                matchedParents.length < 5
              ) {
                matchedParents.push(targetName);
              }
              break; // one match per source instance is enough
            }
          }
        }

        const matchRatio = matchCount / sourceNames.length;
        if (matchRatio < 0.5) continue;
        if (matchedParents.length === 0) continue;

        const identifierName = `${targetKind.toLowerCase()}_name`;

        correlations.push({
          source: sourceKind,
          target: targetKind,
          signal: "name_pattern",
          confidence: 0.5 * matchRatio,
          evidence: {
            sourceField: "metadata.name",
            targetField: "metadata.name",
            matchedValues: matchedParents,
            matchRatio,
          },
          suggestedIdentifier: {
            name: identifierName,
            label: `${targetKind} Name`,
            sourcePath: "metadata.name",
            targetPath: "metadata.name",
          },
        });
      }
    }

    return correlations;
  }
}
