const LONDON_AREA_GROUPS: Record<string, string[]> = {
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
    "st martin’s place",
    "bankside"
  ]
};

export function isLondonWideArea(area: string): boolean {
  const normalized = area.trim().toLowerCase();
  return (
    normalized === "london" ||
    normalized === "greater london" ||
    normalized === "all london"
  );
}

export function matchesLondonArea(
  candidateArea: string | null,
  requestedArea: string
): boolean {
  if (!candidateArea) return false;
  if (isLondonWideArea(requestedArea)) return true;

  const requested = requestedArea.trim().toLowerCase();
  const candidate = candidateArea.trim().toLowerCase();
  const aliases = LONDON_AREA_GROUPS[requested];
  if (aliases) return aliases.some((alias) => candidate.includes(alias));
  return candidate.includes(requested) || requested.includes(candidate);
}
