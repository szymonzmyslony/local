import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { Badge, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui";
import { DataTable, DataTableColumnHeader } from "../../components/data-table";
import { FETCH_STATUSES, PAGE_KINDS, type PageStatus } from "../../api";
import type { DashboardAction, FetchStatus, GalleryDetail, GalleryPage, PageKind, PageKindUpdate } from "../../api";

type PageLinksViewProps = {
  gallery: GalleryDetail | null;
  pages: GalleryPage[];
  pendingAction: DashboardAction | null;
  onScrapePages: (pageIds: string[]) => Promise<void>;
  onUpdatePageKind: (updates: PageKindUpdate[]) => Promise<number>;
  onMarkPagesAsEvent: (pageIds: string[]) => Promise<void> | void;
  onPreviewPages: (rows: { id: string; label: string }[]) => Promise<void> | void;
};

type SortOrder = "newest" | "oldest" | "alphabetical";

export function PageLinksView({
  gallery: _gallery,
  pages,
  pendingAction,
  onScrapePages,
  onMarkPagesAsEvent,
  onPreviewPages,
  onUpdatePageKind
}: PageLinksViewProps) {
  const [search, setSearch] = useState("");
  const [selectedKind, setSelectedKind] = useState<PageKind | "all">("all");
  const [selectedScrapeStatus, setSelectedScrapeStatus] = useState<FetchStatus | "all">("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const filteredPages = useMemo(() => {
    const term = search.trim().toLowerCase();
    const byKind = selectedKind;
    const byStatus = selectedScrapeStatus;
    const sorted = [...pages].filter(page => {
      if (byKind !== "all" && page.kind !== byKind) return false;
      if (byStatus !== "all" && page.status.scrape !== byStatus) return false;
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
  }, [pages, search, selectedKind, selectedScrapeStatus, sortOrder]);

  const selectedPageIds = useMemo(
    () => Object.entries(rowSelection).filter(([, value]) => value).map(([rowId]) => rowId),
    [rowSelection]
  );
  const selectedPages = useMemo(
    () => pages.filter(page => selectedPageIds.includes(page.id)),
    [pages, selectedPageIds]
  );

  useEffect(() => {
    setRowSelection({});
  }, [pages]);

  const columns = useMemo<ColumnDef<GalleryPage>[]>(
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
          return <Badge variant="outline" className="capitalize">{page.kind}</Badge>;
        },
        meta: { cellClassName: "w-[140px]" }
      },
      {
        id: "status",
        header: () => <span className="font-semibold text-slate-700">Status</span>,
        cell: ({ row }) => renderStatusBadges(row.original, onPreviewPages),
        meta: { cellClassName: "min-w-[220px]" }
      }
    ],
    [onPreviewPages]
  );

  const busyScrape = pendingAction === "scrape";
  const busyPromote = pendingAction === "scrapeAndExtract";

  return (
    <section className="space-y-6">
      <DataTable
        columns={columns}
        data={filteredPages}
        getRowId={row => row.id}
        emptyMessage="No pages match the current filters."
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        renderToolbar={table => {
          const selectionDisabled = selectedPageIds.length === 0;

          return (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <FieldGroup label="Search">
                  <Input
                    placeholder="Filter by normalized URL…"
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                  />
                </FieldGroup>
                <FieldGroup label="Page kind">
                  <Select value={selectedKind} onValueChange={value => setSelectedKind(value as PageKind | "all")}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="All kinds" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All kinds</SelectItem>
                      {PAGE_KINDS.map(kind => (
                        <SelectItem key={kind} value={kind}>
                          {kind}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldGroup>
                <FieldGroup label="Scrape status">
                  <Select
                    value={selectedScrapeStatus}
                    onValueChange={value => setSelectedScrapeStatus(value as FetchStatus | "all")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="All scrape states" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All scrape states</SelectItem>
                      {FETCH_STATUSES.map(status => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldGroup>
                <FieldGroup label="Sort order">
                  <Select value={sortOrder} onValueChange={value => setSortOrder(value as SortOrder)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest first</SelectItem>
                      <SelectItem value="oldest">Oldest first</SelectItem>
                      <SelectItem value="alphabetical">Alphabetical</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldGroup>
              </div>
              <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-slate-600">
                  <span>{filteredPages.length} pages</span>
                  <span className="hidden md:inline"> • </span>
                  <span>{selectedPageIds.length} selected</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={selectionDisabled || busyScrape}
                    onClick={() => {
                      if (selectionDisabled) return;
                      console.log("[PageLinksView] bulk scrape", { ids: selectedPageIds });
                      void (async () => {
                        await onScrapePages(selectedPageIds);
                        table.resetRowSelection();
                      })();
                    }}
                  >
                    {busyScrape ? "Scraping…" : "Scrape selected"}
                  </Button>
                  <Button
                    type="button"
                    variant="muted"
                    disabled={selectionDisabled}
                    onClick={() => {
                      if (selectionDisabled) return;
                      console.log("[PageLinksView] mark as other selected pages", {
                        ids: selectedPageIds
                      });
                      void (async () => {
                        await onUpdatePageKind(
                          selectedPageIds.map(id => ({ pageId: id, kind: "other" as PageKind }))
                        );
                        table.resetRowSelection();
                      })();
                    }}
                  >
                    Mark as other
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={selectionDisabled || busyPromote}
                    onClick={() => {
                      if (selectionDisabled) return;
                      console.log("[PageLinksView] mark as event selected pages", {
                        count: selectedPages.length,
                        ids: selectedPages.map(page => page.id),
                        kinds: selectedPages.map(page => page.kind)
                      });
                      void (async () => {
                        await onMarkPagesAsEvent(selectedPageIds);
                        table.resetRowSelection();
                      })();
                    }}
                  >
                    {busyPromote ? "Promoting…" : "Mark as event"}
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

function handlePreview(page: GalleryPage, onPreviewPages: PageLinksViewProps["onPreviewPages"]): void {
  console.log("[PageLinksView] preview requested", { pageId: page.id });
  void onPreviewPages([{ id: page.id, label: page.normalized_url }]);
}

function FieldGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex w-full flex-col gap-2 text-sm text-slate-700">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

type Tone = "success" | "info" | "warn" | "danger" | "muted";

const toneClasses: Record<Tone, string> = {
  success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  info: "bg-blue-50 text-blue-700 border border-blue-200",
  warn: "bg-amber-50 text-amber-700 border border-amber-200",
  danger: "bg-rose-50 text-rose-700 border border-rose-200",
  muted: "bg-slate-100 text-slate-600 border border-slate-200"
};

function renderStatusBadges(
  page: GalleryPage,
  onPreview: PageLinksViewProps["onPreviewPages"]
) {
  const tokens = buildStatusTokens(page.status);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tokens.map(token => (
        <Badge key={token.key} variant="outline" className={toneClasses[token.tone]}>
          {token.label}
        </Badge>
      ))}
      {page.status.scrape === "ok" ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => handlePreview(page, onPreview)}
        >
          Preview
        </Button>
      ) : null}
    </div>
  );
}

function buildStatusTokens(status: PageStatus): Array<{ key: string; label: string; tone: Tone }> {
  const tokens: Array<{ key: string; label: string; tone: Tone }> = [];
  tokens.push({ key: "scrape", ...formatScrapeStatus(status.scrape) });
  tokens.push({ key: "extract", ...formatExtractStatus(status.extract) });
  tokens.push({ key: "event", ...formatEventStatus(status.event) });
  return tokens;
}

function formatScrapeStatus(status: FetchStatus): { label: string; tone: Tone } {
  switch (status) {
    case "ok":
      return { label: "Scraped", tone: "success" };
    case "error":
      return { label: "Scrape error", tone: "danger" };
    case "fetching":
      return { label: "Scraping", tone: "info" };
    case "queued":
      return { label: "Scrape queued", tone: "info" };
    case "skipped":
      return { label: "Scrape skipped", tone: "warn" };
    default:
      return { label: "Never scraped", tone: "muted" };
  }
}

function formatExtractStatus(status: PageStatus["extract"]): { label: string; tone: Tone } {
  switch (status) {
    case "ok":
      return { label: "Extracted", tone: "success" };
    case "error":
      return { label: "Extract error", tone: "danger" };
    case "pending":
      return { label: "Extract pending", tone: "info" };
    default:
      return { label: "Not extracted", tone: "muted" };
  }
}

function formatEventStatus(status: PageStatus["event"]): { label: string; tone: Tone } {
  switch (status) {
    case "ready":
      return { label: "Event ready", tone: "success" };
    default:
      return { label: "No event", tone: "warn" };
  }
}
