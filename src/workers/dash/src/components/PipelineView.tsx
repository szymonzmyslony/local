import { Fragment, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { PipelineData, PipelineEvent, PipelinePage } from "../api";

type DiscoverPayload = { listUrls: string[]; limit?: number };

export type PipelineAction =
  | "refresh"
  | "discover"
  | "scrape"
  | "extract"
  | "process"
  | "embed"
  | "extractGallery";

type Props = {
  pipeline: PipelineData;
  pendingAction: PipelineAction | null;
  onRefresh: () => void;
  onExtractGallery: () => void;
  onDiscover: (payload: DiscoverPayload) => void;
  onScrape: (pageIds: string[]) => void;
  onExtractPages: (pageIds: string[]) => void;
  onProcessEvents: (pageIds: string[]) => void;
  onEmbedEvents: (eventIds: string[]) => void;
  selectedPageIds: Set<string>;
  onTogglePage: (pageId: string) => void;
  onSetPageSelection: (pageIds: string[]) => void;
  selectedEventIds: Set<string>;
  onToggleEvent: (eventId: string) => void;
  onSetEventSelection: (eventIds: string[]) => void;
};

export function PipelineView({
  pipeline,
  pendingAction,
  onRefresh,
  onExtractGallery,
  onDiscover,
  onScrape,
  onExtractPages,
  onProcessEvents,
  onEmbedEvents,
  selectedPageIds,
  onTogglePage,
  onSetPageSelection,
  selectedEventIds,
  onToggleEvent,
  onSetEventSelection
}: Props) {
  const [discoverInput, setDiscoverInput] = useState("");
  const [discoverLimit, setDiscoverLimit] = useState(100);

  const galleryInfo = pipeline.gallery.gallery_info;
  const galleryHours = useMemo(() => [...pipeline.gallery.gallery_hours].sort((a, b) => a.dow - b.dow), [pipeline.gallery.gallery_hours]);
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const instagramHandle = galleryInfo?.instagram ? galleryInfo.instagram.replace(/^@/, "") : null;

  const pageMetrics = useMemo(() => computePageMetrics(pipeline.pages), [pipeline.pages]);
  const structuredMetrics = useMemo(() => computeStructuredMetrics(pipeline.pages), [pipeline.pages]);
  const eventMetrics = useMemo(() => computeEventMetrics(pipeline.events), [pipeline.events]);

  const pageSelectionCount = selectedPageIds.size;
  const eventSelectionCount = selectedEventIds.size;

  const discoverDisabled = pendingAction === "discover";
  const refreshDisabled = pendingAction === "refresh";
  const extractGalleryDisabled = pendingAction === "extractGallery";
  const scrapeDisabled = pendingAction === "scrape" || pageSelectionCount === 0;
  const extractDisabled = pendingAction === "extract" || pageSelectionCount === 0;
  const processDisabled = pendingAction === "process" || pageSelectionCount === 0;
  const embedDisabled = pendingAction === "embed" || eventSelectionCount === 0;

  function handleDiscover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const urls = discoverInput
      .split(/\n|,/) // newline or comma
      .map(url => url.trim())
      .filter(url => url.length > 0);
    if (urls.length === 0) return;
    onDiscover({ listUrls: urls, limit: discoverLimit });
  }

  return (
    <Fragment>
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Gallery overview</h2>
            <p className="card-subtitle">Core details extracted from the gallery pages.</p>
          </div>
          <div className="actions">
            <button type="button" className="btn btn-muted" onClick={onRefresh} disabled={refreshDisabled}>
              {refreshDisabled ? "Refreshing…" : "Refresh pipeline"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onExtractGallery} disabled={extractGalleryDisabled}>
              {extractGalleryDisabled ? "Extracting…" : "Extract gallery info"}
            </button>
          </div>
        </div>

        <div className="grid-two">
          <div className="metric">
            <span>Primary URL</span>
            <span>
              <a href={pipeline.gallery.main_url} target="_blank" rel="noreferrer">
                {pipeline.gallery.normalized_main_url}
              </a>
            </span>
          </div>
          {pipeline.gallery.about_url && (
            <div className="metric">
              <span>About page</span>
              <span>
                <a href={pipeline.gallery.about_url} target="_blank" rel="noreferrer">
                  {pipeline.gallery.about_url}
                </a>
              </span>
            </div>
          )}
        </div>

        <div className="grid-two">
          <div className="metric">
            <span>Name</span>
            <span>{galleryInfo?.name ?? "—"}</span>
          </div>
          <div className="metric">
            <span>Address</span>
            <span>{galleryInfo?.address ?? "—"}</span>
          </div>
          <div className="metric">
            <span>Email</span>
            <span>
              {galleryInfo?.email ? <a href={`mailto:${galleryInfo.email}`}>{galleryInfo.email}</a> : "—"}
            </span>
          </div>
          <div className="metric">
            <span>Phone</span>
            <span>{galleryInfo?.phone ?? "—"}</span>
          </div>
          <div className="metric">
            <span>Instagram</span>
            <span>
              {instagramHandle ? (
                <a href={`https://instagram.com/${instagramHandle}`} target="_blank" rel="noreferrer">
                  @{instagramHandle}
                </a>
              ) : (
                "—"
              )}
            </span>
          </div>
          <div className="metric">
            <span>Tags</span>
            <span>
              {galleryInfo?.tags && galleryInfo.tags.length > 0 ? (
                <div className="tag-list">
                  {galleryInfo.tags.map(tag => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                "—"
              )}
            </span>
          </div>
          <div className="metric" style={{ gridColumn: "1 / -1" }}>
            <span>About</span>
            <span style={{ fontSize: "0.9rem", lineHeight: 1.6 }}>{galleryInfo?.about ?? "—"}</span>
          </div>
          <div className="metric" style={{ gridColumn: "1 / -1" }}>
            <span>Hours</span>
            <span>
              {galleryHours.length > 0 ? (
                <div className="hours-list">
                  {galleryHours.map(hour => (
                    <div key={`${hour.dow}-${hour.open_time}-${hour.close_time}`} className="hours-row">
                      <strong>{dayNames[hour.dow] ?? `Day ${hour.dow}`}:</strong> {hour.open_time} – {hour.close_time}
                    </div>
                  ))}
                </div>
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Workflow timeline</h2>
            <p className="card-subtitle">Monitor progress from discovery to structured events.</p>
          </div>
        </div>
        <div className="timeline">
          <div className="timeline-step">
            <strong>Pages discovered</strong>
            <span>{pageMetrics.total} total</span>
            <span>
              {pageMetrics.byKind.event_candidate} candidates • {pageMetrics.byKind.event_detail} event detail • {pageMetrics.byKind.event_list} event list
            </span>
          </div>
          <div className="timeline-step">
            <strong>Pages scraped</strong>
            <span>{pageMetrics.scraped} scraped • {pageMetrics.pending} pending</span>
            <span>{pageMetrics.error} errors</span>
          </div>
          <div className="timeline-step">
            <strong>Structured</strong>
            <span>{structuredMetrics.parsed} parsed • {structuredMetrics.pending} awaiting</span>
            <span>{structuredMetrics.eventDetails} events detected</span>
          </div>
          <div className="timeline-step">
            <strong>Events created</strong>
            <span>{eventMetrics.total} total</span>
            <span>{eventMetrics.scheduled} scheduled • {eventMetrics.cancelled} cancelled</span>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Pages</h2>
            <p className="card-subtitle">Filter, scrape and extract content by page.</p>
          </div>
          <div className="actions">
            <span style={{ color: "#6b7280", fontSize: "0.85rem" }}>Selected: {pageSelectionCount}</span>
            <button type="button" className="btn btn-muted" onClick={() => onSetPageSelection([])} disabled={pageSelectionCount === 0}>
              Clear
            </button>
            <button
              type="button"
              className="btn btn-muted"
              onClick={() => onSetPageSelection(pipeline.pages.map(page => page.id))}
              disabled={pipeline.pages.length === 0}
            >
              Select all
            </button>
          </div>
        </div>

        <form className="grid-two" onSubmit={handleDiscover}>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="discover-urls">Discover more event list URLs</label>
            <textarea
              id="discover-urls"
              placeholder="Paste URLs separated by commas or new lines"
              rows={3}
              value={discoverInput}
              onChange={event => setDiscoverInput(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="discover-limit">Discovery limit</label>
            <input
              id="discover-limit"
              type="number"
              min={1}
              max={500}
              value={discoverLimit}
              onChange={event => setDiscoverLimit(Math.max(1, Number(event.target.value)))}
            />
          </div>
          <div className="field" style={{ alignSelf: "end" }}>
            <button type="submit" className="btn btn-secondary" disabled={discoverDisabled || discoverInput.trim().length === 0}>
              {discoverDisabled ? "Submitting…" : "Discover links"}
            </button>
          </div>
        </form>

        <div className="actions">
          <button type="button" className="btn btn-primary" disabled={scrapeDisabled} onClick={() => onScrape(Array.from(selectedPageIds))}>
            {pendingAction === "scrape" ? "Scraping…" : "Scrape selected"}
          </button>
          <button type="button" className="btn btn-secondary" disabled={extractDisabled} onClick={() => onExtractPages(Array.from(selectedPageIds))}>
            {pendingAction === "extract" ? "Extracting…" : "Extract selected"}
          </button>
          <button type="button" className="btn btn-secondary" disabled={processDisabled} onClick={() => onProcessEvents(Array.from(selectedPageIds))}>
            {pendingAction === "process" ? "Processing…" : "Process events"}
          </button>
        </div>

        <PagesTable pages={pipeline.pages} selectedIds={selectedPageIds} onToggle={onTogglePage} />
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Events</h2>
            <p className="card-subtitle">Review extracted events and push to embeddings.</p>
          </div>
          <div className="actions">
            <span style={{ color: "#6b7280", fontSize: "0.85rem" }}>Selected: {eventSelectionCount}</span>
            <button type="button" className="btn btn-muted" onClick={() => onSetEventSelection([])} disabled={eventSelectionCount === 0}>
              Clear
            </button>
            <button
              type="button"
              className="btn btn-muted"
              onClick={() => onSetEventSelection(pipeline.events.map(event => event.id))}
              disabled={pipeline.events.length === 0}
            >
              Select all
            </button>
          </div>
        </div>

        <div className="actions">
          <button type="button" className="btn btn-primary" disabled={embedDisabled} onClick={() => onEmbedEvents(Array.from(selectedEventIds))}>
            {pendingAction === "embed" ? "Embedding…" : "Embed selected"}
          </button>
        </div>

        {pipeline.events.length > 0 ? (
          <EventsTable events={pipeline.events} selectedIds={selectedEventIds} onToggle={onToggleEvent} />
        ) : (
          <div className="empty-state">No events created yet. Process extracted event pages once structured data is ready.</div>
        )}
      </section>
    </Fragment>
  );
}

type PageMetrics = {
  total: number;
  scraped: number;
  pending: number;
  error: number;
  byKind: Record<PipelinePage["kind"], number>;
};

function computePageMetrics(pages: PipelinePage[]): PageMetrics {
  const counts: Record<PipelinePage["kind"], number> = {
    gallery_main: 0,
    gallery_about: 0,
    event_list: 0,
    event_detail: 0,
    event_candidate: 0,
    other: 0
  };
  let scraped = 0;
  let pending = 0;
  let error = 0;

  for (const page of pages) {
    counts[page.kind] += 1;
    if (page.fetch_status === "ok") {
      scraped += 1;
    } else if (page.fetch_status === "error") {
      error += 1;
    } else {
      pending += 1;
    }
  }

  return {
    total: pages.length,
    scraped,
    pending,
    error,
    byKind: counts
  };
}

type StructuredMetrics = {
  parsed: number;
  pending: number;
  eventDetails: number;
};

function computeStructuredMetrics(pages: PipelinePage[]): StructuredMetrics {
  let parsed = 0;
  let pending = 0;
  let eventDetails = 0;

  for (const page of pages) {
    if (!page.page_structured) {
      pending += 1;
      continue;
    }
    if (page.page_structured.parse_status === "ok") {
      parsed += 1;
      if (page.page_structured.extracted_page_kind === "event_detail") {
        eventDetails += 1;
      }
    } else if (page.page_structured.parse_status === "queued" || page.page_structured.parse_status === "never") {
      pending += 1;
    }
  }

  return { parsed, pending, eventDetails };
}

type EventMetrics = {
  total: number;
  scheduled: number;
  cancelled: number;
};

function computeEventMetrics(events: PipelineEvent[]): EventMetrics {
  let scheduled = 0;
  let cancelled = 0;

  for (const event of events) {
    if (event.status === "scheduled") scheduled += 1;
    if (event.status === "cancelled") cancelled += 1;
  }

  return {
    total: events.length,
    scheduled,
    cancelled
  };
}

type PagesTableProps = {
  pages: PipelinePage[];
  selectedIds: Set<string>;
  onToggle: (pageId: string) => void;
};

function PagesTable({ pages, selectedIds, onToggle }: PagesTableProps) {
  const [expanded, setExpanded] = useState<string[]>([]);

  function toggleExpand(pageId: string): void {
    setExpanded(previous =>
      previous.includes(pageId) ? previous.filter(id => id !== pageId) : [...previous, pageId]
    );
  }

  if (pages.length === 0) {
    return <div className="empty-state">No pages discovered yet. Seed a gallery or run discovery.</div>;
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th style={{ width: 36 }}></th>
          <th>Kind</th>
          <th>URL</th>
          <th>Fetch</th>
          <th>Structured</th>
          <th>Updated</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {pages.map(page => {
          const isExpanded = expanded.includes(page.id);
          return (
            <Fragment key={page.id}>
              <tr>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(page.id)}
                    onChange={() => onToggle(page.id)}
                  />
                </td>
                <td>{page.kind}</td>
                <td>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <a href={page.url ?? page.normalized_url} target="_blank" rel="noreferrer">
                      {page.normalized_url}
                    </a>
                    <span style={{ color: "#6b7280", fontSize: "0.8rem" }}>ID: {page.id}</span>
                  </div>
                </td>
                <td>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span>{page.fetch_status}</span>
                    <span style={{ color: "#6b7280", fontSize: "0.8rem" }}>{page.fetched_at ?? "–"}</span>
                  </div>
                </td>
                <td>
                  {page.page_structured ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span>{page.page_structured.parse_status}</span>
                      <span style={{ color: "#6b7280", fontSize: "0.8rem" }}>
                        {page.page_structured.extracted_page_kind ?? "–"}
                      </span>
                      {page.page_structured.extraction_error && (
                        <span style={{ color: "#dc2626", fontSize: "0.8rem" }}>{page.page_structured.extraction_error}</span>
                      )}
                    </div>
                  ) : (
                    <span>–</span>
                  )}
                </td>
                <td>{page.updated_at}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-muted"
                    onClick={() => toggleExpand(page.id)}
                  >
                    {isExpanded ? "Hide markdown" : "Show markdown"}
                  </button>
                </td>
              </tr>
              {isExpanded && (
                <tr>
                  <td colSpan={7}>
                    <div className="preview" style={{ marginTop: 8 }}>
                      {page.page_content?.markdown?.length
                        ? page.page_content.markdown
                        : "No markdown saved for this page."}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

type EventsTableProps = {
  events: PipelineEvent[];
  selectedIds: Set<string>;
  onToggle: (eventId: string) => void;
};

function EventsTable({ events, selectedIds, onToggle }: EventsTableProps) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th style={{ width: 36 }}></th>
          <th>Title</th>
          <th>Status</th>
          <th>Timing</th>
          <th>Occurrences</th>
        </tr>
      </thead>
      <tbody>
        {events.map(event => (
          <tr key={event.id}>
            <td>
              <input type="checkbox" checked={selectedIds.has(event.id)} onChange={() => onToggle(event.id)} />
            </td>
            <td>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <strong>{event.title}</strong>
                {event.event_info?.description && (
                  <span style={{ color: "#6b7280", fontSize: "0.85rem" }}>{event.event_info.description}</span>
                )}
                {event.event_info?.artists && event.event_info.artists.length > 0 && (
                  <span style={{ color: "#6b7280", fontSize: "0.75rem" }}>Artists: {event.event_info.artists.join(", ")}</span>
                )}
              </div>
            </td>
            <td>{event.status}</td>
            <td>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span>Start: {event.start_at ?? "–"}</span>
                <span>End: {event.end_at ?? "–"}</span>
              </div>
            </td>
            <td>
              {event.event_occurrences.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: "1rem", color: "#6b7280", fontSize: "0.8rem" }}>
                  {event.event_occurrences.slice(0, 3).map(occurrence => (
                    <li key={occurrence.id}>{occurrence.start_at}{occurrence.timezone ? ` (${occurrence.timezone})` : ""}</li>
                  ))}
                  {event.event_occurrences.length > 3 && <li>+{event.event_occurrences.length - 3} more</li>}
                </ul>
              ) : (
                <span>–</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
