export const FORCED_DETAIL_SOURCE_LIMIT = 4;

function stableRotationOffset(seed: string, length: number): number {
  if (length <= 1) return 0;
  let hash = 2_166_136_261;
  for (const character of seed) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) % length;
}

export function selectObservationRunSources<
  T extends { id: string; purpose: string }
>(
  sources: T[],
  input: {
    mode:
      | "change_only"
      | "force_extract"
      | "unchecked_only"
      | "profile_refresh";
    galleryId: string;
    scheduledFor: number;
    detailSourcesAttempted: number;
  }
): T[] {
  if (input.mode !== "force_extract" && input.mode !== "unchecked_only") {
    return sources;
  }
  const remainingDetailBudget = Math.max(
    0,
    FORCED_DETAIL_SOURCE_LIMIT - input.detailSourcesAttempted
  );
  const coreSources = sources.filter((source) => source.purpose !== "detail");
  const details = sources.filter((source) => source.purpose === "detail");
  if (details.length <= remainingDetailBudget) return sources;
  const week = Math.floor(input.scheduledFor / (7 * 24 * 60 * 60 * 1_000));
  const offset = stableRotationOffset(
    `${input.galleryId}:${week}`,
    details.length
  );
  const rotatedDetails = [...details.slice(offset), ...details.slice(0, offset)];
  return [
    ...coreSources,
    ...rotatedDetails.slice(0, remainingDetailBudget)
  ];
}
