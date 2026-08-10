import { useState } from "react";
import { PanelLeft } from "lucide-react";
import type { SavedEventCard } from "../types/chat-state";
import { EventDetailPopover } from "./event-detail-popover";

interface SidebarLayoutProps {
  children: React.ReactNode;
  savedEvents: SavedEventCard[];
}

export function SidebarLayout({ children, savedEvents }: SidebarLayoutProps) {
  const [isOpen, setIsOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 768
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white text-[#161A23]">
      {/* Collapsible sidebar */}
      <aside
        className={`
          border-r border-[#0140B6]/25 bg-white
          flex flex-col transition-all duration-300 ease-in-out
          ${isOpen ? "w-[280px]" : "w-14"}
        `}
      >
        <div className={`flex min-h-16 items-center border-b border-[#0140B6]/20 p-3 ${isOpen ? "justify-between" : "justify-center"}`}>
          {isOpen && (
            <a href="https://zinelocal.com" className="text-[17px] font-bold tracking-[-0.03em] text-[#0140B6]">
              ZINE LOCAL
            </a>
          )}
          <button
            type="button"
            aria-label={isOpen ? "Collapse saved events" : "Expand saved events"}
            onClick={() => setIsOpen(!isOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-[#0140B6] transition-colors hover:border-[#0140B6]/30 hover:bg-[#F1F5FF]"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        </div>

        {isOpen && (
          <div className="zine-scrollbar flex-1 overflow-y-auto p-4">
            <div className="mb-4 flex items-center justify-between border-b border-[#0140B6]/20 pb-3">
              <h2 className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#0140B6]">
                Saved events
              </h2>
              <span className="font-mono text-[10px] text-[#0140B6]/60">{String(savedEvents.length).padStart(2, "0")}</span>
            </div>
            {savedEvents.length > 0 ? (
              <div className="space-y-2">
                {savedEvents.map((event) => {
                  const gallery = event.gallery as unknown as { name?: string } | null;
                  return (
                    <EventDetailPopover key={event.event_id} event={event}>
                      <button type="button" className="w-full rounded-lg border border-[#0140B6]/20 px-3 py-3 text-left transition-colors hover:border-[#0140B6] hover:bg-[#F1F5FF]">
                        <div className="line-clamp-2 text-xs font-medium text-[#161A23]">
                          {event.title}
                        </div>
                        {gallery?.name && (
                          <div className="mt-1 truncate text-[10px] uppercase tracking-[0.08em] text-[#0140B6]">
                            {gallery.name}
                          </div>
                        )}
                      </button>
                    </EventDetailPopover>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-5">
                <p className="max-w-[150px] text-center text-xs leading-relaxed text-[#0140B6]/65">
                  Save anything that feels worth coming back to.
                </p>
              </div>
            )}
            <a
              href="https://zinelocal.com"
              className="mt-6 inline-flex text-[10px] uppercase tracking-[0.16em] text-[#0140B6] hover:underline"
            >
              Back to the guide ↗
            </a>
          </div>
        )}
      </aside>

      {/* Main content - takes remaining space */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
