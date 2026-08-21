import { describe, expect, it } from "vitest";
import {
  classifyEventSourceUrl,
  resolveObservedSourcePurpose,
  selectEventSourceUrls
} from "../src/source-policy";

describe("event source admission", () => {
  it("selects multilingual same-origin listing and detail links", () => {
    expect(
      selectEventSourceUrls(
        [
          "/wystawy",
          "/wydarzenia/nowa-wystawa",
          "/about",
          "https://other.example/events"
        ],
        "https://gallery.example/"
      )
    ).toEqual([
      {
        url: "https://gallery.example/wystawy",
        kind: "events",
        purpose: "listing",
        score: 100
      },
      {
        url: "https://gallery.example/wydarzenia/nowa-wystawa",
        kind: "other",
        purpose: "detail",
        score: 70
      }
    ]);
  });

  it("rejects archives, pagination, and ephemeral MNW calendar pages", () => {
    const official = "https://www.mnw.art.pl/";
    for (const url of [
      "https://www.mnw.art.pl/wydarzenia/kalendarz-wydarzen/27-08-2026,dzien.html",
      "https://www.mnw.art.pl/wydarzenia/kalendarz-wydarzen/08-2026,miesiac.html",
      "https://www.mnw.art.pl/wystawy/archive",
      "https://www.mnw.art.pl/wystawy/page/2"
    ]) {
      expect(classifyEventSourceUrl(url, official)).toBeNull();
    }
    expect(
      classifyEventSourceUrl("https://www.mnw.art.pl/about", official, {
        kind: "other",
        purpose: "detail"
      })
    ).toBeNull();
  });

  it("canonicalizes and classifies MNW event detail aliases", () => {
    expect(
      classifyEventSourceUrl(
        "https://www.mnw.art.pl/wydarzenia/kalendarz-wydarze%C5%84/9255,wydarzenie.html",
        "https://www.mnw.art.pl/"
      )
    ).toEqual({
      url: "https://www.mnw.art.pl/wydarzenia/kalendarz-wydarzen/9255,wydarzenie.html",
      kind: "other",
      purpose: "detail",
      score: 85
    });
  });

  it("does not let model page labels override deterministic URL policy", () => {
    expect(
      resolveObservedSourcePurpose(
        {
          kind: "other",
          purpose: "detail",
          normalizedUrl:
            "https://www.mnw.art.pl/wydarzenia/kalendarz-wydarzen/9303,wydarzenie.html"
        },
        "calendar"
      )
    ).toBe("detail");
    expect(
      resolveObservedSourcePurpose(
        {
          kind: "events",
          purpose: "listing",
          normalizedUrl: "https://www.mnw.art.pl/wystawy"
        },
        "event"
      )
    ).toBe("listing");
  });

  it("hard-caps deterministic navigation discovery", () => {
    const links = Array.from(
      { length: 30 },
      (_, index) => `https://gallery.example/events/show-${index}`
    );
    expect(selectEventSourceUrls(links, "https://gallery.example/", 8)).toHaveLength(
      8
    );
  });
});
