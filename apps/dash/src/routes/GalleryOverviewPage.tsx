import { useEffect, useState } from "react";
import { Badge, Button, Card, CardBody, CardSubtitle, CardTitle } from "@shared/ui";
import { useGalleryRoute } from "./GalleryDetailLayout";
import { fetchGalleryPages, getPageContent, type GalleryPage, type GalleryInfoPayload } from "../api";
import { GalleryInfoForm } from "../features/gallery/GalleryInfoForm";
import { GalleryHoursEditor } from "../features/gallery/GalleryHoursEditor";
import type { GalleryDetail } from "../api";
import type { OpeningHoursItem } from "@shared";

export function GalleryOverviewPage() {
  const {
    gallery,
    galleryId,
    loadingGallery,
    pendingAction,
    dataVersion,
    runEmbedGallery,
    runScrapePages,
    saveGalleryInfo,
    saveGalleryHours,
    showPreviewDialog,
    setError
  } = useGalleryRoute();

  const [pages, setPages] = useState<GalleryPage[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);

  useEffect(() => {
    if (!galleryId) {
      setPages([]);
      return;
    }
    let cancelled = false;
    setLoadingPages(true);
    fetchGalleryPages(galleryId)
      .then(data => {
        if (cancelled) return;
        setPages(data);
      })
      .catch(issue => {
        if (cancelled) return;
        const message = issue instanceof Error ? issue.message : String(issue);
        setError(message);
        setPages([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingPages(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [galleryId, dataVersion, setError]);

  if (loadingGallery || loadingPages) {
    return (
      <Card>
        <CardBody>
          <CardTitle>Loading</CardTitle>
          <CardSubtitle>Please wait while we load this gallery.</CardSubtitle>
        </CardBody>
      </Card>
    );
  }

  if (!galleryId || !gallery) {
    return (
      <Card>
        <CardBody>
          <CardTitle>No data yet</CardTitle>
          <CardSubtitle>Select a gallery from the list to view its overview.</CardSubtitle>
        </CardBody>
      </Card>
    );
  }

  const mainPage = pages.find(page => page.kind === "gallery_main") ?? null;
  const aboutPage = pages.find(page => page.kind === "gallery_about") ?? null;
  const eventsPage = pages.find(page => page.kind === "event_list") ?? null;

  const infoValue: GalleryInfoPayload = {
    name: gallery.gallery_info?.name ?? null,
    about: gallery.gallery_info?.about ?? null,
    address: gallery.gallery_info?.address ?? null,
    email: gallery.gallery_info?.email ?? null,
    phone: gallery.gallery_info?.phone ?? null,
    instagram: gallery.gallery_info?.instagram ?? null,
    tags: gallery.gallery_info?.tags ?? null
  };

  const hoursValue = normaliseHours(gallery);

  const lastEmbeddedAt = gallery.gallery_info?.embedding_created_at ?? null;

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="text-lg font-semibold text-slate-900">Gallery overview</p>
          <p className="text-sm text-slate-600">Manage primary pages, contact details, and public hours.</p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3">
          <Button type="button" variant="primary" disabled={pendingAction === "embedGallery"} onClick={() => void runEmbedGallery()}>
            {pendingAction === "embedGallery" ? "Embedding…" : "Re-embed gallery"}
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
            {[
              { id: "gallery_main", label: "Main page", page: mainPage },
              { id: "gallery_about", label: "About page", page: aboutPage },
              ...(eventsPage || gallery.events_page
                ? [{ id: "event_list", label: "Events page", page: eventsPage ?? null }]
                : [])
            ].map(item => (
              <PrimaryPageItem
                key={item.id}
                label={item.label}
                page={item.page}
                disabled={pendingAction === "scrape"}
                onPreview={async () => {
                  if (!item.page) return;
                  try {
                    const content = await getPageContent(item.page.id);
                    showPreviewDialog({
                      title: item.label,
                      description: "Markdown captured from the latest scrape.",
                      items: [
                        {
                          title: item.label,
                          content: content.page_content?.markdown ?? null
                        }
                      ]
                    });
                  } catch (issue) {
                    console.error("[GalleryOverviewPage] preview fetch failed", issue);
                  }
                }}
                onScrape={() => {
                  if (!item.page) return;
                  void runScrapePages([item.page.id]);
                }}
              />
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <header>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Details</p>
          </header>
          <GalleryInfoForm
            value={infoValue}
            disabled={pendingAction === "saveGalleryInfo"}
            onSubmit={async payload => {
              await saveGalleryInfo(payload);
            }}
          />
        </section>

        <section className="space-y-4">
          <header className="flex items-center justify-between">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Hours</p>
            {hoursValue.length === 0 ? <Badge variant="outline">All days closed</Badge> : null}
          </header>
          <GalleryHoursEditor
            value={hoursValue}
            disabled={pendingAction === "saveGalleryHours"}
            onSubmit={async payload => {
              await saveGalleryHours({ hours: payload });
            }}
          />
        </section>
      </div>
    </section>
  );
}

function PrimaryPageItem({
  label,
  page,
  disabled,
  onPreview,
  onScrape
}: {
  label: string;
  page: GalleryPage | null;
  disabled: boolean;
  onPreview: () => void;
  onScrape: () => void;
}) {
  if (!page) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-xs text-slate-500">Pending discovery</p>
      </div>
    );
  }

  const statusLabel = statusFor(page.status.scrape);

  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <a href={page.url ?? page.normalized_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-600 hover:underline">
          {label}
        </a>
        <span className="break-all text-xs text-slate-500">{page.normalized_url}</span>
      </div>
      <span className="text-xs uppercase tracking-wide text-slate-500">{statusLabel}</span>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="muted" disabled={page.fetch_status !== "ok"} onClick={onPreview}>
          Preview
        </Button>
        <Button type="button" variant="secondary" disabled={disabled || page.fetch_status === "fetching"} onClick={onScrape}>
          {page.fetch_status === "fetching" ? "Queued…" : "Scrape"}
        </Button>
      </div>
    </div>
  );
}

function statusFor(status: GalleryPage["fetch_status"]): string {
  if (status === "ok") return "Scraped";
  if (status === "fetching" || status === "queued") return "Queued";
  if (status === "error") return "Error";
  return "Never";
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

type TimeRange = { open: number; close: number };

function normaliseHours(gallery: GalleryDetail): OpeningHoursItem[] {
  const hours = Array.isArray(gallery.gallery_hours) ? gallery.gallery_hours : [];
  return hours
    .map(item => ({
      weekday: typeof item.weekday === "number" ? item.weekday : null,
      open_minutes: parseOpenMinutes(item.open_minutes)
    }))
    .filter((entry): entry is OpeningHoursItem => entry.weekday !== null && entry.open_minutes.length > 0)
    .sort((left, right) => left.weekday - right.weekday);
}

function parseOpenMinutes(value: unknown): TimeRange[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(item => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const open = (item as { open?: unknown }).open;
      const close = (item as { close?: unknown }).close;
      if (typeof open === "number" && typeof close === "number") {
        return { open, close };
      }
      return null;
    })
    .filter((entry): entry is TimeRange => entry !== null);
}
