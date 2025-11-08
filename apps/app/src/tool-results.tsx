import type { ReactNode } from "react";
import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardSubtitle,
  CardTitle
} from "@shared/ui";
import type {
  ToolResultPayload,
  GalleryToolResult,
  EventToolResult
} from "./types/tool-results";

function DetailRow({
  label,
  value
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="flex gap-1.5 text-[10px] text-slate-500">
      <span className="font-semibold text-slate-600">{label}</span>
      <span className="truncate">{value}</span>
    </div>
  );
}

function GalleryResultCard({
  result
}: {
  result: GalleryToolResult["items"][number];
}) {
  return (
    <Card className="border-slate-200/50 bg-gradient-to-br from-white via-white to-slate-50/50">
      <CardBody className="space-y-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <Badge
              variant="secondary"
              className="bg-slate-100/50 text-slate-700 text-[10px]"
            >
              Gallery
            </Badge>
            <CardTitle className="text-xs font-semibold text-slate-900">
              {result.name ?? "Unnamed gallery"}
            </CardTitle>
          </div>
          {result.mainUrl ? (
            <CardSubtitle className="text-[10px] text-slate-500">
              {result.mainUrl}
            </CardSubtitle>
          ) : null}
        </div>
        <div className="space-y-1.5 rounded-xl border border-slate-200/50 bg-white/70 p-2.5">
          <p className="text-xs text-slate-600 leading-relaxed">
            {result.about ?? "No description available for this gallery."}
          </p>
          {result.eventsPage ? (
            <div className="pt-0.5">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[10px] border-slate-200/50 dark:border-slate-700/50"
              >
                <a href={result.eventsPage} target="_blank" rel="noreferrer">
                  View events
                </a>
              </Button>
            </div>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

function EventResultCard({
  result,
  onSaveToMyZine
}: {
  result: EventToolResult["items"][number];
  onSaveToMyZine?: (
    eventId: string,
    eventData: EventToolResult["items"][number]
  ) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const locationLabel =
    result.gallery?.name ??
    result.gallery?.normalizedMainUrl ??
    result.gallery?.mainUrl ??
    null;
  const description =
    result.description ?? "No description available for this event.";
  const primaryLink = result.gallery?.mainUrl ?? null;

  // Check if description is long enough to need truncation
  const needsTruncation = description.length > 200; // Rough estimate for 6 lines

  return (
    <div className="h-full w-full max-w-md rounded-2xl p-6 bg-gradient-to-br from-[#f8faff] to-[#ecefff] shadow-sm hover:shadow-md transition-all duration-200">
      <h2 className="text-sm font-semibold text-gray-900">{result.title}</h2>

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
        {primaryLink ? (
          <button
            onClick={(e) => {
              e.preventDefault();
              window.open(primaryLink!, "_blank", "noopener,noreferrer");
            }}
            className="bg-white text-gray-900 px-3 py-1.5 rounded-xl hover:bg-gray-50 transition text-xs font-medium"
          >
            visit gallery
          </button>
        ) : null}
        <button
          onClick={() => {
            if (onSaveToMyZine) {
              onSaveToMyZine(result.id, result);
            } else {
              console.warn("Save to MY ZINE callback not available");
            }
          }}
          disabled={!onSaveToMyZine}
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

export function renderToolResult(
  payload: unknown,
  onSaveToMyZine?: (
    eventId: string,
    eventData: EventToolResult["items"][number]
  ) => void
): ReactNode {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const data = payload as ToolResultPayload;

  // Gallery results are text-only fallbacks and should not be rendered as cards
  if (data.type === "gallery-results") {
    return null;
  }

  if (data.type === "event-results") {
    // Show all items (up to 5 max) - no minimum requirement
    const limitedItems = data.items.slice(0, 5);

    // If no events found, don't display anything - let the agent handle it in text
    if (data.items.length === 0) {
      return null;
    }

    return (
      <div className="w-full">
        <div className="flex gap-3 overflow-x-auto pb-3 -mx-4 px-4 items-stretch">
          {limitedItems.map((item) => (
            <div key={item.id} className="flex-shrink-0 w-[340px]">
              <EventResultCard result={item} onSaveToMyZine={onSaveToMyZine} />
            </div>
          ))}
        </div>
        {data.items.length > 5 && (
          <p className="text-[10px] text-slate-400 text-center mt-1.5">
            Showing top 5 of {data.items.length} results
          </p>
        )}
      </div>
    );
  }

  return null;
}
