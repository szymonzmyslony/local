import { useMemo, useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@shared/ui";
import { EVENT_STATUSES } from "../../api";
import type { DashboardAction, GalleryEvent, GalleryPage } from "../../api";

type EventsViewProps = {
  events: GalleryEvent[];
  pages: GalleryPage[];
  pendingAction: DashboardAction | null;
  onProcessEventPages: (pageIds: string[]) => void;
};

type EventSort = "nearest" | "latest" | "title";

type StatusFilter = "all" | GalleryEvent["status"];

const statusOptions: StatusFilter[] = ["all", ...EVENT_STATUSES];

export function EventsView({ events, pages, pendingAction, onProcessEventPages }: EventsViewProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortOrder, setSortOrder] = useState<EventSort>("nearest");

  const pagesById = useMemo(() => new Map(pages.map(page => [page.id, page])), [pages]);

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return events
      .filter(event => {
        if (statusFilter !== "all" && event.status !== statusFilter) {
          return false;
        }
        if (!query) {
          return true;
        }
        const haystack = [event.title, event.ticket_url ?? ""].join(" ").toLowerCase();
        return haystack.includes(query);
      })
      .sort((left, right) => compareEvents(left, right, sortOrder));
  }, [events, statusFilter, search, sortOrder]);

  return (
    <section className="space-y-6">
      <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3 md:items-end">
          <FilterField label="Search">
            <Input
              placeholder="Filter by title or ticket URL…"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </FilterField>
          <FilterField label="Status">
            <Select value={statusFilter} onValueChange={value => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger data-size="default">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map(option => (
                  <SelectItem key={option} value={option}>
                    {option === "all" ? "All statuses" : option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Sort by">
            <Select value={sortOrder} onValueChange={value => setSortOrder(value as EventSort)}>
              <SelectTrigger data-size="default">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nearest">Nearest start</SelectItem>
                <SelectItem value="latest">Latest start</SelectItem>
                <SelectItem value="title">Title</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <span>
            Showing <strong>{filteredEvents.length}</strong> of <strong>{events.length}</strong> events
          </span>
          <Badge variant="secondary" className="capitalize">
            {statusFilter === "all" ? "All statuses" : statusFilter}
          </Badge>
        </div>
      </div>

      <div className="space-y-4">
        {filteredEvents.length === 0 ? (
          <EmptyState />
        ) : (
          filteredEvents.map(event => {
            const page = event.page_id ? pagesById.get(event.page_id) ?? null : null;
            return (
              <EventCard
                key={event.id}
                event={event}
                page={page}
                pendingAction={pendingAction}
                onProcess={pageId => onProcessEventPages([pageId])}
              />
            );
          })
        )}
      </div>
    </section>
  );
}

type EventCardProps = {
  event: GalleryEvent;
  page: GalleryPage | null;
  pendingAction: DashboardAction | null;
  onProcess: (pageId: string) => void;
};

function EventCard({ event, page, pendingAction, onProcess }: EventCardProps) {
  const hasStructured = Boolean(event.event_info);
  const processing = pendingAction === "scrapeAndExtract";
  const ticketLabel = event.ticket_url
    ? event.ticket_url.replace(/^https?:\/\/(?:www\.)?/, "").split(/[/?#]/)[0] || event.ticket_url
    : "Ticket link";
  const occurrences = sortOccurrences(event.event_occurrences ?? []);
  const nextOccurrence = occurrences[0] ?? null;
  const startIndex = nextOccurrence ? 1 : 0;
  const previewOccurrences = occurrences.slice(startIndex, startIndex + 3);
  const remainingOccurrences = Math.max(occurrences.length - startIndex - previewOccurrences.length, 0);
  const embeddedAt = typeof event.event_info?.embedding_created_at === "string"
    ? event.event_info.embedding_created_at
    : null;

  return (
    <article className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-900">{event.title}</h3>
            <EventStatusBadge status={event.status} />
            {hasStructured ? <Badge variant="secondary">Structured</Badge> : null}
          </div>
          <p className="text-sm text-slate-600">{formatEventDateRange(event)}</p>
          {event.event_info?.description ? (
            <p className="text-sm text-slate-700">{event.event_info.description}</p>
          ) : null}
          {event.event_info?.tags ? (
            <div className="flex flex-wrap gap-2">
              {event.event_info.tags.map(tag => (
                <Badge key={tag} variant="outline" className="capitalize">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {page ? (
            <Button variant="outline" asChild>
              <a href={page.url ?? page.normalized_url} target="_blank" rel="noreferrer">
                Open source page
              </a>
            </Button>
          ) : null}
          {event.ticket_url ? (
            <Button variant="ghost" asChild>
              <a href={event.ticket_url} target="_blank" rel="noreferrer">
                {ticketLabel}
              </a>
            </Button>
          ) : null}
          {!hasStructured && page ? (
            <Button
              type="button"
              variant="primary"
              disabled={processing}
              onClick={() => onProcess(page.id)}
            >
              {processing ? "Processing…" : "Process event"}
            </Button>
          ) : null}
        </div>
      </div>

      <dl className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
        <DetailRow label="Next occurrence">
          {nextOccurrence ? formatOccurrence(nextOccurrence) : "Not scheduled"}
        </DetailRow>
        <DetailRow label="Occurrences">
          {occurrences.length ? (
            <div className="space-y-1">
              <span>{occurrences.length} scheduled</span>
              {previewOccurrences.length ? (
                <ul className="list-disc pl-4 text-xs text-slate-500">
                  {previewOccurrences.map(item => (
                    <li key={item.id}>{formatOccurrence(item)}</li>
                  ))}
                  {remainingOccurrences > 0 ? <li>…and {remainingOccurrences} more</li> : null}
                </ul>
              ) : null}
            </div>
          ) : (
            "No occurrences recorded"
          )}
        </DetailRow>
        <DetailRow label="Last embedded">
          {embeddedAt ? formatDate(embeddedAt) : "Not embedded yet"}
        </DetailRow>
        <DetailRow label="First seen">{formatDate(event.created_at)}</DetailRow>
        {page ? (
          <DetailRow label="Source page">
            <span className="flex flex-col gap-1 text-slate-500">
              <span>{page.normalized_url}</span>
              <Badge variant="outline" className="w-fit uppercase">
                {page.kind}
              </Badge>
            </span>
          </DetailRow>
        ) : null}
      </dl>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
      No events match the current filters.
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

function EventStatusBadge({ status }: { status: GalleryEvent["status"] }) {
  const palette: Record<string, string> = {
    cancelled: "bg-rose-100 text-rose-700",
    postponed: "bg-amber-100 text-amber-700",
    rescheduled: "bg-blue-100 text-blue-700",
    scheduled: "bg-emerald-100 text-emerald-700"
  };
  const tone = palette[status.toLowerCase()] ?? "bg-slate-200 text-slate-600";
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase ${tone}`}>{status}</span>;
}

function compareEvents(left: GalleryEvent, right: GalleryEvent, order: EventSort): number {
  if (order === "title") {
    return left.title.localeCompare(right.title);
  }
  const leftDate = left.start_at ?? left.created_at;
  const rightDate = right.start_at ?? right.created_at;
  if (!leftDate || !rightDate) {
    return 0;
  }
  if (order === "latest") {
    return rightDate.localeCompare(leftDate);
  }
  return leftDate.localeCompare(rightDate);
}

function sortOccurrences(occurrences: GalleryEvent["event_occurrences"] = []): GalleryEvent["event_occurrences"] {
  return [...occurrences].sort((left, right) => new Date(left.start_at).getTime() - new Date(right.start_at).getTime());
}

function formatOccurrence(occurrence: GalleryEvent["event_occurrences"][number]): string {
  const start = formatDate(occurrence.start_at);
  const end = occurrence.end_at ? formatDate(occurrence.end_at) : null;
  const zone = occurrence.timezone ? ` (${occurrence.timezone})` : "";
  if (end) {
    return `${start} → ${end}${zone}`;
  }
  return `${start}${zone}`;
}

function formatEventDateRange(event: GalleryEvent): string {
  const start = event.start_at ?? event.created_at;
  const end = event.end_at;
  const formattedStart = formatDate(start);
  if (!end) {
    return formattedStart;
  }
  const formattedEnd = formatDate(end);
  return `${formattedStart} → ${formattedEnd}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="font-semibold text-slate-700">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
