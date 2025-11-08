import type { ReactNode } from "react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardContent,
  CardFooter,
  CardHeader,
  CardSubtitle,
  CardTitle
} from "@shared/ui";
import { Calendar, MapPin } from "lucide-react";
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

function formatEventDateTime(
  dateString: string | null,
  timezone?: string | null
): string | null {
  if (!dateString) return null;
  try {
    const date = new Date(dateString);
    const datePart = new Intl.DateTimeFormat(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: timezone ?? undefined
    }).format(date);
    const timePart = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone ?? undefined,
      timeZoneName: timezone ? "short" : undefined
    }).format(date);
    return `${datePart} · ${timePart}`;
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
  const timezone = firstOccurrence?.timezone ?? null;
  const dateLabel = formatEventDateTime(startLabel, timezone);
  const locationLabel =
    result.gallery?.name ??
    result.gallery?.normalizedMainUrl ??
    result.gallery?.mainUrl ??
    null;
  const description =
    result.description ?? "No description available for this event.";
  const primaryLink = result.gallery?.mainUrl ?? null;

  return (
    <Card className="h-full w-full max-w-md border border-slate-200/70 bg-white text-slate-900 shadow-sm transition-all duration-200 hover:shadow-md">
      <CardHeader className="flex flex-col items-start gap-2 border-none px-5 pb-3 pt-5">
        <CardTitle className="text-lg font-semibold tracking-tight">
          {result.title}
        </CardTitle>
        <CardSubtitle className="text-sm text-slate-500 line-clamp-3">
          {description}
        </CardSubtitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-5 pb-4 pt-0 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-slate-500" />
          <span>{dateLabel ?? "Date to be announced"}</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-slate-500" />
          <span>{locationLabel ?? "Location to be announced"}</span>
        </div>
        {hasMultipleOccurrences ? (
          <span className="text-xs text-slate-500">
            {result.occurrences.length} dates available
          </span>
        ) : null}
        {endLabel && startLabel && endLabel !== startLabel ? (
          <span className="text-xs text-slate-500">
            Ends {formatEventDateTime(endLabel, timezone) ?? "TBD"}
          </span>
        ) : null}
      </CardContent>
      <CardFooter className="flex-col gap-2 border-none px-5 pb-5 pt-0">
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap">
          {primaryLink ? (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="w-full sm:w-auto sm:flex-1"
            >
              <a href={primaryLink} target="_blank" rel="noreferrer">
                See gallery
              </a>
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:w-auto sm:flex-1"
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
            className="w-full sm:w-auto sm:flex-1"
            onClick={() => {
              // TODO: Implement share as image functionality
            }}
          >
            Share
          </Button>
        </div>
      </CardFooter>
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
            <div key={item.id} className="flex-shrink-0 w-[340px]">
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
