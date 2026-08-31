import type {
  Analyzer,
  DetectedCorrelation,
  ResourceSample,
} from "../types";
import { buildNameIndex, extractStringFields, getName } from "../utils";

/**
 * Detects cross-resource references by finding string field values in one
 * resource type that match metadata.name or metadata.uid of another type.
 *
 * Uses an inverted index for O(N×F) lookups instead of O(N²M²) scanning.
 */
export class FieldRefAnalyzer implements Analyzer {
  readonly name = "field-ref";

  analyze(samples: ResourceSample[]): DetectedCorrelation[] {
    const correlations: DetectedCorrelation[] = [];
    const nameIndex = buildNameIndex(samples);

    for (const sample of samples) {
      const sourceKind = sample.type.kind;

      // Track: targetKind → { fieldPath → matchedNames[] }
      const fieldMatches = new Map<
        string,
        Map<string, string[]>
      >();

      for (const instance of sample.instances) {
        // Extract string fields from spec, status, and metadata labels/annotations
        const obj = instance as Record<string, unknown>;
        const meta = obj.metadata as Record<string, unknown> | undefined;
        const fieldsToScan: [string, unknown][] = [];
        if (obj.spec) fieldsToScan.push(["spec", obj.spec]);
        if (obj.status) fieldsToScan.push(["status", obj.status]);
        if (meta?.labels) fieldsToScan.push(["metadata.labels", meta.labels]);
        if (meta?.annotations) fieldsToScan.push(["metadata.annotations", meta.annotations]);

        for (const [prefix, value] of fieldsToScan) {
          const stringFields = extractStringFields(value, prefix);

          for (const [fieldPath, fieldValue] of stringFields) {
            // Skip values that are too short (likely not names) or too long (likely content)
            if (fieldValue.length < 3 || fieldValue.length > 253) continue;

            // Skip generic value fields that match coincidentally (params, env vars, args)
            if (/\.(value|args\[\*\]|command\[\*\])$/.test(fieldPath) &&
                /params\[\*\]|env\[\*\]|containers\[\*\]/.test(fieldPath)) continue;

            // Look up in name index
            const nameMatches = nameIndex.byName.get(fieldValue);
            if (nameMatches) {
              for (const match of nameMatches) {
                if (match.kind === sourceKind) continue; // skip self-references

                const targetMap =
                  fieldMatches.get(match.kind) ?? new Map<string, string[]>();
                const existing = targetMap.get(fieldPath) ?? [];
                if (!existing.includes(fieldValue)) {
                  existing.push(fieldValue);
                }
                targetMap.set(fieldPath, existing);
                fieldMatches.set(match.kind, targetMap);
              }
            }

            // Look up in UID index
            const uidMatches = nameIndex.byUid.get(fieldValue);
            if (uidMatches) {
              for (const match of uidMatches) {
                if (match.kind === sourceKind) continue;

                const targetMap =
                  fieldMatches.get(match.kind) ?? new Map<string, string[]>();
                const existing = targetMap.get(fieldPath) ?? [];
                if (!existing.includes(fieldValue)) {
                  existing.push(fieldValue);
                }
                targetMap.set(fieldPath, existing);
                fieldMatches.set(match.kind, targetMap);
              }
            }
          }
        }
      }

      // Convert matches to correlations
      for (const [targetKind, pathMap] of fieldMatches) {
        for (const [rawFieldPath, matchedValues] of pathMap) {
          const matchRatio = matchedValues.length / sample.instances.length;
          if (matchRatio < 0.2) continue;

          // Normalize label/annotation paths to bracket notation
          // e.g., "metadata.labels.appstudio.openshift.io/snapshot" → "metadata.labels['appstudio.openshift.io/snapshot']"
          let fieldPath = rawFieldPath;
          const labelMatch = rawFieldPath.match(/^(metadata\.(?:labels|annotations))\.(.+)$/);
          if (labelMatch) {
            fieldPath = `${labelMatch[1]}['${labelMatch[2]}']`;
          }

          // Determine if this is a name or UID reference
          const isUid = fieldPath.toLowerCase().includes("uid");
          const identifierSuffix = isUid ? "_uid" : "_name";
          const identifierName = `${targetKind.toLowerCase()}${identifierSuffix}`;

          correlations.push({
            source: sourceKind,
            target: targetKind,
            signal: "field_ref",
            confidence: 0.8 * matchRatio,
            evidence: {
              sourceField: fieldPath,
              targetField: isUid ? "metadata.uid" : "metadata.name",
              matchedValues: matchedValues.slice(0, 5),
              matchRatio,
            },
            suggestedIdentifier: {
              name: identifierName,
              label: `${targetKind} ${isUid ? "UID" : "Name"}`,
              sourcePath: fieldPath,
              targetPath: isUid ? "metadata.uid" : "metadata.name",
            },
            suggestedReference: {
              field: fieldPath,
              points_to: targetKind,
              as: identifierName,
            },
          });
        }
      }
    }

    return correlations;
  }
}
