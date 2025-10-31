import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
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

type StatusFilter = "all" | GalleryEvent["status"];

const statusOptions: StatusFilter[] = ["all", ...EVENT_STATUSES];

export function EventsEditorList({ events, pages, pendingAction, onSaveEvent, onProcessEventPages }: EventsEditorListProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const pagesById = useMemo(() => new Map(pages.map(page => [page.id, page])), [pages]);

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return events.filter(event => {
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
    });
  }, [events, statusFilter, search]);

  return (
    <section className="space-y-6">
      <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 md:items-end">
          <FilterField label="Search">
            <Input
              placeholder="Filter by title or description…"
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
        </div>
        <span className="text-sm text-slate-600">
          Showing <strong>{filteredEvents.length}</strong> of <strong>{events.length}</strong> events
        </span>
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
  const [form, setForm] = useState<EventFormState>(() => toFormState(event));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(toFormState(event));
  }, [event]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) {
      return;
    }
    setSaving(true);
    try {
      const updated = await onSave(toStructuredPayload(form));
      if (updated) {
        setForm(toFormState(updated));
      }
    } finally {
      setSaving(false);
    }
  }

  const processing = pendingAction === "extractAndEmbedEvents";
  const disableInputs = saving || pendingAction === "saveEvent";
  const canExtract = page?.status.scrape === "ok";

  return (
    <form className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={handleSubmit}>
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={form.title}
              onChange={event => setForm(current => ({ ...current, title: event.target.value }))}
              disabled={disableInputs}
              className="w-full md:w-[320px]"
            />
            <EventStatusBadge status={form.status} />
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-slate-600">
            <span>Created {formatDateTime(form.created_at)}</span>
            {event.page_id ? <span>Page linked</span> : <span>No source page</span>}
          </div>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <div className="flex flex-wrap gap-2">
            {page ? (
              <Button variant="outline" asChild>
                <a href={page.url ?? page.normalized_url} target="_blank" rel="noreferrer">
                  Source page
                </a>
              </Button>
            ) : null}
            {form.ticket_url ? (
              <Button variant="ghost" asChild>
                <a href={form.ticket_url} target="_blank" rel="noreferrer">
                  Ticket link
                </a>
              </Button>
            ) : null}
            {!event.event_info && page ? (
              <Button type="button" variant="primary" disabled={processing || !canExtract} onClick={() => onProcess(page.id)}>
                {processing ? "Processing…" : "Process event"}
              </Button>
            ) : null}
          </div>
          {!event.event_info && page && !canExtract ? (
            <span className="text-xs text-slate-500">Page must be scraped first</span>
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Status">
          <Select
            value={form.status}
            onValueChange={value => setForm(current => ({ ...current, status: value as GalleryEvent["status"] }))}
            disabled={disableInputs}
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
        <Field label="Ticket URL">
          <Input
            value={form.ticket_url}
            onChange={event => setForm(current => ({ ...current, ticket_url: event.target.value }))}
            disabled={disableInputs}
            placeholder="https://…"
          />
        </Field>
        <Field label="Start">
          <Input
            type="datetime-local"
            value={form.start_at}
            onChange={event => setForm(current => ({ ...current, start_at: event.target.value }))}
            disabled={disableInputs}
          />
        </Field>
        <Field label="End">
          <Input
            type="datetime-local"
            value={form.end_at}
            onChange={event => setForm(current => ({ ...current, end_at: event.target.value }))}
            disabled={disableInputs}
          />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Description" fullWidth>
          <Textarea
            rows={4}
            value={form.description}
            onChange={event => setForm(current => ({ ...current, description: event.target.value }))}
            disabled={disableInputs}
          />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Tags" description="Comma separated">
          <Input
            value={form.tags}
            onChange={event => setForm(current => ({ ...current, tags: event.target.value }))}
            disabled={disableInputs}
          />
        </Field>
        <Field label="Artists" description="Comma separated">
          <Input
            value={form.artists}
            onChange={event => setForm(current => ({ ...current, artists: event.target.value }))}
            disabled={disableInputs}
          />
        </Field>
      </div>

      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">Occurrences</span>
          <Button
            type="button"
            variant="secondary"
            disabled={disableInputs}
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
            Add occurrence
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
                  disabled={disableInputs}
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
                  disabled={disableInputs}
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
                  disabled={disableInputs}
                />
                <Button
                  type="button"
                  variant="ghost"
                  disabled={disableInputs}
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
        <Button type="submit" variant="primary" disabled={disableInputs}>
          {disableInputs ? "Saving…" : "Save event"}
        </Button>
      </div>
    </form>
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

function Field({ label, description, fullWidth = false, children }: { label: string; description?: string; fullWidth?: boolean; children: ReactNode }) {
  return (
    <label className={fullWidth ? "flex flex-col gap-2 md:col-span-2" : "flex flex-col gap-2"}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {description ? <span className="text-xs text-slate-500">{description}</span> : null}
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
    <Badge variant="secondary" className={`uppercase ${tone}`}>
      {status}
    </Badge>
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
  occurrences: Array<{
    id: string | null;
    start_at: string;
    end_at: string;
    timezone: string;
  }>;
  created_at: string;
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
    occurrences: (event.event_occurrences ?? []).map(item => ({
      id: item.id,
      start_at: toLocalInput(item.start_at),
      end_at: toLocalInput(item.end_at),
      timezone: item.timezone ?? ""
    })),
    created_at: event.created_at
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
      artists: parseList(form.artists)
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
      .filter((entry): entry is EventStructuredPayload["occurrences"][number] => entry !== null)
  };
}

function updateOccurrence(
  occurrences: EventFormState["occurrences"],
  index: number,
  patch: Partial<EventFormState["occurrences"][number]>
): EventFormState["occurrences"] {
  return occurrences.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
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

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}
