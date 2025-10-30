import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { LinkRowComponent } from "../../components/common/LinkRowComponent";
import { Button } from "../../components/ui/button";
import { FETCH_STATUSES, PAGE_KINDS } from "../../api";
import type { DashboardAction, PageKind, PipelinePage, PageKindUpdate } from "../../api";

type ParseStatusValue = NonNullable<PipelinePage["page_structured"]>["parse_status"] | "never";

type PageLinksViewProps = {
  pages: PipelinePage[];
  pendingAction: DashboardAction | null;
  onPreviewMarkdown: (pageId: string, label: string) => void;
  onScrapePage: (pageId: string) => void;
  onExtractPage: (pageId: string) => void;
  onUpdatePageKind: (updates: PageKindUpdate[]) => void;
};

type SortOrder = "newest" | "oldest" | "alphabetical";

export function PageLinksView({
  pages,
  pendingAction,
  onPreviewMarkdown,
  onScrapePage,
  onExtractPage,
  onUpdatePageKind
}: PageLinksViewProps) {
  const [search, setSearch] = useState("");
  const [selectedKind, setSelectedKind] = useState<PageKind | "all">("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [selectedStatus, setSelectedStatus] = useState<PipelinePage["fetch_status"] | "all">("all");
  const kindOptions: readonly PageKind[] = PAGE_KINDS;
  const statusOptions: readonly PipelinePage["fetch_status"][] = FETCH_STATUSES;

  const filteredPages = useMemo(() => {
    const term = search.trim().toLowerCase();
    return pages
      .filter(page => {
        if (selectedKind !== "all" && page.kind !== selectedKind) return false;
        if (selectedStatus !== "all" && page.fetch_status !== selectedStatus) return false;
        if (!term) return true;
        return page.normalized_url.toLowerCase().includes(term);
      })
      .sort((a, b) => {
        switch (sortOrder) {
          case "alphabetical":
            return a.normalized_url.localeCompare(b.normalized_url);
          case "oldest":
            return (a.created_at ?? "").localeCompare(b.created_at ?? "");
          case "newest":
          default:
            return (b.created_at ?? "").localeCompare(a.created_at ?? "");
        }
      });
  }, [pages, search, selectedKind, selectedStatus, sortOrder]);


  function handleKindChange(event: ChangeEvent<HTMLSelectElement>, page: PipelinePage): void {
    const { value } = event.target;
    const match = kindOptions.find(option => option === value);
    if (!match || match === page.kind) return;
    onUpdatePageKind([{ pageId: page.id, kind: match }]);
  }

  function handleKindFilterChange(event: ChangeEvent<HTMLSelectElement>): void {
    const { value } = event.target;
    if (value === "all") {
      setSelectedKind("all");
      return;
    }
    const match = kindOptions.find(option => option === value);
    if (match) {
      setSelectedKind(match);
    }
  }

  function handleStatusFilterChange(event: ChangeEvent<HTMLSelectElement>): void {
    const { value } = event.target;
    if (value === "all") {
      setSelectedStatus("all");
      return;
    }
    const match = statusOptions.find(option => option === value);
    if (match) {
      setSelectedStatus(match);
    }
  }

  function handleSortChange(event: ChangeEvent<HTMLSelectElement>): void {
    const { value } = event.target;
    if (value === "newest" || value === "oldest" || value === "alphabetical") {
      setSortOrder(value);
    }
  }

  const renderStructuredCell = (page: PipelinePage) => {
    if (page.kind !== "event_detail") {
      return <span className="structured-na">N/A</span>;
    }

    const extracting = pendingAction === "extract";
    const parseStatus = page.page_structured?.parse_status ?? "never";

    if (page.fetch_status !== "ok") {
      return <span className="structured-label structured-pending">Scrape first</span>;
    }

    if (parseStatus === "ok") {
      return (
        <div className="actions">
          <span className="structured-label">Extracted</span>
          <Button
            type="button"
            variant="muted"
            onClick={() => onExtractPage(page.id)}
            disabled={extracting}
          >
            {extracting ? "Extracting…" : "Re-extract"}
          </Button>
        </div>
      );
    }

    const statusLabel = formatStructuredStatus(parseStatus);
    return (
      <div className="actions">
        <span className="structured-label">{statusLabel}</span>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onExtractPage(page.id)}
          disabled={extracting}
        >
          {extracting ? "Extracting…" : "Extract to JSON"}
        </Button>
      </div>
    );
  };

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <h2 className="card-title">Pages</h2>
          <p className="card-subtitle">Filter, inspect and reclassify discovered pages.</p>
        </div>
      </header>

      <div className="controls-row">
        <div className="field">
          <label htmlFor="page-search">Search</label>
          <input
            id="page-search"
            placeholder="Filter by normalized URL"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="page-kind-filter">Page kind</label>
          <select
            id="page-kind-filter"
            value={selectedKind}
            onChange={event => handleKindFilterChange(event)}
          >
            <option value="all">All</option>
            {kindOptions.map(kind => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="page-status-filter">Fetch status</label>
          <select
            id="page-status-filter"
            value={selectedStatus}
            onChange={event => handleStatusFilterChange(event)}
          >
            <option value="all">All</option>
            {statusOptions.map(status => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="page-sort">Sort</label>
          <select
            id="page-sort"
            value={sortOrder}
            onChange={handleSortChange}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="alphabetical">A → Z</option>
          </select>
        </div>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Page</th>
            <th>Kind</th>
            <th>Status</th>
            <th>Markdown</th>
            <th>Structured</th>
          </tr>
        </thead>
        <tbody>
          {filteredPages.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", color: "#6b7280" }}>
                No pages match the current filters.
              </td>
            </tr>
          ) : (
            filteredPages.map(page => (
              <tr key={page.id}>
                <td>
                  <LinkRowComponent
                    href={page.url ?? page.normalized_url}
                    label={page.normalized_url}
                    description={page.page_content?.parsed_at ?? undefined}
                  />
                </td>
                <td>
                  <select
                    value={page.kind}
                    onChange={event => handleKindChange(event, page)}
                    disabled={pendingAction === "updateKinds"}
                  >
                    {kindOptions.map(kind => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{page.fetch_status}</td>
                <td>
                  <div className="actions">
                    {page.fetch_status === "ok" ? (
                      <Button
                        type="button"
                        variant="muted"
                        onClick={() => onPreviewMarkdown(page.id, page.normalized_url)}
                      >
                        Preview
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => onScrapePage(page.id)}
                      disabled={pendingAction === "scrape"}
                    >
                      {pendingAction === "scrape"
                        ? "Scraping…"
                        : page.fetch_status === "ok"
                          ? "Rescrape"
                          : "Scrape"}
                    </Button>
                  </div>
                </td>
                <td>{renderStructuredCell(page)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

function formatStructuredStatus(status: ParseStatusValue): string {
  switch (status) {
    case "never":
      return "Not extracted";
    case "queued":
      return "Queued";
    case "error":
      return "Error";
    default:
      return status;
  }
}
