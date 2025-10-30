import { useMemo, useState, type ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button, Input } from "@shared/ui";
import { DataTable, DataTableColumnHeader } from "../../components/data-table";
import type { PreviewDialogItem } from "../../components/preview/PreviewDialog";
import { EVENT_STATUSES } from "../../api";
import type { DashboardAction, PipelineEvent, PipelinePage } from "../../api";

type EventsViewProps = {
  events: PipelineEvent[];
  pages: PipelinePage[];
  pendingAction: DashboardAction | null;
  onProcessEventPages: (pageIds: string[]) => void;
  onPreview: (payload: { title: string; description?: string; items: PreviewDialogItem[] }) => void;
};

type EventSort = "nearest" | "latest" | "title";

export function EventsView({
  events,
  pages,
  pendingAction,
  onProcessEventPages,
  onPreview
}: EventsViewProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PipelineEvent["status"] | "all">("all");
  const [sortOrder, setSortOrder] = useState<EventSort>("nearest");

  const pageById = useMemo(() => {
    const map = new Map<string, PipelinePage>();
    for (const page of pages) {
      map.set(page.id, page);
    }
    return map;
  }, [pages]);

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return events
      .filter(event => {
        if (statusFilter !== "all" && event.status !== statusFilter) return false;
        if (!query) return true;
        const haystack = `${event.title} ${event.ticket_url ?? ""}`.toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => compareEvents(a, b, sortOrder));
  }, [events, search, statusFilter, sortOrder]);

  const columns = useMemo<ColumnDef<PipelineEvent>[]>(
    () => [
      {
        accessorKey: "title",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Event" />,
        cell: ({ row }) => {
          const event = row.original;
          return (
            <div className="flex flex-col gap-1">
              <span className="font-medium text-slate-900">{event.title}</span>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{formatEventDate(event)}</span>
                <EventStatusBadge status={event.status} />
              </div>
            </div>
          );
        },
        meta: { headerClassName: "min-w-[220px]" }
      },
      {
        id: "source",
        header: () => <span className="font-semibold text-slate-700">Source page</span>,
        cell: ({ row }) => {
          const event = row.original;
          if (!event.page_id) {
            return <span className="text-sm text-slate-500">No page</span>;
          }
          const page = pageById.get(event.page_id) ?? null;
          if (!page) {
            return <span className="text-sm text-slate-500">No page</span>;
          }
          return (
            <div className="flex flex-col gap-1">
              <a
                href={page.url ?? page.normalized_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                {page.normalized_url}
              </a>
              <span className="text-xs uppercase tracking-wide text-slate-400">{page.kind}</span>
            </div>
          );
        },
        meta: { headerClassName: "min-w-[200px]" }
      },
      {
        id: "structured",
        header: () => <span className="font-semibold text-slate-700">Structured output</span>,
        cell: ({ row }) => {
          const event = row.original;
          const page = event.page_id ? pageById.get(event.page_id) ?? null : null;
          const canExtract = Boolean(page && page.fetch_status === "ok");
          const extracting = pendingAction === "process";
          const hasStructured = Boolean(event.event_info);

          if (hasStructured) {
            return (
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone="success">Structured</StatusPill>
                <Button
                  type="button"
                  variant="muted"
                  size="sm"
                  onClick={() => {
                    console.log("[EventsView] view structured", { eventId: event.id });
                    onPreview({
                      title: event.title,
                      description: "Structured event payload generated from markdown.",
                      items: [
                        {
                          title: event.title,
                          content: formatStructured(event)
                        }
                      ]
                    });
                  }}
                >
                  View structured
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
                if (event.page_id) {
                  console.log("[EventsView] process event pages", { pageId: event.page_id, eventId: event.id });
                  onProcessEventPages([event.page_id]);
                }
              }}
              disabled={!event.page_id || !canExtract || extracting}
            >
              {extracting
                ? "Processing…"
                : !event.page_id
                  ? "No page"
                  : !canExtract
                    ? "Scrape page first"
                    : "Get structured output"}
            </Button>
          );
        },
        meta: { cellClassName: "min-w-[220px]" }
      },
    ],
    [onProcessEventPages, pageById, pendingAction, onPreview]
  );

  return (
    <section className="space-y-6">
      <DataTable
        columns={columns}
        data={filteredEvents}
        getRowId={row => row.id}
        emptyMessage="No events match the current filters."
        enableRowSelection
        renderToolbar={table => {
          const selectedRows = table.getSelectedRowModel().rows;
          const selectedEvents = selectedRows.map(row => row.original);
          const selectedWithPages = selectedEvents.filter(event => event.page_id);
          const selectedPageIds = selectedWithPages
            .map(event => event.page_id)
            .filter((value): value is string => Boolean(value));

          return (
            <div className="flex flex-col gap-4">
              <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
                <FilterField label="Search">
                  <Input
                    placeholder="Filter by title or ticket URL…"
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                  />
                </FilterField>
                <FilterField label="Status">
                  <select
                    value={statusFilter}
                    onChange={event => setStatusFilter(event.target.value as PipelineEvent["status"] | "all")}
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    <option value="all">All statuses</option>
                    {EVENT_STATUSES.map(status => (
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
                    onChange={event => setSortOrder(event.target.value as EventSort)}
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    <option value="nearest">Nearest start</option>
                    <option value="latest">Latest start</option>
                    <option value="title">Title</option>
                  </select>
                </FilterField>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={selectedPageIds.length === 0}
                    onClick={() => {
                      if (selectedPageIds.length === 0) return;
                      onProcessEventPages(selectedPageIds);
                    }}
                  >
                    Process selected
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

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex w-full flex-col gap-1 text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

function StatusPill({ tone, children }: { tone: "success" | "danger" | "warning" | "info"; children: ReactNode }) {
  const toneClass =
    tone === "success"
      ? "bg-emerald-100 text-emerald-700"
      : tone === "danger"
        ? "bg-rose-100 text-rose-700"
        : tone === "warning"
          ? "bg-amber-100 text-amber-700"
          : "bg-blue-100 text-blue-700";

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${toneClass}`}>
      {children}
    </span>
  );
}

function EventStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone =
    normalized === "cancelled"
      ? "bg-rose-100 text-rose-700"
      : normalized === "postponed"
        ? "bg-amber-100 text-amber-700"
        : normalized === "rescheduled"
          ? "bg-blue-100 text-blue-700"
          : normalized === "scheduled"
            ? "bg-emerald-100 text-emerald-700"
            : "bg-slate-200 text-slate-600";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${tone}`}>
      {status}
    </span>
  );
}

function compareEvents(left: PipelineEvent, right: PipelineEvent, order: EventSort): number {
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

function formatEventDate(event: PipelineEvent): string {
  if (event.start_at) {
    try {
      return new Date(event.start_at).toLocaleString();
    } catch {
      return event.start_at;
    }
  }
  return event.created_at ? new Date(event.created_at).toLocaleString() : "No start date";
}

function formatStructured(event: PipelineEvent): string {
  if (event.event_info?.md) return event.event_info.md;
  if (event.event_info?.data) {
    return JSON.stringify(event.event_info.data, null, 2);
  }
  return "No structured output saved.";
}
