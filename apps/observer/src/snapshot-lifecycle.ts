export type ObservationMode =
  | "change_only"
  | "force_extract"
  | "unchecked_only"
  | "profile_refresh";

export async function commitUnchangedSnapshotIfNeeded(
  mode: ObservationMode,
  changed: boolean,
  commit: () => Promise<void>
): Promise<boolean> {
  if (changed || mode === "force_extract") return false;
  await commit();
  return true;
}
