import type { ReactNode } from "react";
import type { PipelineData, PipelinePage } from "../../api";
import { Button, Card, CardBody, CardHeader, CardSubtitle, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@shared/ui";

function LinkRow({ href, label, description }: { href: string; label: string; description?: string | null }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex flex-col rounded-lg border border-transparent bg-slate-50 px-4 py-3 transition hover:border-slate-200 hover:bg-slate-100"
    >
      <span className="text-sm font-medium text-slate-800">{label}</span>
      {description ? <span className="text-xs text-slate-500 break-all">{description}</span> : null}
    </a>
  );
}

type GalleryOverviewCardProps = {
  gallery: PipelineData["gallery"];
  pages: PipelinePage[];
  refreshDisabled: boolean;
  extractDisabled: boolean;
  onRefresh: () => void;
  onExtractGallery: () => void;
  onPreviewMarkdown: (pageId: string, label: string) => void;
  onScrapePage: (pageId: string) => void;
  onEmbedGallery: () => void;
  embedPending: boolean;
  onViewEmbedding: () => void;
};

export function GalleryOverviewCard({
  gallery,
  pages,
  refreshDisabled,
  extractDisabled,
  onRefresh,
  onExtractGallery,
  onPreviewMarkdown,
  onScrapePage,
  onEmbedGallery,
  embedPending,
  onViewEmbedding
}: GalleryOverviewCardProps) {
  const mainPage = findPageByKind(pages, "gallery_main");
  const aboutPage = findPageByKind(pages, "gallery_about");
  const canExtract = Boolean(mainPage && mainPage.fetch_status === "ok" && (!aboutPage || aboutPage.fetch_status === "ok"));
  const embedding = gallery.gallery_info?.embedding ?? null;
  const embeddingModel = gallery.gallery_info?.embedding_model ?? null;
  const embeddingCreatedAt = gallery.gallery_info?.embedding_created_at ?? null;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Gallery overview</CardTitle>
          <CardSubtitle>Primary pages and extracted profile information.</CardSubtitle>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="muted" onClick={onRefresh} disabled={refreshDisabled}>
            {refreshDisabled ? "Refreshing..." : "Refresh"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onExtractGallery}
            disabled={extractDisabled || !canExtract}
          >
            {extractDisabled
              ? "Extracting..."
              : canExtract
                ? "Extract gallery info"
                : "Scrape primary pages first"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onEmbedGallery}
            disabled={embedPending || !canExtract}
          >
            {embedPending
              ? "Embedding..."
              : canExtract
                ? embedding
                  ? "Re-embed gallery"
                  : "Embed gallery"
                : "Scrape primary pages first"}
          </Button>
          {embedding ? (
            <Button type="button" variant="muted" onClick={onViewEmbedding}>
              View embedding
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardBody className="space-y-6">
        <div className="grid gap-3 md:grid-cols-2">
          <LinkRow href={gallery.main_url} label="Main page" description={gallery.normalized_main_url} />
          {gallery.about_url ? (
            <LinkRow href={gallery.about_url} label="About page" description={gallery.about_url} />
          ) : null}
        </div>

        <Table className="rounded-lg border border-slate-200">
          <TableHead>
            <TableRow className="bg-slate-50">
              <TableHeaderCell>Page</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Last fetch</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <GalleryRow
              label="Gallery main"
              page={mainPage}
              fallback="Pending discovery"
              onPreview={onPreviewMarkdown}
              onScrape={onScrapePage}
            />
            <GalleryRow
              label="Gallery about"
              page={aboutPage}
              fallback="Pending discovery"
              onPreview={onPreviewMarkdown}
              onScrape={onScrapePage}
            />
          </TableBody>
        </Table>

        <div className="grid gap-4 md:grid-cols-2">
          <InfoItem label="Name">{gallery.gallery_info?.name ?? "-"}</InfoItem>
          <InfoItem label="Address">{gallery.gallery_info?.address ?? "-"}</InfoItem>
          <InfoItem label="Email">
            {gallery.gallery_info?.email ? (
              <a className="text-blue-600" href={`mailto:${gallery.gallery_info.email}`}>
                {gallery.gallery_info.email}
              </a>
            ) : (
              "-"
            )}
          </InfoItem>
          <InfoItem label="Phone">{gallery.gallery_info?.phone ?? "-"}</InfoItem>
          <InfoItem label="Instagram">
            {gallery.gallery_info?.instagram ? formatInstagram(gallery.gallery_info.instagram) : "-"}
          </InfoItem>
          <InfoItem label="Tags">{formatTags(gallery.gallery_info?.tags)}</InfoItem>
          <InfoItem label="Embedding model">{embeddingModel ?? "-"}</InfoItem>
          <InfoItem label="Embedding updated">{embeddingCreatedAt ?? "-"}</InfoItem>
        </div>

        <div className="grid gap-4">
          <InfoItem label="About">{gallery.gallery_info?.about ?? "-"}</InfoItem>
          <InfoItem label="Hours">
            {gallery.gallery_hours.length === 0 ? "-" : formatHours(gallery.gallery_hours)}
          </InfoItem>
        </div>
      </CardBody>
    </Card>
  );
}

function GalleryRow({
  label,
  page,
  fallback,
  onPreview,
  onScrape
}: {
  label: string;
  page: PipelinePage | null;
  fallback: string;
  onPreview: (pageId: string, label: string) => void;
  onScrape: (pageId: string) => void;
}) {
  if (!page) {
    return (
      <TableRow>
        <TableCell className="font-medium text-slate-700">{label}</TableCell>
        <TableCell colSpan={3} className="text-slate-500">
          {fallback}
        </TableCell>
      </TableRow>
    );
  }

  const status = formatFetchStatus(page.fetch_status);

  return (
    <TableRow>
      <TableCell className="font-medium text-slate-700">{label}</TableCell>
      <TableCell className="text-slate-600">{status}</TableCell>
      <TableCell className="text-slate-600">{page.fetched_at ?? "-"}</TableCell>
      <TableCell>
        {page.fetch_status === "ok" ? (
          <Button type="button" variant="muted" onClick={() => onPreview(page.id, label)}>
            Preview markdown
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={() => onScrape(page.id)}>
            {page.fetch_status === "fetching" ? "Queued..." : "Scrape now"}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function InfoItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="mt-1 block break-words text-sm text-slate-700">{children}</span>
    </div>
  );
}

function findPageByKind(pages: PipelinePage[], kind: PipelinePage["kind"]): PipelinePage | null {
  return pages.find(page => page.kind === kind) ?? null;
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

function formatTags(tags: string[] | null | undefined): string {
  if (!tags || tags.length === 0) return "-";
  return tags.join(", ");
}

function formatHours(hours: PipelineData["gallery"]["gallery_hours"]): string {
  return hours
    .slice()
    .sort((a, b) => a.dow - b.dow)
    .map(hour => `${dayName(hour.dow)} ${hour.open_time} - ${hour.close_time}`)
    .join(" • ");
}

function dayName(index: number): string {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return names[index] ?? `Day ${index}`;
}

function formatInstagram(handle: string): string {
  const normalized = handle.startsWith("@") ? handle.slice(1) : handle;
  return `@${normalized}`;
}
