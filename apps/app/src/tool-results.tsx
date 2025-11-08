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
    <Card className="h-full w-full max-w-md border border-slate-200/50 bg-white text-slate-900 transition-all duration-200 hover:border-slate-200 dark:bg-slate-900 dark:text-slate-100">
      <CardHeader className="flex flex-col items-start gap-1.5 border-none px-4 pb-2 pt-4">
        <CardTitle className="text-xs font-semibold tracking-tight">
          {result.title}
        </CardTitle>
        <CardSubtitle className="text-[10px] text-slate-500 line-clamp-3">
          {description}
        </CardSubtitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-4 pb-3 pt-0 text-xs text-slate-600">
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3 w-3 text-slate-500" />
          <span>{dateLabel ?? "Date to be announced"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3 w-3 text-slate-500" />
          <span>{locationLabel ?? "Location to be announced"}</span>
        </div>
        {hasMultipleOccurrences ? (
          <span className="text-[10px] text-slate-500">
            {result.occurrences.length} dates available
          </span>
        ) : null}
        {endLabel && startLabel && endLabel !== startLabel ? (
          <span className="text-[10px] text-slate-500">
            Ends {formatEventDateTime(endLabel, timezone) ?? "TBD"}
          </span>
        ) : null}
      </CardContent>
      <CardFooter className="flex-col gap-1.5 border-none px-4 pb-4 pt-0">
        <div className="flex w-full flex-col gap-1.5 sm:flex-row sm:flex-wrap">
          {primaryLink ? (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-7 w-full border-slate-200/50 px-2 text-[10px] dark:border-slate-700/50 sm:w-auto sm:flex-1"
            >
              <a href={primaryLink} target="_blank" rel="noreferrer">
                See gallery
              </a>
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-full border-slate-200/50 px-2 text-[10px] dark:border-slate-700/50 sm:w-auto sm:flex-1"
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
            className="h-7 w-full border-slate-200/50 px-2 text-[10px] dark:border-slate-700/50 sm:w-auto sm:flex-1"
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
