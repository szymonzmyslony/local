import { useMemo, useState, type ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button, Input } from "@shared/ui";
import { DataTable, DataTableColumnHeader } from "../../components/data-table";
import { FETCH_STATUSES, PAGE_KINDS } from "../../api";
import type { DashboardAction, PageKind, PageKindUpdate, PipelinePage } from "../../api";

type PageLinksViewProps = {
  pages: PipelinePage[];
  pendingAction: DashboardAction | null;
  onScrapePages: (pageIds: string[]) => void;
  onExtractPages: (pageIds: string[]) => void;
  onUpdatePageKind: (updates: PageKindUpdate[]) => void;
  onPreviewPages: (rows: { id: string; label: string }[]) => Promise<void> | void;
};

type SortOrder = "newest" | "oldest" | "alphabetical";

export function PageLinksView({
  pages,
  pendingAction,
  onScrapePages,
  onExtractPages,
  onPreviewPages,
  onUpdatePageKind
}: PageLinksViewProps) {
  const [search, setSearch] = useState("");
  const [selectedKind, setSelectedKind] = useState<PageKind | "all">("all");
  const [selectedStatus, setSelectedStatus] = useState<PipelinePage["fetch_status"] | "all">("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

  const filteredPages = useMemo(() => {
    const term = search.trim().toLowerCase();
    const byKind = selectedKind;
    const byStatus = selectedStatus;
    const sorted = [...pages].filter(page => {
      if (byKind !== "all" && page.kind !== byKind) return false;
      if (byStatus !== "all" && page.fetch_status !== byStatus) return false;
      if (!term) return true;
      return page.normalized_url.toLowerCase().includes(term);
    });

    sorted.sort((a, b) => {
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

    return sorted;
  }, [pages, search, selectedKind, selectedStatus, sortOrder]);

  const columns = useMemo<ColumnDef<PipelinePage>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <input
            type="checkbox"
            aria-label="Select all"
            className="size-4 rounded border border-slate-300 text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            checked={table.getIsAllPageRowsSelected()}
            ref={input => {
              if (input) {
                input.indeterminate = table.getIsSomePageRowsSelected();
              }
            }}
            onChange={event => table.toggleAllPageRowsSelected(event.target.checked)}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label="Select row"
            className="size-4 rounded border border-slate-300 text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            checked={row.getIsSelected()}
            onChange={event => row.toggleSelected(event.target.checked)}
            onClick={event => event.stopPropagation()}
          />
        ),
        enableSorting: false,
        meta: { cellClassName: "w-10" }
      },
      {
        accessorKey: "normalized_url",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Page" />,
        cell: ({ row }) => {
          const page = row.original;
          return (
            <div className="flex flex-col gap-1">
              <a
                href={page.url ?? page.normalized_url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-blue-600 hover:underline"
              >
                {page.normalized_url}
              </a>
              <span className="text-xs uppercase tracking-wide text-slate-400">{page.kind}</span>
            </div>
          );
        },
        meta: { headerClassName: "min-w-[240px]" }
      },
      {
        id: "kind",
        header: () => <span className="font-semibold text-slate-700">Kind</span>,
        cell: ({ row }) => {
          const page = row.original;
          return (
            <select
              value={page.kind}
              onChange={event => handleKindChange(event.target.value, page, onUpdatePageKind)}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              {PAGE_KINDS.map(kind => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          );
        },
        meta: { cellClassName: "w-[160px]" }
      },
      {
        id: "fetch_status",
        header: () => <span className="font-semibold text-slate-700">Fetch status</span>,
        cell: ({ row }) => (
          <StatusBadge status={row.original.fetch_status}>{formatFetchStatus(row.original.fetch_status)}</StatusBadge>
        ),
        meta: { cellClassName: "w-[140px]" }
      },
      {
        id: "structured",
        header: () => <span className="font-semibold text-slate-700">Structured output</span>,
        cell: ({ row }) => renderStructuredCell(row.original, pendingAction === "extract", onExtractPages),
        meta: { cellClassName: "min-w-[220px]" }
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const page = row.original;
          const scraping = pendingAction === "scrape";
          return (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="muted"
                size="sm"
                onClick={() => {
                  console.log("[PageLinksView] preview requested", { pageId: page.id });
                  void onPreviewPages([{ id: page.id, label: page.normalized_url }]);
                }}
                disabled={page.fetch_status !== "ok"}
              >
                Preview
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  console.log("[PageLinksView] scrape requested", { pageId: page.id });
                  onScrapePages([page.id]);
                }}
                disabled={scraping || page.fetch_status === "fetching"}
              >
                {scraping ? "Working…" : page.fetch_status === "fetching" ? "Queued" : "Scrape"}
              </Button>
            </div>
          );
        },
        meta: { cellClassName: "w-[180px]" }
      }
    ],
    [onPreviewPages, onScrapePages, onExtractPages, onUpdatePageKind, pendingAction]
  );

  return (
    <section className="space-y-6">
      <DataTable
        columns={columns}
        data={filteredPages}
        getRowId={row => row.id}
        emptyMessage="No pages match the current filters."
        enableRowSelection
        renderToolbar={table => {
          const selectedRows = table.getSelectedRowModel().rows;
          const selectedPages = selectedRows.map(row => row.original);
          const selectedIds = selectedPages.map(page => page.id);
          const selectionDisabled = selectedIds.length === 0;

          return (
            <div className="flex flex-col gap-4">
              <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
                <FilterField label="Search">
                  <Input
                    placeholder="Filter by normalized URL…"
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                  />
                </FilterField>
                <FilterField label="Page kind">
                  <select
                    value={selectedKind}
                    onChange={event => setSelectedKind(event.target.value as PageKind | "all")}
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    <option value="all">All kinds</option>
                    {PAGE_KINDS.map(kind => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </select>
                </FilterField>
                <FilterField label="Fetch status">
                  <select
                    value={selectedStatus}
                    onChange={event => setSelectedStatus(event.target.value as PipelinePage["fetch_status"] | "all")}
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    <option value="all">All statuses</option>
                    {FETCH_STATUSES.map(status => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </FilterField>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <FilterField label="Sort">
                  <select
                    value={sortOrder}
                    onChange={event => setSortOrder(event.target.value as SortOrder)}
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="alphabetical">Alphabetical</option>
                  </select>
                </FilterField>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={selectionDisabled}
                    onClick={() => {
                      if (selectionDisabled) return;
                      onScrapePages(selectedIds);
                    }}
                  >
                    Scrape selected
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={selectionDisabled}
                    onClick={() => {
                      if (selectionDisabled) return;
                      onExtractPages(selectedIds);
                    }}
                  >
                    Extract selected
                  </Button>
                </div>
              </div>
            </div>
          );
        }}
      />
    </section>
  );
}

function handleKindChange(value: string, page: PipelinePage, onUpdate: PageLinksViewProps["onUpdatePageKind"]): void {
  if (value === page.kind) return;
  const match = PAGE_KINDS.find(kind => kind === value);
  if (!match) return;
  onUpdate([{ pageId: page.id, kind: match }]);
}

function renderStructuredCell(
  page: PipelinePage,
  extracting: boolean,
  onExtractPages: PageLinksViewProps["onExtractPages"]
): ReactNode {
  const parseStatus = page.page_structured?.parse_status ?? "never";
  if (page.kind !== "event" && page.kind !== "galery_event_page") {
    return <StatusBadge status="skipped">N/A</StatusBadge>;
  }

  if (page.fetch_status !== "ok") {
    return <StatusBadge status="queued">Scrape first</StatusBadge>;
  }

  if (parseStatus === "ok") {
    return (
      <div className="flex items-center gap-2">
        <StatusBadge status="ok">Extracted</StatusBadge>
        <Button
          type="button"
          variant="muted"
          size="sm"
          onClick={() => {
            console.log("[PageLinksView] re-extract requested", { pageId: page.id });
            onExtractPages([page.id]);
          }}
          disabled={extracting}
        >
          {extracting ? "Processing…" : "Re-extract"}
        </Button>
      </div>
    );
  }

  if (parseStatus === "error") {
    return (
      <div className="flex items-center gap-2">
        <StatusBadge status="error">Extraction error</StatusBadge>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onExtractPages([page.id])}
          disabled={extracting}
        >
          {extracting ? "Processing…" : "Retry extract"}
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => {
        console.log("[PageLinksView] extract requested", { pageId: page.id });
        onExtractPages([page.id]);
      }}
      disabled={extracting}
    >
      {extracting ? "Processing…" : "Extract to JSON"}
    </Button>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex w-full flex-col gap-1 text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

function StatusBadge({ status, children }: { status: PipelinePage["fetch_status"]; children: ReactNode }) {
  const tone =
    status === "ok"
      ? "bg-emerald-100 text-emerald-700"
      : status === "error"
        ? "bg-rose-100 text-rose-700"
        : status === "fetching" || status === "queued"
          ? "bg-blue-100 text-blue-700"
          : status === "skipped"
            ? "bg-amber-100 text-amber-700"
            : "bg-slate-100 text-slate-600";

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {children}
    </span>
  );
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
