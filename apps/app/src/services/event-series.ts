import type {
  EventCardData,
  EventOccurrence,
  EventSchedule
} from "../types/chat-state";

export const DEFAULT_VISIBLE_EVENT_SERIES = 5;

export type EventSeriesInput = Omit<EventCardData, "schedule"> &
  EventOccurrence;

export type EventResultDisplay =
  | { kind: "progressive"; initialCount: number }
  | { kind: "complete" };

function normalizeSeriesTitle(title: string): string {
  return title.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function seriesKey(event: EventSeriesInput): string {
  return [event.gallery.id, normalizeSeriesTitle(event.title)].join("|");
}

function occurrenceKey(occurrence: EventOccurrence): string {
  return [occurrence.start_at, occurrence.end_at ?? ""].join("|");
}

function toOccurrence(event: EventSeriesInput): EventOccurrence {
  return {
    event_id: event.event_id,
    start_at: event.start_at,
    end_at: event.end_at,
    ticket_url: event.ticket_url,
    source_url: event.source_url
  };
}

function mergeValues(values: string[][]): string[] {
  return [...new Set(values.flat().filter(Boolean))];
}

function scheduleFor(occurrences: EventOccurrence[]): EventSchedule {
  if (occurrences.length === 1) {
    return { kind: "single", occurrence: occurrences[0] };
  }
  return { kind: "multiple", occurrences };
}

/**
 * Collapse repeated sessions into one user-facing event without changing the
 * underlying catalogue. A title at another gallery remains a separate event.
 */
export function groupEventSeries(events: EventSeriesInput[]): EventCardData[] {
  const groups = new Map<string, EventSeriesInput[]>();
  for (const event of events) {
    const key = seriesKey(event);
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => {
    const first = group[0];
    const occurrences = [...new Map(
      group.map((event) => {
        const occurrence = toOccurrence(event);
        return [occurrenceKey(occurrence), occurrence] as const;
      })
    ).values()].sort(
      (left, right) => Date.parse(left.start_at) - Date.parse(right.start_at)
    );
    const primary = occurrences[0];
    const description = group
      .map((event) => event.description)
      .filter((value): value is string => Boolean(value?.trim()))
      .sort((left, right) => right.length - left.length)[0] ?? null;

    return {
      event_id: primary.event_id,
      title: first.title,
      description,
      timezone: first.timezone,
      status: first.status,
      schedule: scheduleFor(occurrences),
      artists: mergeValues(group.map((event) => event.artists)),
      tags: mergeValues(group.map((event) => event.tags)),
      images: mergeValues(group.map((event) => event.images)),
      gallery: first.gallery
    };
  });
}

export function eventOccurrences(event: EventCardData): EventOccurrence[] {
  return event.schedule.kind === "single"
    ? [event.schedule.occurrence]
    : event.schedule.occurrences;
}

export function primaryEventOccurrence(
  event: EventCardData
): EventOccurrence {
  return eventOccurrences(event)[0];
}

export function visibleEventSeries(
  events: EventCardData[],
  display: EventResultDisplay,
  expanded: boolean
): EventCardData[] {
  if (display.kind === "complete" || expanded) return events;
  return events.slice(0, display.initialCount);
}
