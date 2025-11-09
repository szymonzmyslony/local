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
  return (
    <Popover>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" side="right" align="start">
        <div className="space-y-4 p-4">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {event.title}
            </p>
          </div>
          {event.description && (
            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
              {event.description}
            </p>
          )}
          <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
            <p>
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                When:
              </span>{" "}
              {formatDateRange(event.start_at, event.end_at)}
            </p>
            {event.gallery?.name && (
              <p>
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  Gallery:
                </span>{" "}
                {event.gallery.name}
              </p>
            )}
            {event.gallery?.main_url && (
              <p>
                <a
                  href={event.gallery.main_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-[#D8D3FA] hover:underline dark:text-[#D8D3FA]"
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
