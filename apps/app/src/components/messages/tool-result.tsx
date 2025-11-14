import type { ToolUIPart } from "ai";
import { getToolName } from "ai";
import { EventCards } from "./event-cards";
import { GalleryCards } from "./gallery-cards";
import { JsonDisplay } from "./json-display";
import type { SavedEventCard } from "../../types/chat-state";
import type { EventToolResult, GalleryToolResult } from "../../types/tool-results";

interface ToolResultProps {
  part: ToolUIPart;
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

  // ALWAYS show show_recommendations results (they are the final user-facing output)
  const isRecommendationTool = toolName === "show_recommendations";

  // For non-recommendation tools: show compact indicator when debug is OFF
  if (!debugMode && !isRecommendationTool) {
    return (
      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {toolName}
        </p>
      </div>
    );
  }

  // Handle event results (from get_gallery_events)
  if (output && typeof output === "object" && "type" in output && output.type === "event-results") {
    const eventResult = output as EventToolResult;
    const count = eventResult.events.length;

    if (count === 0) {
      return (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            No events found for this gallery
          </p>
        </div>
      );
    }

    return (
      <div className="mt-2">
        <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
          Found {count} event{count === 1 ? "" : "s"}
        </p>
        <EventCards events={eventResult.events} onSaveToZine={onSaveToZine} />
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

  // Handle retrieve_galleries - show compact indicator in normal mode, JSON in debug mode
  if (toolName === "retrieve_galleries") {
    if (!debugMode) {
      const count = output && typeof output === "object" && "found" in output
        ? (typeof output.found === "number" ? output.found : 0)
        : 0;
      return (
        <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-700 dark:bg-blue-900/20">
          <p className="text-xs text-blue-700 dark:text-blue-400">
            Retrieved {count} {count === 1 ? "gallery" : "galleries"} for analysis
          </p>
        </div>
      );
    }
    // In debug mode, fall through to show full JSON below
  }

  // Handle update_gallery_requirements
  if (toolName === "update_gallery_requirements") {
    const isSuccess =
      (output && typeof output === "object" && (
        ("success" in output && output.success) ||
        ("updated" in output && output.updated)
      )) || output !== null;

    if (isSuccess) {
      return (
        <div className="mt-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 dark:border-green-700 dark:bg-green-900/20">
          <p className="text-xs text-green-700 dark:text-green-400">
            ✓ Gallery preferences updated
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
