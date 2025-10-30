import { useMemo, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { LinkRowComponent } from "../../components/common/LinkRowComponent";
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
import { FETCH_STATUSES, PAGE_KINDS } from "../../api";
import type { DashboardAction, PageKind, PipelinePage, PageKindUpdate } from "../../api";

type ParseStatusValue =
  | NonNullable<PipelinePage["page_structured"]>["parse_status"]
  | "never"
  | "processing";

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
      return <span className="text-xs font-medium text-slate-400">N/A</span>;
    }

    const extracting = pendingAction === "extract";
    const parseStatus = page.page_structured?.parse_status ?? "never";

    if (page.fetch_status !== "ok") {
      return <StatusBadge tone="warning">Scrape first</StatusBadge>;
    }

    if (parseStatus === "ok") {
      return (
        <div className="flex items-center gap-2">
          <StatusBadge tone="success">Extracted</StatusBadge>
          <Button
            type="button"
            variant="muted"
            onClick={() => onExtractPage(page.id)}
            disabled={extracting}
          >
            {extracting ? "Extracting..." : "Re-extract"}
          </Button>
        </div>
      );
    }

    const statusLabel = formatStructuredStatus(parseStatus);
    return (
      <div className="flex items-center gap-2">
        <StatusBadge tone="info">{statusLabel}</StatusBadge>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onExtractPage(page.id)}
          disabled={extracting}
        >
          {extracting ? "Extracting..." : "Extract to JSON"}
        </Button>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Pages</CardTitle>
          <CardSubtitle>Filter, inspect and reclassify discovered pages.</CardSubtitle>
        </div>
      </CardHeader>

      <CardBody className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <FormField label="Search" htmlFor="page-search">
            <input
              id="page-search"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              placeholder="Filter by normalized URL"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </FormField>
          <FormField label="Page kind" htmlFor="page-kind-filter">
            <select
              id="page-kind-filter"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              value={selectedKind}
              onChange={handleKindFilterChange}
            >
              <option value="all">All</option>
              {kindOptions.map(kind => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Fetch status" htmlFor="page-status-filter">
            <select
              id="page-status-filter"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              value={selectedStatus}
              onChange={handleStatusFilterChange}
            >
              <option value="all">All</option>
              {statusOptions.map(status => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Sort" htmlFor="page-sort">
            <select
              id="page-sort"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              value={sortOrder}
              onChange={handleSortChange}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="alphabetical">Alphabetical</option>
            </select>
          </FormField>
        </div>

        <Table className="rounded-lg border border-slate-200">
          <TableHead>
            <TableRow className="bg-slate-50">
              <TableHeaderCell>Page</TableHeaderCell>
              <TableHeaderCell>Kind</TableHeaderCell>
              <TableHeaderCell>Fetch status</TableHeaderCell>
              <TableHeaderCell>Structured status</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredPages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-slate-500">
                  No pages match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredPages.map(page => (
                <TableRow key={page.id}>
                  <TableCell>
                    <LinkRowComponent
                      href={page.url ?? page.normalized_url}
                      label={page.normalized_url}
                      description={page.url ?? undefined}
                    />
                  </TableCell>
                  <TableCell className="w-[160px]">
                    <select
                      value={page.kind}
                      onChange={event => handleKindChange(event, page)}
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    >
                      {kindOptions.map(kind => (
                        <option key={kind} value={kind}>
                          {kind}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <StatusPill status={page.fetch_status}>{formatFetchStatus(page.fetch_status)}</StatusPill>
                  </TableCell>
                  <TableCell>{renderStructuredCell(page)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="muted"
                        onClick={() => onPreviewMarkdown(page.id, page.normalized_url)}
                        disabled={page.fetch_status !== "ok"}
                      >
                        Preview
                      </Button>
                        <Button type="button" variant="secondary" onClick={() => onScrapePage(page.id)}>
                          {page.fetch_status === "fetching" ? "Queued..." : "Scrape"}
                        </Button>
                      <Button type="button" variant="secondary" onClick={() => onExtractPage(page.id)}>
                        Extract
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardBody>
    </Card>
  );
}

function formatStructuredStatus(status: ParseStatusValue): string {
  switch (status) {
    case "error":
      return "Extraction error";
    case "processing":
      return "Processing";
    case "queued":
      return "Queued";
    case "never":
      return "Never extracted";
    default:
      return status;
  }
}

function formatFetchStatus(status: PipelinePage["fetch_status"]): string {
  switch (status) {
    case "ok":
      return "Scraped";
    case "queued":
      return "Queued";
    case "fetching":
      return "Fetching";
    case "error":
      return "Error";
    case "skipped":
      return "Skipped";
    default:
      return "Never";
  }
}

function FormField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium text-slate-700" htmlFor={htmlFor}>
      {label}
      {children}
    </label>
  );
}

function StatusPill({ status, children }: { status: PipelinePage["fetch_status"]; children: ReactNode }) {
  const tone =
    status === "ok"
      ? "success"
      : status === "error"
        ? "danger"
        : status === "fetching" || status === "queued"
          ? "info"
          : "muted";

  return <StatusBadge tone={tone}>{children}</StatusBadge>;
}

function StatusBadge({ tone, children }: { tone: "success" | "danger" | "warning" | "info" | "muted"; children: ReactNode }) {
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
