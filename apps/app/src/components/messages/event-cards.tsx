import { useState } from "react";
import { ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import type { SavedEventCard } from "../../types/chat-state";

interface EventCardsProps {
  events: SavedEventCard[];
  onSaveToZine?: (event: SavedEventCard) => void;
}

function formatEventDate(start: string, end: string | null): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
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

export function EventCards({ events, onSaveToZine }: EventCardsProps) {
  if (events.length === 0) return null;

  return (
    <div className="w-full">
      <div className="zine-scrollbar -mx-4 flex items-stretch gap-3 overflow-x-auto px-4 pb-3">
        {events.map((event) => (
          <EventCard
            key={event.event_id}
            event={event}
            onSaveToZine={onSaveToZine}
          />
        ))}
      </div>
    </div>
  );
}

interface EventCardProps {
  event: SavedEventCard;
  onSaveToZine?: (event: SavedEventCard) => void;
}

function EventCard({ event, onSaveToZine }: EventCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const description = event.description ?? "Description not yet listed.";
  const needsTruncation = description.length > 180;
  const rawPrimaryLink =
    event.ticket_url ?? event.source_url ?? event.gallery.main_url;
  const primaryLink = rawPrimaryLink ? sanitizeEventUrl(rawPrimaryLink) : "";
  const primaryLabel = event.ticket_url ? "booking / details" : "event details";
  const location = [event.gallery.name, event.gallery.area]
    .filter((value): value is string => Boolean(value))
    .join(" · ");

  return (
    <article className="flex min-h-[330px] w-[340px] flex-shrink-0 flex-col rounded-lg border border-[#0140B6]/30 bg-white p-5 transition-colors hover:border-[#0140B6]">
      <div className="flex-1">
        <p className="text-[9px] uppercase tracking-[0.18em] text-[#0140B6]/60">
          Exhibition / event
        </p>
        <h2 className="mt-2 text-lg font-semibold leading-tight text-[#0140B6]">
          {event.title}
        </h2>

        <div className="mt-4 space-y-2 text-xs text-[#0140B6]">
          <p className="flex items-start gap-2">
            <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{formatEventDate(event.start_at, event.end_at)}</span>
          </p>
          {location ? (
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {location}
                {event.gallery.address ? ` · ${event.gallery.address}` : ""}
              </span>
            </p>
          ) : null}
        </div>

        <div className="mt-4">
          <p
            className={`text-xs leading-relaxed text-[#161A23]/80 ${
              !isExpanded && needsTruncation ? "line-clamp-4" : ""
            }`}
          >
            {description}
          </p>
          {needsTruncation ? (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-1 text-xs font-medium text-[#0140B6] hover:underline"
            >
              {isExpanded ? "read less" : "read more"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2">
        {primaryLink ? (
          <a
            href={primaryLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md bg-[#0140B6] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#0140B6]/85"
          >
            {primaryLabel}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        ) : null}
        <button
          type="button"
          onClick={() => onSaveToZine?.(event)}
          disabled={!onSaveToZine}
          className="rounded-md border border-[#0140B6] bg-white px-3 py-2 text-xs font-medium text-[#0140B6] transition hover:bg-[#F1F5FF] disabled:opacity-40"
        >
          save
        </button>
      </div>
    </article>
  );
}
