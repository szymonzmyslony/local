import type { DynamicToolUIPart, ToolUIPart } from "ai";
import { getToolName } from "ai";
import {
  DEFAULT_VISIBLE_EVENT_SERIES,
  eventOccurrences
} from "../../services/event-series";
import type { SavedEventCard } from "../../types/chat-state";
import type { EventToolResult, GalleryToolResult } from "../../types/tool-results";
import { EventCards } from "./event-cards";
import { GalleryCards } from "./gallery-cards";
import { JsonDisplay } from "./json-display";

interface ToolResultProps {
  part: ToolUIPart | DynamicToolUIPart;
  onSaveToZine?: (event: SavedEventCard) => void;
  debugMode: boolean;
}

export function ToolResult({ part, onSaveToZine, debugMode }: ToolResultProps) {
  // Only render if output is available and no error
  if (part.state !== "output-available" || part.errorText) {
    return null;
  }

  const toolName = getToolName(part);
  const output = part.output;
  const outputType =
    output && typeof output === "object" && "type" in output
      ? output.type
      : null;
  const isUserFacingResult =
    outputType === "event-results" || outputType === "gallery-results";

  // Intermediate tool output is useful in diagnostics, not in consumer chat.
  if (!debugMode && !isUserFacingResult) {
    return null;
  }

  // Handle event results (from get_gallery_events)
  if (output && typeof output === "object" && "type" in output && output.type === "event-results") {
    const eventResult = output as EventToolResult;
    const count = eventResult.events.length;
    const occurrenceCount = eventResult.events.reduce(
      (total, event) => total + eventOccurrences(event).length,
      0
    );

    if (count === 0) {
      return (
        <div className="mt-2 rounded-lg border border-[#0140B6]/25 bg-[#F1F5FF] px-3 py-2">
          <p className="text-xs text-[#0140B6]">
            No current events found for those filters
          </p>
        </div>
      );
    }

    return (
      <div className="mt-2">
        <p className="mb-2 text-xs text-[#0140B6]">
          Found {count} {count === 1 ? "event" : "events"}
          {occurrenceCount > count ? ` across ${occurrenceCount} dates` : ""}
        </p>
        <EventCards
          events={eventResult.events}
          display={
            eventResult.display ?? {
              kind: "progressive",
              initialCount: DEFAULT_VISIBLE_EVENT_SERIES
            }
          }
          onSaveToZine={onSaveToZine}
        />
      </div>
    );
  }

  // Handle match_gallery results
  if (output && typeof output === "object" && "type" in output && output.type === "gallery-results") {
    const galleryResult = output as GalleryToolResult;
    const count = galleryResult.items.length;

    if (count === 0) {
      return (
        <div className="mt-2 rounded-lg border border-[#0140B6]/25 bg-[#F1F5FF] px-3 py-2">
          <p className="text-xs text-[#0140B6]">
            No galleries found matching your criteria
          </p>
        </div>
      );
    }

    return (
      <div className="mt-2">
        <p className="mb-2 text-xs text-[#0140B6]">
          Found {count} {count === 1 ? "gallery" : "galleries"}
        </p>
        <GalleryCards galleries={galleryResult.items} />
      </div>
    );
  }

  // Default: display JSON output for other tools (search results, etc.)
  if (output && typeof output === "object") {
    return <JsonDisplay data={output} title={toolName} defaultExpanded={false} />;
  }

  return null;
}
