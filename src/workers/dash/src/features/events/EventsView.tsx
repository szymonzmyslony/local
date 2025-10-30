import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { EVENT_STATUSES } from "../../api";
import type { DashboardAction, PipelineEvent, PipelinePage } from "../../api";
import { LinkRowComponent } from "../../components/common/LinkRowComponent";
import { PreviewModal } from "../../components/common/PreviewModal";
import { Button } from "../../components/ui/button";

type EventsViewProps = {
  events: PipelineEvent[];
  pages: PipelinePage[];
  pendingAction: DashboardAction | null;
  onProcessEventPages: (pageIds: string[]) => void;
  onEmbedEvents: (eventIds: string[]) => void;
};

type EventSort = "nearest" | "latest" | "title";

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
      .sort((a, b) => {
        return compareEvents(a, b, sortOrder);
      });
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
    <section className="card">
      <header className="card-header">
        <div>
          <h2 className="card-title">Events</h2>
          <p className="card-subtitle">Track structured outputs and embeddings for each event.</p>
        </div>
      </header>

      <div className="controls-row">
        <div className="field">
          <label htmlFor="event-search">Search</label>
          <input
            id="event-search"
            placeholder="Filter by title or ticket URL"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="event-status-filter">Status</label>
          <select id="event-status-filter" value={statusFilter} onChange={handleStatusChange}>
            <option value="all">All</option>
            {statusOptions.map(status => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="event-sort">Sort</label>
          <select id="event-sort" value={sortOrder} onChange={handleSortChange}>
            <option value="nearest">Nearest start</option>
            <option value="latest">Latest start</option>
            <option value="title">Title</option>
          </select>
        </div>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Source page</th>
            <th>Structured</th>
            <th>Embedding</th>
          </tr>
        </thead>
        <tbody>
          {filteredEvents.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ textAlign: "center", color: "#6b7280" }}>
                No events match the current filters.
              </td>
            </tr>
          ) : (
            filteredEvents.map(event => {
              const page = event.page_id ? pageById.get(event.page_id) ?? null : null;
              const hasStructured = Boolean(event.event_info);
              const hasEmbedding = Boolean(event.event_info?.embedding);
              const canExtract = Boolean(page && page.fetch_status === "ok");
              return (
                <tr key={event.id}>
                  <td>
                    <div className="event-cell">
                      <span className="event-title">{event.title}</span>
                      <span className="event-meta">
                        {event.start_at ? formatIso(event.start_at) : "No start date"}
                      </span>
                    </div>
                  </td>
                  <td>
                    {page ? (
                      <LinkRowComponent
                        href={page.url ?? page.normalized_url}
                        label={page.normalized_url}
                        description={page.kind}
                      />
                    ) : (
                      <span style={{ color: "#6b7280" }}>No page</span>
                    )}
                  </td>
                  <td>
                    <div className="actions">
                      {hasStructured ? (
                        <Button type="button" variant="muted" onClick={() => setStructuredEvent(event)}>
                          View structured
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => triggerStructuredOutput(event)}
                          disabled={!event.page_id || !canExtract || pendingAction === "process"}
                        >
                          {pendingAction === "process"
                            ? "Processing…"
                            : !canExtract
                              ? "Scrape page first"
                              : "Get structured output"}
                        </Button>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="actions">
                      {hasEmbedding ? (
                        <Button type="button" variant="muted" onClick={() => setEmbeddingEvent(event)}>
                          View embedding
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => triggerEmbedding(event)}
                          disabled={pendingAction === "embed"}
                        >
                          {pendingAction === "embed" ? "Embedding…" : "Request embedding"}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {structuredEvent ? (
        <PreviewModal
          title={`Structured output — ${structuredEvent.title}`}
          markdown={formatStructured(structuredEvent)}
          onClose={() => setStructuredEvent(null)}
        />
      ) : null}

      {embeddingEvent ? (
        <PreviewModal
          title={`Embedding — ${embeddingEvent.title}`}
          markdown={embeddingEvent.event_info?.embedding ?? "No embedding stored."}
          onClose={() => setEmbeddingEvent(null)}
        />
      ) : null}
    </section>
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
