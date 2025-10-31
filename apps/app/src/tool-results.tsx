import type { ReactNode } from "react";
import { Badge, Button, Card, CardBody, CardSubtitle, CardTitle } from "@shared/ui";
import type { ToolResultPayload, GalleryToolResult, EventToolResult } from "./types/tool-results";

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-xs text-slate-500">
      <span className="font-medium text-slate-600">{label}</span>
      <span className="truncate">{value}</span>
    </div>
  );
}

function GalleryResultCard({ result }: { result: GalleryToolResult["items"][number] }) {
  return (
    <Card className="border-slate-200 bg-gradient-to-br from-white via-white to-slate-50">
      <CardBody className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold text-slate-900">
              {result.name ?? "Unnamed gallery"}
            </CardTitle>
            {result.mainUrl ? <CardSubtitle className="text-xs text-slate-500">{result.mainUrl}</CardSubtitle> : null}
          </div>
          <Badge variant="secondary" className="bg-slate-100 text-slate-700">
            score {result.similarity.toFixed(3)}
          </Badge>
        </div>
        <div className="space-y-2 rounded-lg border border-slate-100 bg-white/70 p-3">
          <p className="text-sm text-slate-600 leading-relaxed">
            {result.about ?? "No description available for this gallery."}
          </p>
          <div className="space-y-1">
            <DetailRow label="Events page" value={result.eventsPage} />
            <DetailRow label="Normalized URL" value={result.normalizedMainUrl} />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function EventResultCard({ result }: { result: EventToolResult["items"][number] }) {
  const firstOccurrence = result.occurrences[0];
  const startLabel = result.startAt ?? firstOccurrence?.start_at ?? null;
  const endLabel = result.endAt ?? firstOccurrence?.end_at ?? null;

  return (
    <Card className="border-blue-100 bg-gradient-to-br from-white via-white to-blue-50/40">
      <CardBody className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold text-slate-900">{result.title}</CardTitle>
            {result.gallery ? (
              <CardSubtitle className="text-xs text-slate-500">
                {result.gallery.name ?? result.gallery.normalizedMainUrl ?? result.gallery.mainUrl ?? "Unknown gallery"}
              </CardSubtitle>
            ) : null}
          </div>
          <Badge variant="secondary" className="bg-blue-100 text-blue-700">
            score {result.similarity.toFixed(3)}
          </Badge>
        </div>

        <div className="space-y-2 rounded-lg border border-blue-100 bg-white/80 p-3">
          <p className="text-sm text-slate-600 leading-relaxed">
            {result.description ?? "No description available for this event."}
          </p>
          <div className="grid gap-1 sm:grid-cols-2">
            <DetailRow label="Starts" value={startLabel ? new Date(startLabel).toLocaleString() : null} />
            <DetailRow label="Ends" value={endLabel ? new Date(endLabel).toLocaleString() : null} />
            <DetailRow label="Status" value={result.status} />
            <DetailRow label="Timezone" value={firstOccurrence?.timezone ?? null} />
          </div>
        </div>

        {result.gallery?.mainUrl ? (
          <div className="pt-1">
            <Button asChild variant="outline" size="sm">
              <a href={result.gallery.mainUrl} target="_blank" rel="noreferrer">
                Visit gallery site
              </a>
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

export function renderToolResult(payload: unknown): ReactNode {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const data = payload as ToolResultPayload;
  if (data.type === "gallery-results") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Top galleries for: “{data.query}”</p>
        {data.items.length === 0 ? (
          <p className="text-sm text-slate-500">No galleries matched this query.</p>
        ) : (
          <div className="space-y-3">
            {data.items.map((item) => (
              <GalleryResultCard key={item.id} result={item} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (data.type === "event-results") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Top events for: “{data.query}”</p>
        {data.items.length === 0 ? (
          <p className="text-sm text-slate-500">No events matched this query.</p>
        ) : (
          <div className="space-y-3">
            {data.items.map((item) => (
              <EventResultCard key={item.id} result={item} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}
