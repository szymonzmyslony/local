import { useState } from "react";
import { Button } from "@shared/ui";
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
    <div className="flex-shrink-0 w-[340px] h-full rounded-2xl p-6 bg-gradient-to-br from-[#f8faff] to-[#ecefff] shadow-sm hover:shadow-md transition-all duration-200">
      <h2 className="text-sm font-semibold text-gray-900">{event.title}</h2>

      {locationLabel && (
        <p className="text-xs text-gray-600 mt-1">{locationLabel}</p>
      )}

      <div className="mt-3">
        <p
          className={`text-xs text-gray-700 leading-relaxed ${
            !isExpanded && needsTruncation ? "line-clamp-6" : ""
          }`}
        >
          {description}
        </p>
        {needsTruncation && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-gray-600 hover:text-gray-900 mt-1 font-medium"
          >
            {isExpanded ? "read less" : "read more"}
          </button>
        )}
      </div>

      <div className="flex gap-2 mt-4">
        {primaryLink && (
          <button
            onClick={(e) => {
              e.preventDefault();
              window.open(primaryLink, "_blank", "noopener,noreferrer");
            }}
            className="bg-white text-gray-900 px-3 py-1.5 rounded-xl hover:bg-gray-50 transition text-xs font-medium"
          >
            visit gallery
          </button>
        )}
        <button
          onClick={() => {
            if (onSaveToZine) {
              onSaveToZine(event);
            }
          }}
          disabled={!onSaveToZine}
          className="bg-gradient-to-r from-[#ececff] to-[#e8eaff] text-gray-900 px-3 py-1.5 rounded-xl hover:scale-105 transition text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          save to My Zine
        </button>
        <button
          onClick={() => {
            // TODO: Implement share as image functionality
          }}
          className="bg-white text-gray-900 px-3 py-1.5 rounded-xl hover:bg-gray-50 transition text-xs font-medium"
        >
          share
        </button>
      </div>
    </div>
  );
}
