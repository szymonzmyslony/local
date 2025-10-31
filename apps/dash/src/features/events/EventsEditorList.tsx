import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea
} from "@shared/ui";
import { EVENT_STATUSES } from "../../api";
import type {
  DashboardAction,
  EventStructuredPayload,
  GalleryEvent,
  GalleryPage
} from "../../api";

type EventsEditorListProps = {
  events: GalleryEvent[];
  pages: GalleryPage[];
  pendingAction: DashboardAction | null;
  onSaveEvent: (eventId: string, payload: EventStructuredPayload) => Promise<GalleryEvent | null>;
  onProcessEventPages: (pageIds: string[]) => void;
};

type EventSort = "nearest" | "latest" | "title";
type StatusFilter = "all" | GalleryEvent["status"];

const statusOptions: StatusFilter[] = ["all", ...EVENT_STATUSES];
const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function EventsEditorList({
  events,
  pages,
  pendingAction,
  onSaveEvent,
  onProcessEventPages
}: EventsEditorListProps) {
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
        const haystack = [event.title, event.ticket_url ?? "", event.event_info?.description ?? ""]
          .join(" ")
          .toLowerCase();
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
              placeholder="Filter by title, ticket link, or description…"
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
              <EventEditorCard
                key={event.id}
                event={event}
                page={page}
                pendingAction={pendingAction}
                onSave={payload => onSaveEvent(event.id, payload)}
                onProcess={pageId => onProcessEventPages([pageId])}
              />
            );
          })
        )}
      </div>
    </section>
  );
}

type EventEditorCardProps = {
  event: GalleryEvent;
  page: GalleryPage | null;
  pendingAction: DashboardAction | null;
  onSave: (payload: EventStructuredPayload) => Promise<GalleryEvent | null>;
  onProcess: (pageId: string) => void;
};

function EventEditorCard({ event, page, pendingAction, onSave, onProcess }: EventEditorCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState(() => toFormState(event));
  const [saving, setSaving] = useState(false);

  const processing = pendingAction === "scrapeAndExtract";
  const savingDisabled = saving || pendingAction === "saveEvent";
  const hasStructured = Boolean(event.event_info);
  const occurrences = sortOccurrences(event.event_occurrences ?? []);
  const nextOccurrence = occurrences[0] ?? null;

  async function handleSave() {
    if (savingDisabled) {
      return;
    }
    setSaving(true);
    try {
      const payload = toStructuredPayload(form);
      const updated = await onSave(payload);
      if (updated) {
        setForm(toFormState(updated));
        setExpanded(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
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
          <Button type="button" variant="outline" onClick={() => setExpanded(current => !current)}>
            {expanded ? "Close editor" : "Edit structured data"}
          </Button>
          {page ? (
            <Button variant="ghost" asChild>
              <a href={page.url ?? page.normalized_url} target="_blank" rel="noreferrer">
                Source page
              </a>
            </Button>
          ) : null}
          {event.ticket_url ? (
            <Button variant="ghost" asChild>
              <a href={event.ticket_url} target="_blank" rel="noreferrer">
                Ticket link
              </a>
            </Button>
          ) : null}
          {!hasStructured && page ? (
            <Button type="button" variant="primary" disabled={processing} onClick={() => onProcess(page.id)}>
              {processing ? "Processing…" : "Process event"}
            </Button>
          ) : null}
        </div>
      </header>

      <dl className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
        <DetailRow label="Next occurrence">
          {nextOccurrence ? formatOccurrence(nextOccurrence) : "Not scheduled"}
        </DetailRow>
        <DetailRow label="Occurrences">
          {occurrences.length ? (
            <div className="space-y-1">
              <span>{occurrences.length} scheduled</span>
              <ul className="list-disc pl-4 text-xs text-slate-500">
                {occurrences.slice(0, 3).map(item => (
                  <li key={item.id}>{formatOccurrence(item)}</li>
                ))}
                {occurrences.length > 3 ? <li>…and {occurrences.length - 3} more</li> : null}
              </ul>
            </div>
          ) : (
            "No occurrences recorded"
          )}
        </DetailRow>
        <DetailRow label="Status updated">{formatDate(event.updated_at)}</DetailRow>
        <DetailRow label="Created">{formatDate(event.created_at)}</DetailRow>
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

      {expanded ? (
        <div className="space-y-6 border-t border-slate-200 pt-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Title">
              <Input
                value={form.title}
                onChange={event => setForm(current => ({ ...current, title: event.target.value }))}
                disabled={savingDisabled}
              />
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onValueChange={value => setForm(current => ({ ...current, status: value as GalleryEvent["status"] }))}
                disabled={savingDisabled}
              >
                <SelectTrigger data-size="default">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_STATUSES.map(option => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Start">
              <Input
                type="datetime-local"
                value={form.start_at}
                onChange={event => setForm(current => ({ ...current, start_at: event.target.value }))}
                disabled={savingDisabled}
              />
            </Field>
            <Field label="End">
              <Input
                type="datetime-local"
                value={form.end_at}
                onChange={event => setForm(current => ({ ...current, end_at: event.target.value }))}
                disabled={savingDisabled}
              />
            </Field>
            <Field label="Ticket URL" fullWidth>
              <Input
                value={form.ticket_url}
                onChange={event => setForm(current => ({ ...current, ticket_url: event.target.value }))}
                disabled={savingDisabled}
                placeholder="https://…"
              />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Description" fullWidth>
              <Textarea
                rows={4}
                value={form.description}
                onChange={event => setForm(current => ({ ...current, description: event.target.value }))}
                disabled={savingDisabled}
              />
            </Field>
            <Field label="Markdown" fullWidth description="Optional rich markdown captured from scraping.">
              <Textarea
                rows={8}
                value={form.md}
                onChange={event => setForm(current => ({ ...current, md: event.target.value }))}
                disabled={savingDisabled}
              />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Tags" description="Comma separated.">
              <Input
                value={form.tags}
                onChange={event => setForm(current => ({ ...current, tags: event.target.value }))}
                disabled={savingDisabled}
              />
            </Field>
            <Field label="Artists" description="Comma separated.">
              <Input
                value={form.artists}
                onChange={event => setForm(current => ({ ...current, artists: event.target.value }))}
                disabled={savingDisabled}
              />
            </Field>
          </div>

          <section className="space-y-4">
            <header className="flex items-center justify-between">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Occurrences</p>
              <Button
                type="button"
                variant="secondary"
                disabled={savingDisabled}
                onClick={() =>
                  setForm(current => ({
                    ...current,
                    occurrences: [
                      ...current.occurrences,
                      {
                        id: generateId(),
                        start_at: "",
                        end_at: "",
                        timezone: ""
                      }
                    ]
                  }))
                }
              >
                Add
              </Button>
            </header>
            {form.occurrences.length === 0 ? (
              <p className="text-xs text-slate-500">No occurrences recorded.</p>
            ) : (
              <div className="space-y-3">
                {form.occurrences.map((occurrence, index) => (
                  <div key={occurrence.id ?? `occ-${index}`} className="grid gap-3 md:grid-cols-[220px_220px_140px_auto] md:items-center">
                    <Input
                      type="datetime-local"
                      value={occurrence.start_at}
                      onChange={event =>
                        setForm(current => ({
                          ...current,
                          occurrences: updateOccurrence(current.occurrences, index, { start_at: event.target.value })
                        }))
                      }
                      disabled={savingDisabled}
                    />
                    <Input
                      type="datetime-local"
                      value={occurrence.end_at}
                      onChange={event =>
                        setForm(current => ({
                          ...current,
                          occurrences: updateOccurrence(current.occurrences, index, { end_at: event.target.value })
                        }))
                      }
                      disabled={savingDisabled}
                    />
                    <Input
                      value={occurrence.timezone}
                      onChange={event =>
                        setForm(current => ({
                          ...current,
                          occurrences: updateOccurrence(current.occurrences, index, { timezone: event.target.value })
                        }))
                      }
                      placeholder="Timezone"
                      disabled={savingDisabled}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={savingDisabled}
                      onClick={() =>
                        setForm(current => ({
                          ...current,
                          occurrences: current.occurrences.filter((_, itemIndex) => itemIndex !== index)
                        }))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="flex justify-end">
            <Button type="button" variant="primary" disabled={savingDisabled} onClick={() => void handleSave()}>
              {savingDisabled ? "Saving…" : "Save event"}
            </Button>
          </div>
        </div>
      ) : null}
    </article>
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
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase ${tone}`}>
      {status}
    </span>
  );
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

function sortOccurrences(occurrences: GalleryEvent["event_occurrences"]): GalleryEvent["event_occurrences"] {
  return [...occurrences].sort((left, right) => new Date(left.start_at).getTime() - new Date(right.start_at).getTime());
}

function formatOccurrence(occurrence: GalleryEvent["event_occurrences"][number]): string {
  const start = formatDateTime(occurrence.start_at);
  const end = occurrence.end_at ? formatDateTime(occurrence.end_at) : null;
  const zone = occurrence.timezone ? ` (${occurrence.timezone})` : "";
  if (end) {
    return `${start} → ${end}${zone}`;
  }
  return `${start}${zone}`;
}

function formatEventDateRange(event: GalleryEvent): string {
  const start = event.start_at ?? event.created_at;
  const end = event.end_at;
  const formattedStart = formatDateTime(start);
  if (!end) {
    return formattedStart;
  }
  const formattedEnd = formatDateTime(end);
  return `${formattedStart} → ${formattedEnd}`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const weekday = dayNames[date.getDay()];
  return `${weekday} ${date.toLocaleString()}`;
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

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
      No events match the current filters.
    </div>
  );
}

type EventFormState = {
  title: string;
  status: GalleryEvent["status"];
  start_at: string;
  end_at: string;
  ticket_url: string;
  description: string;
  tags: string;
  artists: string;
  md: string;
  occurrences: Array<{
    id: string | null;
    start_at: string;
    end_at: string;
    timezone: string;
  }>;
};

function toFormState(event: GalleryEvent): EventFormState {
  return {
    title: event.title,
    status: event.status,
    start_at: toLocalInput(event.start_at),
    end_at: toLocalInput(event.end_at),
    ticket_url: event.ticket_url ?? "",
    description: event.event_info?.description ?? "",
    tags: (event.event_info?.tags ?? []).join(", "),
    artists: (event.event_info?.artists ?? []).join(", "),
    md: event.event_info?.md ?? "",
    occurrences: (event.event_occurrences ?? []).map(item => ({
      id: item.id,
      start_at: toLocalInput(item.start_at),
      end_at: toLocalInput(item.end_at),
      timezone: item.timezone ?? ""
    }))
  };
}

function toStructuredPayload(form: EventFormState): EventStructuredPayload {
  return {
    event: {
      title: form.title.trim(),
      status: form.status,
      start_at: fromLocalInput(form.start_at),
      end_at: fromLocalInput(form.end_at),
      ticket_url: normalizeField(form.ticket_url)
    },
    info: {
      description: normalizeField(form.description),
      tags: parseList(form.tags),
      artists: parseList(form.artists),
      md: normalizeField(form.md)
    },
    occurrences: form.occurrences
      .map(item => {
        const start_at = fromLocalInput(item.start_at);
        if (!start_at) {
          return null;
        }
        return {
          id: item.id ?? undefined,
          start_at,
          end_at: fromLocalInput(item.end_at),
          timezone: normalizeField(item.timezone)
        };
      })
      .filter(Boolean) as EventStructuredPayload["occurrences"]
  };
}

function updateOccurrence(
  occurrences: EventFormState["occurrences"],
  index: number,
  patch: Partial<EventFormState["occurrences"][number]>
): EventFormState["occurrences"] {
  return occurrences.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeField(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function parseList(value: string): string[] | null {
  const items = value
    .split(",")
    .map(entry => entry.trim())
    .filter(Boolean);
  return items.length ? items : null;
}

function toLocalInput(value: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function fromLocalInput(value: string): string | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function Field({
  label,
  description,
  fullWidth = false,
  children
}: {
  label: string;
  description?: string;
  fullWidth?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={fullWidth ? "flex flex-col gap-2 md:col-span-2" : "flex flex-col gap-2"}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {description ? <span className="text-xs text-slate-500">{description}</span> : null}
    </label>
  );
}
