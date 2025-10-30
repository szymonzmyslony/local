import { useMemo, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { EVENT_STATUSES } from "../../api";
import type { DashboardAction, PipelineEvent, PipelinePage } from "../../api";
import { LinkRowComponent } from "../../components/common/LinkRowComponent";
import { PreviewModal } from "../../components/common/PreviewModal";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardSubtitle,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow
} from "@shared/ui";

type EventsViewProps = {
  events: PipelineEvent[];
  pages: PipelinePage[];
  pendingAction: DashboardAction | null;
  onProcessEventPages: (pageIds: string[]) => void;
  onEmbedEvents: (eventIds: string[]) => void;
};

type EventSort = "nearest" | "latest" | "title";

type StatusTone = "success" | "danger" | "warning" | "info" | "muted";

export function EventsView({
  events,
  pages,
  pendingAction,
  onProcessEventPages,
  onEmbedEvents
}: EventsViewProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PipelineEvent["status"] | "all">("all");
  const [sortOrder, setSortOrder] = useState<EventSort>("nearest");
  const [structuredEvent, setStructuredEvent] = useState<PipelineEvent | null>(null);
  const [embeddingEvent, setEmbeddingEvent] = useState<PipelineEvent | null>(null);

  const pageById = useMemo(() => {
    const map = new Map<string, PipelinePage>();
    for (const page of pages) {
      map.set(page.id, page);
    }
    return map;
  }, [pages]);

  const statusOptions: readonly PipelineEvent["status"][] = EVENT_STATUSES;

  const filteredEvents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return events
      .filter(event => {
        if (statusFilter !== "all" && event.status !== statusFilter) return false;
        if (!term) return true;
        const haystack = `${event.title} ${event.ticket_url ?? ""}`.toLowerCase();
        return haystack.includes(term);
      })
      .sort((a, b) => compareEvents(a, b, sortOrder));
  }, [events, statusFilter, search, sortOrder]);

  function handleStatusChange(event: ChangeEvent<HTMLSelectElement>): void {
    const { value } = event.target;
    if (value === "all") {
      setStatusFilter("all");
      return;
    }
    const match = statusOptions.find(option => option === value);
    if (match) {
      setStatusFilter(match);
    }
  }

  function handleSortChange(event: ChangeEvent<HTMLSelectElement>): void {
    const { value } = event.target;
    if (value === "nearest" || value === "latest" || value === "title") {
      setSortOrder(value);
    }
  }

  function triggerStructuredOutput(event: PipelineEvent): void {
    if (!event.page_id) return;
    onProcessEventPages([event.page_id]);
  }

  function triggerEmbedding(event: PipelineEvent): void {
    onEmbedEvents([event.id]);
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Events</CardTitle>
          <CardSubtitle>Track structured outputs and embeddings for each event.</CardSubtitle>
        </div>
      </CardHeader>
      <CardBody className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <FormField label="Search" htmlFor="event-search">
            <input
              id="event-search"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              placeholder="Filter by title or ticket URL"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </FormField>
          <FormField label="Status" htmlFor="event-status-filter">
            <select
              id="event-status-filter"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              value={statusFilter}
              onChange={handleStatusChange}
            >
              <option value="all">All</option>
              {statusOptions.map(status => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Sort" htmlFor="event-sort">
            <select
              id="event-sort"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              value={sortOrder}
              onChange={handleSortChange}
            >
              <option value="nearest">Nearest start</option>
              <option value="latest">Latest start</option>
              <option value="title">Title</option>
            </select>
          </FormField>
        </div>

        <Table className="rounded-lg border border-slate-200">
          <TableHead>
            <TableRow className="bg-slate-50">
              <TableHeaderCell>Event</TableHeaderCell>
              <TableHeaderCell>Source page</TableHeaderCell>
              <TableHeaderCell>Structured</TableHeaderCell>
              <TableHeaderCell>Embedding</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredEvents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-slate-500">
                  No events match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredEvents.map(event => {
                const page = event.page_id ? pageById.get(event.page_id) ?? null : null;
                const hasStructured = Boolean(event.event_info);
                const hasEmbedding = Boolean(event.event_info?.embedding);
                const canExtract = Boolean(page && page.fetch_status === "ok");
                return (
                  <TableRow key={event.id}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-slate-900">{event.title}</span>
                        <span className="text-xs text-slate-500">
                          {event.start_at ? formatIso(event.start_at) : "No start date"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {page ? (
                        <LinkRowComponent
                          href={page.url ?? page.normalized_url}
                          label={page.normalized_url}
                          description={page.kind}
                        />
                      ) : (
                        <span className="text-sm text-slate-500">No page</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        {hasStructured ? (
                          <>
                            <StatusBadge tone="success">Structured</StatusBadge>
                            <Button type="button" variant="muted" onClick={() => setStructuredEvent(event)}>
                              View structured
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => triggerStructuredOutput(event)}
                            disabled={!event.page_id || !canExtract || pendingAction === "process"}
                          >
                            {pendingAction === "process"
                              ? "Processing..."
                              : !canExtract
                                ? "Scrape page first"
                                : "Get structured output"}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        {hasEmbedding ? (
                          <>
                            <StatusBadge tone="info">Embedded</StatusBadge>
                            <Button type="button" variant="muted" onClick={() => setEmbeddingEvent(event)}>
                              View embedding
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => triggerEmbedding(event)}
                            disabled={pendingAction === "embed"}
                          >
                            {pendingAction === "embed" ? "Embedding..." : "Request embedding"}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {structuredEvent ? (
          <PreviewModal
            title={`Structured output - ${structuredEvent.title}`}
            markdown={formatStructured(structuredEvent)}
            onClose={() => setStructuredEvent(null)}
          />
        ) : null}

        {embeddingEvent ? (
          <PreviewModal
            title={`Embedding - ${embeddingEvent.title}`}
            markdown={embeddingEvent.event_info?.embedding ?? "No embedding stored."}
            onClose={() => setEmbeddingEvent(null)}
          />
        ) : null}
      </CardBody>
    </Card>
  );
}

function formatIso(value: string): string {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatStructured(event: PipelineEvent): string {
  if (event.event_info?.md) return event.event_info.md;
  if (event.event_info?.data) {
    return JSON.stringify(event.event_info.data, null, 2);
  }
  return "No structured output saved.";
}

function compareEvents(left: PipelineEvent, right: PipelineEvent, order: EventSort): number {
  if (order === "title") {
    return left.title.localeCompare(right.title);
  }

  const leftDate = left.start_at ?? left.created_at;
  const rightDate = right.start_at ?? right.created_at;

  if (order === "latest") {
    return rightDate.localeCompare(leftDate);
  }

  return leftDate.localeCompare(rightDate);
}

function FormField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium text-slate-700" htmlFor={htmlFor}>
      {label}
      {children}
    </label>
  );
}

function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const toneClass = {
    success: "bg-emerald-100 text-emerald-700",
    danger: "bg-rose-100 text-rose-700",
    warning: "bg-amber-100 text-amber-700",
    info: "bg-blue-100 text-blue-700",
    muted: "bg-slate-100 text-slate-600"
  }[tone];

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${toneClass}`}>
      {children}
    </span>
  );
}
