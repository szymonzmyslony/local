import type { ReactNode } from "react";
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
    <div className="flex gap-2 text-xs text-slate-500">
      <span className="font-medium text-slate-600">{label}</span>
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
    <Card className="border-slate-200 bg-gradient-to-br from-white via-white to-slate-50">
      <CardBody className="space-y-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className="bg-slate-100 text-slate-700 text-xs"
            >
              Gallery
            </Badge>
            <CardTitle className="text-base font-semibold text-slate-900">
              {result.name ?? "Unnamed gallery"}
            </CardTitle>
          </div>
          {result.mainUrl ? (
            <CardSubtitle className="text-xs text-slate-500">
              {result.mainUrl}
            </CardSubtitle>
          ) : null}
        </div>
        <div className="space-y-2 rounded-lg border border-slate-100 bg-white/70 p-3">
          <p className="text-sm text-slate-600 leading-relaxed">
            {result.about ?? "No description available for this gallery."}
          </p>
          {result.eventsPage ? (
            <div className="pt-1">
              <Button asChild variant="outline" size="sm">
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

function formatDate(dateString: string | null): string {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return dateString;
  }
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
  const firstOccurrence = result.occurrences[0];
  const startLabel = result.startAt ?? firstOccurrence?.start_at ?? null;
  const endLabel = result.endAt ?? firstOccurrence?.end_at ?? null;
  const hasMultipleOccurrences = result.occurrences.length > 1;

  return (
    <Card className="border-blue-100 bg-gradient-to-br from-white via-white to-blue-50/40 h-full flex flex-col">
      <CardBody className="space-y-3 flex flex-col flex-1">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold text-slate-900 line-clamp-2">
            {result.title}
          </CardTitle>
          {result.gallery ? (
            <CardSubtitle className="text-xs text-slate-600">
              {result.gallery.name ??
                result.gallery.normalizedMainUrl ??
                result.gallery.mainUrl ??
                "Unknown gallery"}
            </CardSubtitle>
          ) : null}
        </div>

        <div className="space-y-2 rounded-lg border border-blue-100 bg-white/80 p-3 flex-1 flex flex-col">
          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="text-xs font-medium text-slate-600 shrink-0">
                When:
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-xs text-slate-700">
                  {startLabel ? formatDate(startLabel) : "TBD"}
                </span>
                {hasMultipleOccurrences && (
                  <span className="ml-1 text-xs text-slate-500">
                    ({result.occurrences.length} times)
                  </span>
                )}
              </div>
            </div>
            {result.gallery?.name && (
              <div className="flex items-start gap-2">
                <span className="text-xs font-medium text-slate-600 shrink-0">
                  Where:
                </span>
                <span className="text-xs text-slate-700 truncate">
                  {result.gallery.name}
                </span>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-600 leading-relaxed line-clamp-3 flex-shrink-0">
            {result.description ?? "No description available for this event."}
          </p>

          <div className="flex gap-2 pt-2 mt-auto flex-wrap">
            {result.gallery?.mainUrl ? (
              <Button asChild variant="outline" size="sm" className="text-xs">
                <a
                  href={result.gallery.mainUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  See gallery
                </a>
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => {
                if (onSaveToMyZine) {
                  onSaveToMyZine(result.id, result);
                } else {
                  console.warn("Save to MY ZINE callback not available");
                }
              }}
              disabled={!onSaveToMyZine}
            >
              Save to MY ZINE
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => {
                // TODO: Implement share as image functionality
              }}
            >
              Share
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
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
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-6 px-6 items-stretch">
          {limitedItems.map((item) => (
            <div key={item.id} className="flex-shrink-0 w-[320px]">
              <EventResultCard result={item} onSaveToMyZine={onSaveToMyZine} />
            </div>
          ))}
        </div>
        {data.items.length > 5 && (
          <p className="text-xs text-slate-400 text-center mt-2">
            Showing top 5 of {data.items.length} results
          </p>
        )}
      </div>
    );
  }

  return null;
}
