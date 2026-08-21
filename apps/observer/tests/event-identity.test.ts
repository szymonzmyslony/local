import { describe, expect, it } from "vitest";
import {
  canonicalEventFingerprint,
  isSameCanonicalEvent
} from "../src/event-identity";

const market = { locale: "pl-PL", timezone: "Europe/Warsaw" } as const;

describe("event identity", () => {
  it("uses the UTC instant rather than the model's datetime spelling", async () => {
    const input = {
      galleryId: "83ed22d0-9aac-44a9-b77d-7cea699d98c5",
      title: "  WYSTAWA: Test! ",
      locale: "pl-PL"
    };
    expect(
      await canonicalEventFingerprint({
        ...input,
        startAt: "2026-08-21T18:00:00+02:00"
      })
    ).toBe(
      await canonicalEventFingerprint({
        ...input,
        title: "wystawa test",
        startAt: "2026-08-21T16:00:00.000Z"
      })
    );
  });

  it("merges the same exhibition when two sources disagree by one day", () => {
    expect(
      isSameCanonicalEvent({
        existing: {
          title: "Dom na korzeniach",
          startAt: new Date("2026-07-31T00:00:00+02:00")
        },
        observed: {
          kind: "range",
          title: "  DOM   NA KORZENIACH ",
          startAt: new Date("2026-08-01T00:00:00+02:00"),
          endAt: new Date("2026-10-11T23:59:59+02:00")
        },
        ...market
      })
    ).toBe(true);
  });

  it("merges title variants that only change punctuation", () => {
    expect(
      isSameCanonicalEvent({
        existing: {
          title: "Jan Domicz, John Smith | Potencjał mieszkaniowy Galerii Foksal",
          startAt: new Date("2026-07-03T00:00:00+02:00")
        },
        observed: {
          kind: "range",
          title: "Jan Domicz, John Smith, Potencjał mieszkaniowy Galerii Foksal",
          startAt: new Date("2026-07-03T00:00:00+02:00"),
          endAt: new Date("2026-08-29T23:59:59+02:00")
        },
        ...market
      })
    ).toBe(true);
  });

  it("merges a date-only point with a timed observation on the same local day", () => {
    expect(
      isSameCanonicalEvent({
        existing: {
          title: "Klub Seniorek i Seniorów",
          startAt: new Date("2026-08-11T00:00:00+02:00")
        },
        observed: {
          kind: "point",
          title: "Klub Seniorek i Seniorów",
          startAt: new Date("2026-08-11T13:00:00+02:00")
        },
        ...market
      })
    ).toBe(true);
  });

  it("keeps recurring events on different days distinct", () => {
    expect(
      isSameCanonicalEvent({
        existing: {
          title: "Oprowadzanie po aktualnych wystawach",
          startAt: new Date("2026-08-15T12:30:00+02:00")
        },
        observed: {
          kind: "point",
          title: "Oprowadzanie po aktualnych wystawach",
          startAt: new Date("2026-08-16T14:00:00+02:00")
        },
        ...market
      })
    ).toBe(false);
  });

  it("keeps separately timed events on the same day distinct", () => {
    expect(
      isSameCanonicalEvent({
        existing: {
          title: "Ghost in the Shell",
          startAt: new Date("2026-08-13T17:30:00+02:00")
        },
        observed: {
          kind: "point",
          title: "Ghost in the Shell",
          startAt: new Date("2026-08-13T20:00:00+02:00")
        },
        ...market
      })
    ).toBe(false);
  });
});
