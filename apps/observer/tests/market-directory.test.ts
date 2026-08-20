import { describe, expect, it } from "vitest";
import {
  listDirectoryEntryUrls,
  officialSiteHost,
  parseDirectoryEntry,
  selectDirectoryEntryBatch
} from "../src/market-directory";

describe("market directory discovery", () => {
  it("deduplicates and validates London directory entry links", () => {
    expect(
      listDirectoryEntryUrls(
        "ldn",
        [
          '<a href="/galleries/one/">One</a>',
          '<a href="/galleries/one/?tracking=1">Duplicate</a>',
          '<a href="/exhibitors/two/">Two</a>',
          '<a href="https://other.example/galleries/three/">Other</a>'
        ].join("\n")
      )
    ).toEqual([
      "https://londongalleryweekend.art/exhibitors/two/",
      "https://londongalleryweekend.art/galleries/one/"
    ]);
  });

  it("extracts a Warsaw official site and Warsaw address", () => {
    const parsed = parseDirectoryEntry(
      "waw",
      [
        '<a href="https://www.instagram.com/warsawgalleryweekend/">WGW</a>',
        "<h1>Centrala Gallery</h1>",
        "<div>",
        "<p>Centrala Gallery</p>",
        "<p>Wilcza 60</p>",
        "<p>Warszawa</p>",
        "<p>00-679</p>",
        "</div>",
        '<a href="https://www.centrala.art/?utm_source=wgw">Website</a>'
      ].join("\n"),
      "https://warsawgalleryweekend.pl/en/venues/centrala-gallery"
    );

    expect(parsed).toEqual({
      kind: "candidate",
      candidate: {
        name: "Centrala Gallery",
        officialUrl: "https://www.centrala.art/",
        entryUrl:
          "https://warsawgalleryweekend.pl/en/venues/centrala-gallery",
        location: {
          kind: "address_only",
          address: "Wilcza 60, 00-679 Warsaw"
        }
      }
    });
  });

  it("does not register Instagram-only or non-Warsaw venue entries", () => {
    expect(
      parseDirectoryEntry(
        "waw",
        [
          "<h1>Fundacja Alina</h1>",
          "<div><p>Fundacja Alina</p><p>Brzozowa 31</p><p>Warszawa</p><p>00-250</p></div>",
          '<a href="https://www.instagram.com/fundacjaalina">Instagram</a>'
        ].join(""),
        "https://warsawgalleryweekend.pl/en/venues/fundacja-alina"
      )
    ).toEqual({
      kind: "skipped",
      reason: "no_dedicated_official_site"
    });

    expect(
      parseDirectoryEntry(
        "waw",
        [
          "<h1>Outside Gallery</h1>",
          "<div><p>Outside Gallery</p><p>Main Street 1</p><p>Poznan</p><p>60-001</p></div>",
          '<a href="https://outside.example/">Website</a>'
        ].join(""),
        "https://warsawgalleryweekend.pl/en/venues/outside-gallery"
      )
    ).toEqual({ kind: "skipped", reason: "outside_market" });
  });

  it("accepts Warsaw addresses with the postal code before the city", () => {
    const parsed = parseDirectoryEntry(
      "waw",
      [
        "<h1>Consonni Radziszewski</h1>",
        "<div><p>Gallery</p><p>Kolejowa 47a/U13</p><p>01-210</p><p>Warszawa</p></div>",
        '<a href="https://gallery.example/">Website</a>'
      ].join(""),
      "https://warsawgalleryweekend.pl/en/venues/consonni-radziszewski"
    );

    expect(parsed.kind).toBe("candidate");
    if (parsed.kind === "candidate") {
      expect(parsed.candidate.location).toEqual({
        kind: "address_only",
        address: "Kolejowa 47a/U13, 01-210 Warsaw"
      });
    }
  });

  it("keeps weekly batches deterministic and supports a bounded full pass", () => {
    const entries = Array.from(
      { length: 57 },
      (_, index) => `https://directory.example/venues/${index}`
    );
    const now = Date.parse("2026-08-20T12:00:00Z");
    expect(selectDirectoryEntryBatch(entries, "weekly_batch", now)).toHaveLength(
      20
    );
    expect(selectDirectoryEntryBatch(entries, "weekly_batch", now)).toEqual(
      selectDirectoryEntryBatch(entries, "weekly_batch", now)
    );
    expect(selectDirectoryEntryBatch(entries, "full", now)).toHaveLength(57);
    expect(officialSiteHost("https://www.Example.com/path")).toBe(
      "example.com"
    );
  });
});
