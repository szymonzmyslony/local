import type { ReactNode } from "react";
import type { PipelineData, PipelinePage } from "../../api";
import { LinkRowComponent } from "../../components/common/LinkRowComponent";
import { Button } from "../../components/ui/button";

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
    <section className="card">
      <header className="card-header">
        <div>
          <h2 className="card-title">Gallery overview</h2>
          <p className="card-subtitle">Primary pages and extracted profile information.</p>
        </div>
        <div className="actions">
          <Button type="button" variant="muted" onClick={onRefresh} disabled={refreshDisabled}>
            {refreshDisabled ? "Refreshing…" : "Refresh"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onExtractGallery}
            disabled={extractDisabled || !canExtract}
          >
            {extractDisabled
              ? "Extracting…"
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
              ? "Embedding…"
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
      </header>

      <div className="link-grid">
        <LinkRowComponent
          href={gallery.main_url}
          label="Main page"
          description={gallery.normalized_main_url}
        />
        {gallery.about_url ? (
          <LinkRowComponent href={gallery.about_url} label="About page" description={gallery.about_url} />
        ) : null}
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Page</th>
            <th>Status</th>
            <th>Last fetch</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
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
        </tbody>
      </table>

      <div className="info-grid">
        <InfoItem label="Name">{gallery.gallery_info?.name ?? "—"}</InfoItem>
        <InfoItem label="Address">{gallery.gallery_info?.address ?? "—"}</InfoItem>
        <InfoItem label="Email">
          {gallery.gallery_info?.email ? (
            <a href={`mailto:${gallery.gallery_info.email}`}>{gallery.gallery_info.email}</a>
          ) : (
            "—"
          )}
        </InfoItem>
        <InfoItem label="Phone">{gallery.gallery_info?.phone ?? "—"}</InfoItem>
        <InfoItem label="Instagram">
          {gallery.gallery_info?.instagram ? formatInstagram(gallery.gallery_info.instagram) : "—"}
        </InfoItem>
        <InfoItem label="Tags">{formatTags(gallery.gallery_info?.tags)}</InfoItem>
        <InfoItem label="Embedding model">{embeddingModel ?? "—"}</InfoItem>
        <InfoItem label="Embedding updated">{embeddingCreatedAt ?? "—"}</InfoItem>
      </div>

      <div className="info-grid info-grid--full">
        <InfoItem label="About">{gallery.gallery_info?.about ?? "—"}</InfoItem>
        <InfoItem label="Hours">
          {gallery.gallery_hours.length === 0 ? "—" : formatHours(gallery.gallery_hours)}
        </InfoItem>
      </div>
    </section>
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
      <tr>
        <td>{label}</td>
        <td colSpan={3} style={{ color: "#6b7280" }}>
          {fallback}
        </td>
      </tr>
    );
  }

  const status = formatFetchStatus(page.fetch_status);

  return (
    <tr>
      <td>{label}</td>
      <td>{status}</td>
      <td>{page.fetched_at ?? "—"}</td>
      <td>
        {page.fetch_status === "ok" ? (
          <Button type="button" variant="muted" onClick={() => onPreview(page.id, label)}>
            Preview markdown
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={() => onScrape(page.id)}>
            {page.fetch_status === "fetching" ? "Queued…" : "Scrape now"}
          </Button>
        )}
      </td>
    </tr>
  );
}

function InfoItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="info-item">
      <span className="info-item__label">{label}</span>
      <span className="info-item__value">{children}</span>
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
  if (!tags || tags.length === 0) return "—";
  return tags.join(", ");
}

function formatHours(hours: PipelineData["gallery"]["gallery_hours"]): string {
  return hours
    .slice()
    .sort((a, b) => a.dow - b.dow)
    .map(hour => `${dayName(hour.dow)} ${hour.open_time} – ${hour.close_time}`)
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
