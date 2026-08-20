import { describe, expect, it, vi } from "vitest";
import { commitUnchangedSnapshotIfNeeded } from "../src/snapshot-lifecycle";

describe("observation workflow snapshot lifecycle", () => {
  it("commits unchanged snapshots before skipping extraction", async () => {
    const commit = vi.fn(async () => undefined);

    await expect(
      commitUnchangedSnapshotIfNeeded("change_only", false, commit)
    ).resolves.toBe(true);
    expect(commit).toHaveBeenCalledOnce();
  });

  it("does not short-circuit changed or force-extracted snapshots", async () => {
    const commit = vi.fn(async () => undefined);

    await expect(
      commitUnchangedSnapshotIfNeeded("change_only", true, commit)
    ).resolves.toBe(false);
    await expect(
      commitUnchangedSnapshotIfNeeded("force_extract", false, commit)
    ).resolves.toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });
});
