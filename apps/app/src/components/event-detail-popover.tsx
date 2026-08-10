import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@shared/ui";
import type { SavedEventCard } from "../types/chat-state";

interface EventDetailPopoverProps {
  event: SavedEventCard;
  children: React.ReactNode;
}

function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined
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
    });
    if (!endDate) {
      return formattedStart;
    }
    const formattedEnd = endDate.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    return `${formattedStart} → ${formattedEnd}`;
  } catch {
    return start;
  }
}

export function EventDetailPopover({ event, children }: EventDetailPopoverProps) {
  // Cast gallery from Json to proper type
  const gallery = event.gallery as unknown as { name?: string; main_url?: string } | null;

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
              {formatDateRange(event.start_at, event.end_at)}
            </p>
            {gallery?.name && (
              <p>
                <span className="font-semibold text-[#0140B6]">
                  Gallery:
                </span>{" "}
                {gallery.name}
              </p>
            )}
            {gallery?.main_url && (
              <p>
                <a
                  href={gallery.main_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-[#0140B6] hover:underline"
                >
                  Visit gallery site →
                </a>
              </p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
