import type { MarketCode } from "@shared";

const AREA_GROUPS: Record<MarketCode, Record<string, string[]>> = {
  ldn: {
    "east end": [
      "whitechapel",
      "bow",
      "bethnal green",
      "shoreditch",
      "hackney",
      "hoxton",
      "dalston",
      "stratford",
      "mile end"
    ],
    "east london": [
      "whitechapel",
      "bow",
      "bethnal green",
      "shoreditch",
      "hackney",
      "hoxton",
      "dalston",
      "stratford",
      "mile end"
    ],
    "south london": ["peckham", "vauxhall", "south bank", "new cross", "clapham"],
    "west london": ["chelsea", "south kensington", "kensington gardens", "hampstead"],
    "central london": [
      "soho",
      "mayfair",
      "strand",
      "barbican",
      "the mall",
      "trafalgar square",
      "st martin's place",
      "bankside"
    ]
  },
  waw: {
    centrum: ["srodmiescie"],
    "central warsaw": ["srodmiescie"],
    "warsaw centre": ["srodmiescie"],
    srodmiescie: ["srodmiescie"],
    praga: ["praga"],
    "praga polnoc": ["praga"],
    "praga poludnie": ["praga"],
    wola: ["wola"],
    mokotow: ["mokotow"],
    zoliborz: ["zoliborz"],
    ochota: ["ochota"]
  }
};

function normalizeArea(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[łŁ]/g, "l")
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isMarketWideArea(area: string, market: MarketCode): boolean {
  const normalized = normalizeArea(area);
  return market === "ldn"
    ? ["london", "greater london", "all london"].includes(normalized)
    : ["warsaw", "warszawa", "all warsaw", "cala warszawa"].includes(normalized);
}

export function matchesMarketArea(
  candidateArea: string | null,
  requestedArea: string,
  market: MarketCode
): boolean {
  if (!candidateArea) return false;
  if (isMarketWideArea(requestedArea, market)) return true;

  const requested = normalizeArea(requestedArea);
  const candidate = normalizeArea(candidateArea);
  const aliases = AREA_GROUPS[market][requested];
  if (aliases) return aliases.some((alias) => candidate.includes(alias));
  return candidate.includes(requested) || requested.includes(candidate);
}
