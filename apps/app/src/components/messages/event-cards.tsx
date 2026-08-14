import { ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import { useState } from "react";
import {
  type EventResultDisplay,
  eventOccurrences,
  primaryEventOccurrence,
  visibleEventSeries
} from "../../services/event-series";
import type { SavedEventCard } from "../../types/chat-state";

interface EventCardsProps {
  events: SavedEventCard[];
  display: EventResultDisplay;
  onSaveToZine?: (event: SavedEventCard) => void;
}

function formatEventDate(
  start: string,
  end: string | null,
  timezone: string
): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    year: "numeric"
  });
  const startLabel = formatter.format(new Date(start));
  if (!end) return startLabel;
  const endLabel = formatter.format(new Date(end));
  return startLabel === endLabel ? startLabel : `${startLabel} — ${endLabel}`;
}

export function sanitizeEventUrl(value: string): string {
  return value.replace(/%20%22Open%20.*%22$/i, "");
}

function formatEventSchedule(event: SavedEventCard): string {
  const occurrences = eventOccurrences(event);
  const first = occurrences[0];
  const firstDate = formatEventDate(
    first.start_at,
    first.end_at,
    event.timezone
  );
  const remaining = occurrences.length - 1;
  return remaining > 0
    ? `${firstDate} · ${remaining} more ${remaining === 1 ? "date" : "dates"}`
    : firstDate;
}

export function EventCards({
  events,
  display,
  onSaveToZine
}: EventCardsProps) {
  const [expanded, setExpanded] = useState(false);
  if (events.length === 0) return null;
  const visibleEvents = visibleEventSeries(events, display, expanded);
  const hiddenCount = events.length - visibleEvents.length;

  return (
    <div className="w-full">
      <div className="zine-scrollbar -mx-4 flex items-start gap-3 overflow-x-auto px-4 pb-3">
        {visibleEvents.map((event) => (
          <EventCard
            key={event.event_id}
            event={event}
            onSaveToZine={onSaveToZine}
          />
        ))}
      </div>
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="cursor-pointer text-xs font-medium text-[#0140B6] hover:underline"
        >
          Show {hiddenCount} more
        </button>
      ) : display.kind === "progressive" && events.length > display.initialCount ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="cursor-pointer text-xs font-medium text-[#0140B6] hover:underline"
        >
          Show fewer
        </button>
      ) : null}
    </div>
  );
}

interface EventCardProps {
  event: SavedEventCard;
  onSaveToZine?: (event: SavedEventCard) => void;
}

function EventCard({ event, onSaveToZine }: EventCardProps) {
  const primaryOccurrence = primaryEventOccurrence(event);
  const rawPrimaryLink =
    primaryOccurrence.ticket_url ??
    primaryOccurrence.source_url ??
    event.gallery.main_url;
  const primaryLink = rawPrimaryLink ? sanitizeEventUrl(rawPrimaryLink) : "";
  const primaryLabel = primaryOccurrence.ticket_url
    ? "booking / details"
    : "event details";
  const location = [event.gallery.name, event.gallery.area]
    .filter((value): value is string => Boolean(value))
    .join(" · ");

  return (
    <article className="flex w-[300px] flex-shrink-0 flex-col rounded-lg border border-[#0140B6]/30 bg-white p-4 transition-colors hover:border-[#0140B6]">
      <div className="flex-1">
        <p className="text-[9px] uppercase tracking-[0.18em] text-[#0140B6]/60">
          Exhibition / event
        </p>
        <h2 className="mt-2 text-base font-semibold leading-tight text-[#0140B6]">
          {event.title}
        </h2>

        <div className="mt-4 space-y-2 text-xs text-[#0140B6]">
          <p className="flex items-start gap-2">
            <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{formatEventSchedule(event)}</span>
          </p>
          {location ? (
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="line-clamp-2">
                {location}
                {event.gallery.address ? ` · ${event.gallery.address}` : ""}
              </span>
            </p>
          ) : null}
        </div>

        {event.description ? (
          <p className="mt-4 line-clamp-3 text-xs leading-relaxed text-[#161A23]/80">
            {event.description}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex items-center gap-2">
        {primaryLink ? (
          <a
            href={primaryLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-[#0140B6] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#0140B6]/85"
          >
            {primaryLabel}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        ) : null}
        <button
          type="button"
          onClick={() => onSaveToZine?.(event)}
          disabled={!onSaveToZine}
          className="cursor-pointer rounded-md border border-[#0140B6] bg-white px-3 py-2 text-xs font-medium text-[#0140B6] transition hover:bg-[#F1F5FF] disabled:cursor-not-allowed disabled:opacity-40"
        >
          save
        </button>
      </div>
    </article>
  );
}
