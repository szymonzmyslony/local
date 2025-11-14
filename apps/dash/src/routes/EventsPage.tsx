import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui";
import { DataTable, DataTableColumnHeader } from "../components/data-table";
import { DashboardShell } from "../components/layout";
import { StatusMessages } from "../components/status";
import {
  EVENT_STATUSES,
  listEventsAll,
  searchEvents,
  type EventListEntry,
  type EventSearchMatch,
  type EventStatus,
  type EventsQueryParams
} from "../api";
import { useDashboard } from "../providers/dashboard-context";

type StatusFilter = "all" | EventStatus;
type GalleryFilter = "all" | string;

function formatEventDate(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function EventsPage() {
  const { galleries, refreshGalleries } = useDashboard();
  const [events, setEvents] = useState<EventListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [galleryFilter, setGalleryFilter] = useState<GalleryFilter>("all");
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [semanticMatches, setSemanticMatches] = useState<EventSearchMatch[] | null>(null);
  const [semanticSearching, setSemanticSearching] = useState(false);
  const [semanticError, setSemanticError] = useState<string | null>(null);

  const shellStatus = loading ? "Loading events…" : semanticSearching ? "Running vector search…" : null;

  const columns = useMemo<ColumnDef<EventListEntry>[]>(
    () => [
      {
        accessorKey: "title",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Event" />,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex flex-col gap-1">
              <span className="font-medium text-slate-900">{item.title}</span>
              {item.event_info?.description ? (
                <span className="text-xs text-slate-500 line-clamp-2">{item.event_info.description}</span>
              ) : null}
            </div>
          );
        }
      },
      {
        id: "gallery",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Gallery" />,
        cell: ({ row }) => {
          const gallery = row.original.gallery;
          if (!gallery) {
            return <span className="text-sm text-slate-500">Unknown</span>;
          }
          const name = gallery.gallery_info?.name ?? gallery.normalized_main_url ?? gallery.main_url ?? "Unknown";
          return <span className="text-sm text-slate-700">{name}</span>;
        }
      },
      {
        id: "start",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Start" />,
        accessorFn: row => row.start_at ?? null,
        cell: ({ row }) => {
          const start = row.original.start_at ?? null;
          return <span className="text-sm text-slate-700">{formatEventDate(start)}</span>;
        }
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <span className="text-sm text-slate-700 capitalize">{row.original.status}</span>
      }
    ],
    []
  );

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return events;
    }
    return events.filter(event => {
      const haystack = [
        event.title,
        event.event_info?.description ?? "",
        event.gallery?.gallery_info?.name ?? "",
        event.gallery?.normalized_main_url ?? ""
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [events, search]);

  const eventsById = useMemo(() => new Map(events.map(event => [event.id, event])), [events]);

  useEffect(() => {
    if (!galleries.length) {
      void refreshGalleries();
    }
  }, [galleries.length, refreshGalleries]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSemanticMatches(null);
    setSemanticError(null);
    try {
      const params: EventsQueryParams = {
        order: "asc",
        limit: 200
      };
      if (statusFilter !== "all") {
        params.statuses = [statusFilter];
      }
      if (galleryFilter !== "all") {
        params.galleryIds = [galleryFilter];
      }
      if (upcomingOnly) {
        params.upcoming = true;
      }
      const data = await listEventsAll(params);
      setEvents(data);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : String(issue));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [galleryFilter, upcomingOnly, statusFilter]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  async function handleSemanticSearch(): Promise<void> {
    const query = search.trim();
    if (!query) {
      setSemanticMatches(null);
      setSemanticError(null);
      return;
    }
    setSemanticSearching(true);
    setSemanticError(null);
    try {
      const results = await searchEvents(query);
      setSemanticMatches(results);
    } catch (issue) {
      setSemanticMatches(null);
      setSemanticError(issue instanceof Error ? issue.message : String(issue));
    } finally {
      setSemanticSearching(false);
    }
  }

  const semanticDetails = useMemo(() => {
    if (!semanticMatches) {
      return null;
    }
    return semanticMatches.map(match => ({
      match,
      event: eventsById.get(match.id) ?? null
    }));
  }, [semanticMatches, eventsById]);

  return (
    <DashboardShell
      title="Events"
      subtitle="Browse events across all galleries.">
      <div className="flex flex-col gap-4">
        <StatusMessages status={shellStatus} error={error} />

        <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm md:flex-row md:items-end md:justify-between">
          <div className="flex w-full flex-col gap-3 md:flex-row md:items-end">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</span>
              <Select value={statusFilter} onValueChange={value => setStatusFilter(value as StatusFilter)}>
                <SelectTrigger data-size="default" className="w-[200px]">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {EVENT_STATUSES.map(status => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Gallery</span>
              <Select value={galleryFilter} onValueChange={value => setGalleryFilter(value as GalleryFilter)}>
                <SelectTrigger data-size="default" className="w-[220px]">
                  <SelectValue placeholder="All galleries" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All galleries</SelectItem>
                  {galleries.map(gallery => (
                    <SelectItem key={gallery.id} value={gallery.id}>
                      {gallery.gallery_info?.name ?? gallery.normalized_main_url}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Search</span>
              <div className="flex gap-2">
                <Input
                  placeholder="Filter by title, gallery, or description…"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleSemanticSearch()}
                  disabled={semanticSearching}
                >
                  {semanticSearching ? "Searching…" : "Vector search"}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="button" variant={upcomingOnly ? "primary" : "outline"} onClick={() => setUpcomingOnly(value => !value)}>
              {upcomingOnly ? "Showing upcoming" : "Show upcoming"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void loadEvents()} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </div>

        {semanticError ? <p className="text-sm text-red-600">{semanticError}</p> : null}
        {semanticDetails && semanticDetails.length > 0 ? (
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-medium text-slate-700">Vector matches</h2>
            <ul className="space-y-2">
              {semanticDetails.map(item => (
                <li key={item.match.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900">{item.event?.title ?? "Unknown event"}</span>
                    <span className="text-xs text-slate-500">{item.match.similarity.toFixed(3)}</span>
                  </div>
                  {item.match.description ? (
                    <p className="mt-2 text-sm text-slate-600">{item.match.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <DataTable
          columns={columns}
          data={filteredEvents}
          emptyMessage={loading ? "Loading events…" : "No events found."}
        />
      </div>
    </DashboardShell>
  );
}
