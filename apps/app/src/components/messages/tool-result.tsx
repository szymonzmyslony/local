import type { ToolUIPart } from "ai";
import { getToolName } from "ai";
import { EventCards } from "./event-cards";
import { GalleryCards } from "./gallery-cards";
import { JsonDisplay } from "./json-display";
import type { EventMatchItem, EventToolResult, GalleryToolResult, CombinedToolResult } from "../../types/tool-results";

interface ToolResultProps {
  part: ToolUIPart;
  onSaveToZine?: (event: EventMatchItem) => void;
}

export function ToolResult({ part, onSaveToZine }: ToolResultProps) {
  // Only render if output is available and no error
  if (part.state !== "output-available" || part.errorText) {
    return null;
  }

  const toolName = getToolName(part);
  const output = part.output;

  // Handle combined results (both events and galleries)
  if (output && typeof output === "object" && "type" in output && output.type === "combined-results") {
    const combinedResult = output as CombinedToolResult;
    const eventCount = combinedResult.events.length;
    const galleryCount = combinedResult.galleries.length;

    return (
      <div className="mt-2 space-y-4">
        {eventCount > 0 && (
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
              Found {eventCount} event{eventCount === 1 ? "" : "s"}
            </p>
            <EventCards events={combinedResult.events} onSaveToZine={onSaveToZine} />
          </div>
        )}
        {galleryCount > 0 && (
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
              Found {galleryCount} {galleryCount === 1 ? "gallery" : "galleries"}
            </p>
            <GalleryCards galleries={combinedResult.galleries} />
          </div>
        )}
      </div>
    );
  }

  // Handle match_event results
  if (output && typeof output === "object" && "type" in output && output.type === "event-results") {
    const eventResult = output as EventToolResult;
    const count = eventResult.items.length;

    if (count === 0) {
      return (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            No events found matching your criteria
          </p>
        </div>
      );
    }

    return (
      <div className="mt-2">
        <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
          Found {count} event{count === 1 ? "" : "s"}
        </p>
        <EventCards events={eventResult.items} onSaveToZine={onSaveToZine} />
      </div>
    );
  }

  // Handle match_gallery results
  if (output && typeof output === "object" && "type" in output && output.type === "gallery-results") {
    const galleryResult = output as GalleryToolResult;
    const count = galleryResult.items.length;

    if (count === 0) {
      return (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            No galleries found matching your criteria
          </p>
        </div>
      );
    }

    return (
      <div className="mt-2">
        <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
          Found {count} {count === 1 ? "gallery" : "galleries"}
        </p>
        <GalleryCards galleries={galleryResult.items} />
      </div>
    );
  }

  // Handle update_user_requirements
  if (toolName === "update_user_requirements") {
    // Check various success indicators
    const isSuccess =
      (output && typeof output === "object" && (
        ("success" in output && output.success) ||
        ("updated" in output && output.updated)
      )) || output !== null;

    if (isSuccess) {
      return (
        <div className="mt-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 dark:border-green-700 dark:bg-green-900/20">
          <p className="text-xs text-green-700 dark:text-green-400">
            ✓ Preferences updated successfully
          </p>
        </div>
      );
    }

    return (
      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Preferences update completed
        </p>
      </div>
    );
  }

  // Default: display JSON output for other tools (search results, etc.)
  if (output && typeof output === "object") {
    return <JsonDisplay data={output} title={toolName} defaultExpanded={false} />;
  }

  return null;
}
