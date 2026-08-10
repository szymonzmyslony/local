import { useState } from "react";
import { Loader2, ChevronDown, ChevronRight, CheckCircle2, XCircle } from "lucide-react";
import type { DynamicToolUIPart, ToolUIPart } from "ai";

interface ToolCallDisplayProps {
  part: ToolUIPart | DynamicToolUIPart;
  toolName: string;
  debugMode: boolean;
}

type ToolPresentation = {
  complete: string;
  loading: string;
  details: string[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function titleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatVisitTime(value: unknown): string | null {
  const openAt = asRecord(value);
  if (typeof openAt.weekday !== "number") return null;

  const weekdays = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
  ];
  const day = weekdays[openAt.weekday] ?? "Selected day";
  if (typeof openAt.timeMinutes !== "number") return day;

  const hours = Math.floor(openAt.timeMinutes / 60);
  const minutes = openAt.timeMinutes % 60;
  return `${day} · ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function resultCount(output: unknown, key: "found" | "items" | "events"): number | null {
  const record = asRecord(output);
  if (key === "found" && typeof record.found === "number") return record.found;
  const value = record[key];
  return Array.isArray(value) ? value.length : null;
}

export function getToolPresentation(
  toolName: string,
  inputValue: unknown,
  outputValue: unknown
): ToolPresentation {
  const input = asRecord(inputValue);

  if (toolName === "retrieve_galleries") {
    const allGalleries = input.mode === "all";
    const criteria = asRecord(input.criteria);
    const details = [
      !allGalleries && typeof criteria.searchQuery === "string"
        ? titleCase(criteria.searchQuery)
        : null,
      !allGalleries && typeof criteria.area === "string"
        ? titleCase(criteria.area)
        : null,
      !allGalleries ? formatVisitTime(criteria.openAt) : null
    ].filter((detail): detail is string => Boolean(detail));
    const count = resultCount(outputValue, "found");

    return {
      loading: allGalleries
        ? "Loading the London gallery catalogue…"
        : "Searching the London gallery catalogue…",
      complete:
        count === null
          ? allGalleries
            ? "Loaded the London gallery catalogue"
            : "Searched the London gallery catalogue"
          : `Checked ${count} ${count === 1 ? "gallery" : "galleries"}`,
      details: allGalleries ? ["All London galleries"] : details
    };
  }

  if (toolName === "show_recommendations") {
    const ids = Array.isArray(input.galleryIds) ? input.galleryIds : [];
    const count = resultCount(outputValue, "items") ?? ids.length;
    return {
      loading: "Preparing gallery recommendations…",
      complete: `Showing ${count} gallery ${count === 1 ? "recommendation" : "recommendations"}`,
      details: []
    };
  }

  if (toolName === "get_gallery_events") {
    const count = resultCount(outputValue, "events");
    return {
      loading: "Checking current exhibitions…",
      complete:
        count === null
          ? "Checked current exhibitions"
          : `Found ${count} current ${count === 1 ? "exhibition" : "exhibitions"}`,
      details: []
    };
  }

  if (toolName === "search_events") {
    const subject = asRecord(input.subject);
    const location = asRecord(input.location);
    const timing = asRecord(input.timing);
    const attendance = asRecord(input.attendance);
    const timingLabel =
      timing.kind === "on_date" && typeof timing.date === "string"
        ? timing.date
        : timing.kind === "date_range" &&
            typeof timing.from === "string" &&
            typeof timing.to === "string"
          ? `${timing.from} → ${timing.to}`
          : timing.kind === "current_and_upcoming"
            ? "Current + upcoming"
            : null;
    const details = [
      typeof subject.searchQuery === "string"
        ? titleCase(subject.searchQuery)
        : null,
      Array.isArray(subject.artists) && subject.artists.length > 0
        ? subject.artists.join(", ")
        : null
      ,
      typeof location.area === "string" ? titleCase(location.area) : "London",
      timingLabel,
      attendance.kind === "in_person"
        ? "In person"
        : attendance.kind === "online"
          ? "Online"
          : "Any format"
    ].filter((detail): detail is string => Boolean(detail));
    const count = resultCount(outputValue, "found");
    return {
      loading: "Searching London events…",
      complete:
        count === null
          ? "Searched London events"
          : `Found ${count} ${count === 1 ? "event" : "events"}`,
      details
    };
  }

  return {
    loading: "Working on your guide…",
    complete: "Updated your guide",
    details: []
  };
}

export function ToolCallDisplay({ part, toolName, debugMode }: ToolCallDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Tool states: "input-available" (executing) | "output-available" (done) | "output-error" (failed)
  const isLoading = part.state === "input-available";
  const hasError = part.state === "output-error";
  const hasOutput = part.state === "output-available";
  const hasInput = !!part.input;

  const presentation = getToolPresentation(
    toolName,
    part.input,
    part.state === "output-available" ? part.output : null
  );

  return (
    <div className="overflow-hidden rounded-lg border border-[#0140B6]/25 bg-[#F1F5FF]">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          {isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-[#0140B6]" />
          )}
          {!isLoading && hasOutput && (
            <CheckCircle2 className="h-4 w-4 text-[#0140B6]" />
          )}
          {!isLoading && hasError && (
            <XCircle className="h-4 w-4 text-[#0140B6]" />
          )}
          <span className="text-sm font-medium text-[#161A23]">
            {isLoading ? presentation.loading : presentation.complete}
          </span>
        </div>

        {presentation.details.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {presentation.details.map((detail) => (
              <span
                key={detail}
                className="rounded-full border border-[#0140B6]/25 bg-white px-2.5 py-1 text-[11px] text-[#0140B6]"
              >
                {detail}
              </span>
            ))}
          </div>
        ) : null}

        {hasError && (
          <div className="mt-2 text-xs text-[#0140B6]">
            {debugMode
              ? part.errorText
              : "This lookup stopped before it finished. The guide will retry safely."}
          </div>
        )}

        {debugMode && hasInput && (
          <>
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-2 flex items-center gap-1 text-[10px] text-[#0140B6]/65 hover:text-[#0140B6]"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <span>{isExpanded ? "Hide" : "Show"} developer details</span>
            </button>

            {isExpanded && (
              <div className="mt-2 rounded-lg border border-[#0140B6]/20 bg-white px-2 py-1.5">
                <pre className="whitespace-pre-wrap break-words text-[10px] text-[#0140B6]/75">
                  {JSON.stringify(part.input as Record<string, unknown>, null, 2)}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
