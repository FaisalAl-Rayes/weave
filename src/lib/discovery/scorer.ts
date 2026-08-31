import type { DetectedCorrelation, SignalType } from "./types";

const SIGNAL_BASE_WEIGHT: Record<SignalType, number> = {
  owner_ref: 1.0,
  label_selector: 0.9,
  field_ref: 0.8,
  shared_label: 0.7,
  known_ref: 0.85,
  name_pattern: 0.5,
};

/**
 * Score, deduplicate, and rank detected correlations.
 *
 * For each (source, target) pair:
 * 1. Groups all correlations from different analyzers
 * 2. Picks the highest-confidence correlation as primary
 * 3. Applies reciprocity bonus if both A→B and B→A exist
 * 4. Filters below minimum threshold
 */
export function scoreAndRank(
  correlations: DetectedCorrelation[],
  minConfidence = 0.15,
): DetectedCorrelation[] {
  // Group by (source, target) pair
  const groups = new Map<string, DetectedCorrelation[]>();

  for (const corr of correlations) {
    // Seed-label correlations (source === target) are unique per identifier,
    // so include the identifier name in the key to avoid dedup
    const suffix = corr.source === corr.target && corr.suggestedIdentifier
      ? `::${corr.suggestedIdentifier.name}`
      : "";
    const key = `${corr.source}→${corr.target}${suffix}`;
    const group = groups.get(key) ?? [];
    group.push(corr);
    groups.set(key, group);
  }

  // For each group, pick the best and apply composite scoring
  const ranked: DetectedCorrelation[] = [];

  for (const [, group] of groups) {
    // Sort by confidence descending
    group.sort((a, b) => b.confidence - a.confidence);
    const best = { ...group[0] };

    // Composite confidence: base weight × match ratio × multi-signal bonus
    const baseWeight = SIGNAL_BASE_WEIGHT[best.signal] ?? 0.5;
    const multiSignalBonus = group.length > 1 ? 1.1 : 1.0;

    best.confidence = Math.min(
      1.0,
      baseWeight * best.evidence.matchRatio * multiSignalBonus,
    );

    // Merge evidence from other signals into the best
    if (group.length > 1 && !best.suggestedReference && group[1].suggestedReference) {
      best.suggestedReference = group[1].suggestedReference;
    }
    if (group.length > 1 && !best.suggestedIdentifier && group[1].suggestedIdentifier) {
      best.suggestedIdentifier = group[1].suggestedIdentifier;
    }

    ranked.push(best);
  }

  // Reciprocity bonus: if A→B and B→A both exist, boost both
  const pairKeys = new Set(ranked.map((c) => `${c.source}→${c.target}`));
  for (const corr of ranked) {
    const reverseKey = `${corr.target}→${corr.source}`;
    if (pairKeys.has(reverseKey)) {
      corr.confidence = Math.min(1.0, corr.confidence * 1.15);
    }
  }

  // Filter and sort
  return ranked
    .filter((c) => c.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence);
}
