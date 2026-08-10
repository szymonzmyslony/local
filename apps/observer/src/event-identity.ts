export type ObservedEventIdentity =
  | { kind: "point"; title: string; startAt: Date }
  | { kind: "range"; title: string; startAt: Date; endAt: Date };

export type ExistingEventIdentity = {
  title: string;
  startAt: Date;
};

export function normalizeEventTitle(title: string, locale: string): string {
  return title
    .normalize("NFKC")
    .trim()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase(locale);
}

export function eventMatchToleranceMs(observed: ObservedEventIdentity): number {
  return observed.kind === "range"
    ? 36 * 60 * 60 * 1000
    : 24 * 60 * 60 * 1000;
}

function localParts(date: Date, timezone: string): Record<string, string> {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((parts, part) => {
      if (part.type !== "literal") parts[part.type] = part.value;
      return parts;
    }, {});
}

export function isSameCanonicalEvent(input: {
  existing: ExistingEventIdentity;
  observed: ObservedEventIdentity;
  locale: string;
  timezone: string;
}): boolean {
  if (
    normalizeEventTitle(input.existing.title, input.locale) !==
    normalizeEventTitle(input.observed.title, input.locale)
  ) {
    return false;
  }

  const difference = Math.abs(
    input.existing.startAt.valueOf() - input.observed.startAt.valueOf()
  );
  if (difference <= 60 * 60 * 1000) return true;
  if (input.observed.kind === "range") {
    return difference <= eventMatchToleranceMs(input.observed);
  }
  if (difference > eventMatchToleranceMs(input.observed)) return false;

  const existingLocal = localParts(input.existing.startAt, input.timezone);
  const observedLocal = localParts(input.observed.startAt, input.timezone);
  const sameLocalDay =
    existingLocal.year === observedLocal.year &&
    existingLocal.month === observedLocal.month &&
    existingLocal.day === observedLocal.day;
  const eitherDateOnly =
    (existingLocal.hour === "00" && existingLocal.minute === "00") ||
    (observedLocal.hour === "00" && observedLocal.minute === "00");
  return sameLocalDay && eitherDateOnly;
}
