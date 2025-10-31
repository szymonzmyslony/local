import type { ReactNode } from "react";
import { Button } from "@shared/ui";
import type { GalleryDetail, GalleryPage } from "../../api";

type PrimaryPage = {
  id: string;
  label: string;
  page: GalleryPage | null;
};

type GalleryOverviewCardProps = {
  gallery: GalleryDetail;
  mainPage: GalleryPage | null;
  aboutPage: GalleryPage | null;
  eventsPage?: GalleryPage | null;
  embedDisabled: boolean;
  scrapeDisabled: boolean;
  lastEmbeddedAt: string | null;
  onEmbedGallery: () => void;
  onPreviewMarkdown: (pageId: string, label: string) => void;
  onScrapePage: (pageId: string) => void;
};

export function GalleryOverviewCard({
  gallery,
  mainPage,
  aboutPage,
  eventsPage,
  embedDisabled,
  scrapeDisabled,
  lastEmbeddedAt,
  onEmbedGallery,
  onPreviewMarkdown,
  onScrapePage
}: GalleryOverviewCardProps) {
  const primaryPages: PrimaryPage[] = [
    { id: "gallery_main", label: "Main page", page: mainPage },
    { id: "gallery_about", label: "About page", page: aboutPage }
  ];

  if (eventsPage || gallery.events_page) {
    primaryPages.push({ id: "event_list", label: "Events page", page: eventsPage ?? null });
  }

  const info = gallery.gallery_info;

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="text-lg font-semibold text-slate-900">Gallery overview</p>
          <p className="text-sm text-slate-600">Primary pages and the latest embedded details.</p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3">
          <Button type="button" variant="primary" disabled={embedDisabled} onClick={onEmbedGallery}>
            {embedDisabled ? "Embedding…" : "Re-embed gallery"}
          </Button>
          {lastEmbeddedAt ? (
            <span className="text-xs text-slate-500">Last embedded {formatTimestamp(lastEmbeddedAt)}</span>
          ) : null}
        </div>
      </header>

      <div className="space-y-8 rounded-2xl bg-white p-6 shadow-sm">
        <section className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Primary pages</p>
          <div className="grid gap-3 md:grid-cols-2">
            {primaryPages.map(item => renderPrimaryItem(item, { onPreviewMarkdown, onScrapePage, scrapeDisabled }))}
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Details</p>
          <div className="grid gap-4 md:grid-cols-2">
            <InfoTile label="Name">{info?.name ?? "—"}</InfoTile>
            <InfoTile label="Address">{info?.address ?? "—"}</InfoTile>
            <InfoTile label="Email">
              {info?.email ? (
                <a className="text-blue-600 hover:underline" href={`mailto:${info.email}`}>
                  {info.email}
                </a>
              ) : (
                "—"
              )}
            </InfoTile>
            <InfoTile label="Phone">{info?.phone ?? "—"}</InfoTile>
            <InfoTile label="Instagram">{info?.instagram ?? "—"}</InfoTile>
            <InfoTile label="Tags">{info?.tags?.length ? info.tags.join(", ") : "—"}</InfoTile>
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">About</p>
          <InfoTile>{info?.about ?? "—"}</InfoTile>
          <InfoTile label="Hours">{gallery.gallery_hours.length ? formatHours(gallery) : "—"}</InfoTile>
        </section>
      </div>
    </section>
  );
}

function renderPrimaryItem(
  item: PrimaryPage,
  handlers: {
    onPreviewMarkdown: (pageId: string, label: string) => void;
    onScrapePage: (pageId: string) => void;
    scrapeDisabled: boolean;
  }
) {
  const { onPreviewMarkdown, onScrapePage, scrapeDisabled } = handlers;
  const { page, label } = item;

  if (!page) {
    return (
      <div key={item.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-xs text-slate-500">Pending discovery</p>
      </div>
    );
  }

  const statusLabel = statusFor(page.fetch_status);

  return (
    <div key={item.id} className="space-y-2 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <a
          href={page.url ?? page.normalized_url}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-semibold text-blue-600 hover:underline"
        >
          {label}
        </a>
        <span className="text-xs text-slate-500 break-all">{page.normalized_url}</span>
      </div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{statusLabel}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="muted"
          disabled={page.fetch_status !== "ok"}
          onClick={() => onPreviewMarkdown(page.id, label)}
        >
          Preview
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={scrapeDisabled || page.fetch_status === "fetching"}
          onClick={() => onScrapePage(page.id)}
        >
          {page.fetch_status === "fetching" ? "Queued…" : "Scrape"}
        </Button>
      </div>
    </div>
  );
}

function InfoTile({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
      {label ? <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span> : null}
      <span className={label ? "mt-2 block" : "block"}>{children}</span>
    </div>
  );
}

function statusFor(status: GalleryPage["fetch_status"]): string {
  if (status === "ok") return "Scraped";
  if (status === "fetching" || status === "queued") return "Queued";
  if (status === "error") return "Error";
  return "Never";
}

function formatHours(gallery: GalleryDetail): string {
  return gallery.gallery_hours
    .slice()
    .sort((a, b) => dayIndex(a) - dayIndex(b))
    .map(hour => {
      const start = timeValue(hour, "open");
      const end = timeValue(hour, "close");
      const day = dayName(dayIndex(hour));
      if (start && end) {
        return `${day} ${start} - ${end}`;
      }
      if (start || end) {
        return `${day} ${start ?? end}`;
      }
      return `${day} —`;
    })
    .join(" • ");
}

function dayIndex(hour: GalleryDetail["gallery_hours"][number]): number {
  if ("weekday" in hour && typeof hour.weekday === "number") {
    return hour.weekday;
  }
  if ("dow" in hour && typeof hour.dow === "number") {
    return hour.dow;
  }
  return 0;
}

function timeValue(hour: GalleryDetail["gallery_hours"][number], key: "open" | "close"): string | null {
  if (key === "open") {
    if ("open_time" in hour && typeof hour.open_time === "string") {
      return hour.open_time;
    }
    if ("open_minutes" in hour && typeof hour.open_minutes === "number") {
      return minutesToTime(hour.open_minutes);
    }
  } else {
    if ("close_time" in hour && typeof hour.close_time === "string") {
      return hour.close_time;
    }
    if ("close_minutes" in hour && typeof hour.close_minutes === "number") {
      return minutesToTime(hour.close_minutes);
    }
  }
  return null;
}

function minutesToTime(total: number): string {
  const hours = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (total % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function dayName(index: number): string {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return names[index] ?? `Day ${index}`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}
