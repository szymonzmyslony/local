import { useState } from "react";
import { Button } from "@shared/ui";
import { ArrowUpRight } from "lucide-react";
import type { EventMatchItem } from "../../types/tool-results";

interface EventCardsProps {
  events: EventMatchItem[];
  onSaveToZine?: (event: EventMatchItem) => void;
}

export function EventCards({ events, onSaveToZine }: EventCardsProps) {
  if (events.length === 0) {
    return null;
  }

  const limitedEvents = events.slice(0, 5);

  return (
    <div className="w-full">
      <div className="flex gap-3 overflow-x-auto pb-3 -mx-4 px-4 items-stretch">
        {limitedEvents.map((event) => (
          <EventCard
            key={event.event_id}
            event={event}
            onSaveToZine={onSaveToZine}
          />
        ))}
      </div>
      {events.length > 5 && (
        <p className="text-[10px] text-slate-400 text-center mt-1.5">
          Showing top 5 of {events.length} results
        </p>
      )}
    </div>
  );
}

interface EventCardProps {
  event: EventMatchItem;
  onSaveToZine?: (event: EventMatchItem) => void;
}

function EventCard({ event, onSaveToZine }: EventCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const locationLabel =
    event.gallery?.name ??
    event.gallery?.normalized_main_url ??
    event.gallery?.main_url ??
    null;

  const description =
    event.description ?? "No description available for this event.";

  const primaryLink = event.gallery?.main_url ?? null;
  const needsTruncation = description.length > 200;

  return (
    <div className="flex-shrink-0 w-[340px] h-[360px] flex flex-col rounded-xl p-6 bg-gradient-to-br from-[#f8faff] to-[#ecefff] shadow-sm hover:shadow-md transition-all duration-200">
      <div className="flex-1">
        <h2 className="text-lg font-semibold text-primary font-heading">
          {event.title}
        </h2>

        {locationLabel && primaryLink && (
          <a
            href={primaryLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary mt-1 transition"
          >
            {locationLabel}
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        )}

        <div className="mt-3">
          <p
            className={`text-xs text-text-secondary leading-relaxed ${
              !isExpanded && needsTruncation ? "line-clamp-6" : ""
            }`}
          >
            {description}
          </p>
          {needsTruncation && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-text-tertiary hover:text-text-primary mt-1 font-medium"
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
          className="px-3 py-1 text-xs font-medium border-primary text-primary rounded-md hover:bg-primary/10 transition disabled:opacity-50"
        >
          Save
        </Button>
        <Button
          onClick={() => {
            // TODO: Implement share as image functionality
          }}
          variant="primary"
          size="sm"
          className="px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-dark transition"
        >
          Share
        </Button>
      </div>
    </div>
  );
}
