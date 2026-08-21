import { describe, expect, it, vi } from "vitest";
import {
  FORCED_DETAIL_SOURCE_LIMIT,
  selectObservationRunSources
} from "../src/observation-source-selection";
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

describe("observation workflow source budget", () => {
  const sources = [
    { id: "home", purpose: "bootstrap" },
    { id: "listing", purpose: "listing" },
    ...Array.from({ length: 10 }, (_, index) => ({
      id: `detail-${index}`,
      purpose: "detail"
    }))
  ];

  it("keeps core listings and deterministically rotates a bounded detail window", () => {
    const input = {
      mode: "force_extract" as const,
      galleryId: "gallery-id",
      scheduledFor: Date.parse("2026-08-21T12:00:00Z"),
      detailSourcesAttempted: 0
    };
    const selected = selectObservationRunSources(sources, input);

    expect(selected.filter((source) => source.purpose !== "detail")).toEqual(
      sources.slice(0, 2)
    );
    expect(selected.filter((source) => source.purpose === "detail")).toHaveLength(
      FORCED_DETAIL_SOURCE_LIMIT
    );
    expect(selectObservationRunSources(sources, input)).toEqual(selected);
  });

  it("spends the detail budget once across discovery passes", () => {
    const selected = selectObservationRunSources(sources, {
      mode: "force_extract",
      galleryId: "gallery-id",
      scheduledFor: Date.parse("2026-08-21T12:00:00Z"),
      detailSourcesAttempted: FORCED_DETAIL_SOURCE_LIMIT
    });

    expect(selected).toEqual(sources.slice(0, 2));
  });

  it("does not cap normal scheduled due-source observations", () => {
    expect(
      selectObservationRunSources(sources, {
        mode: "change_only",
        galleryId: "gallery-id",
        scheduledFor: Date.parse("2026-08-21T12:00:00Z"),
        detailSourcesAttempted: 0
      })
    ).toEqual(sources);
  });
});
