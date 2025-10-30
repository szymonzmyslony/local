import type { ReactNode } from "react";
import type { PipelineData, PipelinePage } from "../../api";
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from "@shared/ui";

type PrimaryPage = {
  id: string;
  label: string;
  page: PipelinePage | null;
};

type GalleryOverviewCardProps = {
  gallery: PipelineData["gallery"];
  mainPage: PipelinePage | null;
  aboutPage: PipelinePage | null;
  refreshDisabled: boolean;
  extractDisabled: boolean;
  scrapeDisabled: boolean;
  embeddingDisabled: boolean;
  canExtract: boolean;
  canEmbed: boolean;
  onRefresh: () => void;
  onExtractGallery: () => void;
  onPreviewMarkdown: (pageId: string, label: string) => void;
  onScrapePage: (pageId: string) => void;
  onRunEmbedding: () => void;
};

export function GalleryOverviewCard({
  gallery,
  mainPage,
  aboutPage,
  refreshDisabled,
  extractDisabled,
  scrapeDisabled,
  embeddingDisabled,
  canExtract,
  canEmbed,
  onRefresh,
  onExtractGallery,
  onPreviewMarkdown,
  onScrapePage,
  onRunEmbedding
}: GalleryOverviewCardProps) {
  const primaryPages: PrimaryPage[] = [
    { id: "gallery_main", label: "Main page", page: mainPage },
    { id: "gallery_about", label: "About page", page: aboutPage }
  ];

  const info = gallery.gallery_info;
  const embedding = info?.embedding ?? null;

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-lg font-semibold text-slate-900">Gallery overview</p>
          <p className="text-sm text-slate-600">
            Primary pages and the latest extracted information.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="muted"
            onClick={() => {
              console.log("[GalleryOverviewCard] refresh clicked", { galleryId: gallery.id });
              onRefresh();
            }}
            disabled={refreshDisabled}
          >
            {refreshDisabled ? "Refreshing…" : "Refresh"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              console.log("[GalleryOverviewCard] extract gallery clicked", { galleryId: gallery.id });
              onExtractGallery();
            }}
            disabled={extractDisabled || !canExtract}
          >
            {extractDisabled ? "Extracting…" : canExtract ? "Extract gallery info" : "Scrape pages first"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              console.log("[GalleryOverviewCard] embedding clicked", { galleryId: gallery.id });
              onRunEmbedding();
            }}
            disabled={embeddingDisabled || !canEmbed}
          >
            {embeddingDisabled ? "Working…" : embedding ? "Re-run embedding" : "Create embedding"}
          </Button>
        </div>
      </div>

      <div className="space-y-8 rounded-2xl bg-white p-6 shadow-sm">
        <section className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Primary pages
          </p>
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
            <InfoTile label="Tags">
              {info?.tags && info.tags.length > 0 ? info.tags.join(", ") : "—"}
            </InfoTile>
          </div>
        </section>

        <section className="space-y-3">
          <Collapsible>
            <div className="flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Embedding details</p>
                <p className="text-xs text-slate-500">
                  {embedding ? "Last embedding stored for this gallery." : "No embedding stored yet."}
                </p>
              </div>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="muted" size="sm">
                  Toggle details
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="mt-3 space-y-3 rounded-md border border-slate-200 bg-white p-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <InfoTile label="Model">{info?.embedding_model ?? "—"}</InfoTile>
                <InfoTile label="Updated">{info?.embedding_created_at ?? "—"}</InfoTile>
              </div>
              <pre className="max-h-[40vh] overflow-y-auto rounded-md bg-slate-900/90 p-4 text-xs text-slate-100">
                {embedding ?? "No embedding stored."}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        </section>

        <section className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">About</p>
          <InfoTile>
            {info?.about ?? "—"}
          </InfoTile>
          <InfoTile label="Hours">
            {gallery.gallery_hours.length > 0 ? formatHours(gallery) : "—"}
          </InfoTile>
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

  const isFetched = page.fetch_status === "ok";
  const status =
    page.fetch_status === "ok"
      ? "Scraped"
      : page.fetch_status === "fetching"
        ? "Queued"
        : page.fetch_status === "queued"
          ? "Queued"
          : page.fetch_status === "error"
            ? "Error"
            : "Never";

  return (
    <div key={item.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm space-y-2">
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
      <p className="text-xs uppercase tracking-wide text-slate-500">{status}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="muted"
          size="sm"
          onClick={() => {
            console.log("[GalleryOverviewCard] preview markdown", { pageId: page.id, label });
            onPreviewMarkdown(page.id, label);
          }}
          disabled={!isFetched}
        >
          Preview
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            console.log("[GalleryOverviewCard] scrape page", { pageId: page.id, label });
            onScrapePage(page.id);
          }}
          disabled={scrapeDisabled || page.fetch_status === "fetching"}
        >
          {page.fetch_status === "fetching" ? "Queued…" : "Scrape"}
        </Button>
      </div>
    </div>
  );
}

function InfoTile({
  label,
  children
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
      {label ? (
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>
      ) : null}
      <span className={label ? "mt-2 block" : "block"}>{children}</span>
    </div>
  );
}

function formatHours(gallery: PipelineData["gallery"]): string {
  return gallery.gallery_hours
    .slice()
    .sort((a, b) => a.dow - b.dow)
    .map(hour => `${dayName(hour.dow)} ${hour.open_time} - ${hour.close_time}`)
    .join(" • ");
}

function dayName(index: number): string {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return names[index] ?? `Day ${index}`;
}
