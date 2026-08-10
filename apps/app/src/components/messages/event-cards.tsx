import { useState } from "react";
import { Button } from "@shared/ui";
import { ArrowUpRight } from "lucide-react";
import type { SavedEventCard } from "@/types/chat-state";

interface EventCardsProps {
  events: SavedEventCard[];
  onSaveToZine?: (event: SavedEventCard) => void;
}

export function EventCards({ events, onSaveToZine }: EventCardsProps) {
  if (events.length === 0) {
    return null;
  }

  const limitedEvents = events.slice(0, 5);

  return (
    <div className="w-full">
      <div className="zine-scrollbar -mx-4 flex items-stretch gap-3 overflow-x-auto px-4 pb-3">
        {limitedEvents.map((event) => (
          <EventCard
            key={event.event_id}
            event={event}
            onSaveToZine={onSaveToZine}
          />
        ))}
      </div>
      {events.length > 5 && (
        <p className="mt-1.5 text-center font-mono text-[10px] text-[#0140B6]/55">
          Showing top 5 of {events.length} results
        </p>
      )}
    </div>
  );
}

interface EventCardProps {
  event: SavedEventCard;
  onSaveToZine?: (event: SavedEventCard) => void;
}

function EventCard({ event, onSaveToZine }: EventCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Cast gallery from Json to proper type
  const gallery = event.gallery as unknown as { name?: string; main_url?: string; normalized_main_url?: string } | null;

  const locationLabel =
    gallery?.name ??
    gallery?.normalized_main_url ??
    gallery?.main_url ??
    null;

  const description =
    event.description ?? "No description available for this event.";

  const primaryLink = gallery?.main_url ?? null;
  const needsTruncation = description.length > 200;

  return (
    <div className="flex h-[360px] w-[340px] flex-shrink-0 flex-col rounded-lg border border-[#0140B6]/30 bg-[#F1F5FF] p-6 transition-all duration-200 hover:border-[#0140B6]">
      <div className="flex-1">
        <p className="mb-3 text-[9px] uppercase tracking-[0.18em] text-[#0140B6]/60">Event</p>
        <h2 className="text-lg font-semibold leading-tight text-[#0140B6]">
          {event.title}
        </h2>

        {locationLabel && primaryLink && (
          <a
            href={primaryLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center gap-1 text-xs text-[#0140B6]/70 transition hover:text-[#0140B6] hover:underline"
          >
            {locationLabel}
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        )}

        <div className="mt-3">
          <p
            className={`text-xs leading-relaxed text-[#161A23]/80 ${!isExpanded && needsTruncation ? "line-clamp-6" : ""
              }`}
          >
            {description}
          </p>
          {needsTruncation && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-1 text-xs font-medium text-[#0140B6] hover:underline"
            >
              {isExpanded ? "read less" : "read more"}
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <Button
          onClick={() => {
            if (onSaveToZine) {
              onSaveToZine(event);
            }
          }}
          disabled={!onSaveToZine}
          variant="outline"
          size="sm"
          className="rounded-md border-[#0140B6] bg-white px-3 py-2 text-xs font-medium text-[#0140B6] transition hover:bg-[#0140B6] hover:text-white disabled:opacity-50"
        >
          Save
        </Button>
        <Button
          onClick={() => {
            // TODO: Implement share as image functionality
          }}
          variant="primary"
          size="sm"
          className="rounded-md bg-[#161A23] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#0140B6]"
        >
          Share
        </Button>
      </div>
    </div>
  );
}
