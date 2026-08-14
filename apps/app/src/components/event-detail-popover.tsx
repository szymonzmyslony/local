import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@shared/ui";
import {
  eventOccurrences,
  primaryEventOccurrence
} from "../services/event-series";
import type { SavedEventCard } from "../types/chat-state";

interface EventDetailPopoverProps {
  event: SavedEventCard;
  children: React.ReactNode;
}

function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
  timezone: string
): string {
  if (!start) {
    return "Date to be announced";
  }
  try {
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : null;
    const formattedStart = startDate.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone
    });
    if (!endDate) {
      return formattedStart;
    }
    const formattedEnd = endDate.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone
    });
    return `${formattedStart} → ${formattedEnd}`;
  } catch {
    return start;
  }
}

export function EventDetailPopover({ event, children }: EventDetailPopoverProps) {
  const occurrences = eventOccurrences(event);
  const primaryOccurrence = primaryEventOccurrence(event);
  const primaryLink =
    primaryOccurrence.ticket_url ??
    primaryOccurrence.source_url ??
    event.gallery.main_url;

  return (
    <Popover>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-96 border-[#0140B6]/30 bg-white p-0" side="right" align="start">
        <div className="space-y-4 p-4">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-[#0140B6]">
              {event.title}
            </p>
          </div>
          {event.description && (
            <p className="text-xs leading-relaxed text-[#161A23]">
              {event.description}
            </p>
          )}
          <div className="space-y-1.5 text-xs text-[#161A23]/75">
            <p>
              <span className="font-semibold text-[#0140B6]">
                When:
              </span>{" "}
              {formatDateRange(
                primaryOccurrence.start_at,
                primaryOccurrence.end_at,
                event.timezone
              )}
            </p>
            {occurrences.length > 1 ? (
              <div>
                <span className="font-semibold text-[#0140B6]">
                  Other dates:
                </span>{" "}
                {occurrences
                  .slice(1, 8)
                  .map((occurrence) =>
                    formatDateRange(
                      occurrence.start_at,
                      occurrence.end_at,
                      event.timezone
                    )
                  )
                  .join(" · ")}
                {occurrences.length > 8
                  ? ` · ${occurrences.length - 8} more`
                  : ""}
              </div>
            ) : null}
            {event.gallery.name && (
              <p>
                <span className="font-semibold text-[#0140B6]">
                  Gallery:
                </span>{" "}
                {event.gallery.name}
              </p>
            )}
            {event.gallery.area && (
              <p>
                <span className="font-semibold text-[#0140B6]">
                  Area:
                </span>{" "}
                {event.gallery.area}
              </p>
            )}
            {primaryLink && (
              <p>
                <a
                  href={primaryLink}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-[#0140B6] hover:underline"
                >
                  Open event details →
                </a>
              </p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
