import { useState } from "react";
import { Bookmark, PanelLeft } from "lucide-react";
import type { SavedEventCard } from "../types/chat-state";
import { EventDetailPopover } from "./event-detail-popover";

interface SidebarLayoutProps {
  children: React.ReactNode;
  savedEvents: SavedEventCard[];
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const date = new Date(value);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function SidebarLayout({
  children,
  savedEvents,
}: SidebarLayoutProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="flex h-screen w-full bg-neutral-50 dark:bg-neutral-950">
      {/* Collapsible sidebar */}
      <aside
        className={`
          border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950
          flex flex-col transition-all duration-300 ease-in-out
          ${isOpen ? 'w-64' : 'w-12'}
        `}
      >
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <PanelLeft className="h-4 w-4 text-slate-700 dark:text-slate-300" />
          </button>
          {isOpen && (
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 ml-2">
              <Bookmark className="h-5 w-5" />
              <h2 className="font-semibold text-sm">Saved Events</h2>
            </div>
          )}
        </div>

        {isOpen && (
          <div className="flex-1 overflow-y-auto p-2">
            {savedEvents.length > 0 ? (
              <div className="space-y-1">
                {savedEvents.map((event) => (
                  <EventDetailPopover key={event.event_id} event={event}>
                    <button className="w-full text-left rounded-lg px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-2">
                        {event.title}
                      </div>
                      {event.gallery?.name && (
                        <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 truncate">
                          {event.gallery.name}
                        </div>
                      )}
                      {event.start_at && (
                        <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                          {formatDate(event.start_at)}
                        </div>
                      )}
                    </button>
                  </EventDetailPopover>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">
                Events you save will appear here
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Main content - takes remaining space */}
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}
