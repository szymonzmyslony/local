import { useEffect, useState } from "react";
import { Card, CardBody, CardSubtitle, CardTitle } from "@shared/ui";
import { DiscoverLinksCard } from "../features/pages/DiscoverLinksCard";
import { PageLinksView } from "../features/pages/PageLinksView";
import { useGalleryRoute } from "./GalleryDetailLayout";
import { fetchGalleryPages, getPageContent, type GalleryPage } from "../api";

export function GalleryPagesPage() {
  const {
    galleryId,
    gallery,
    loadingGallery,
    pendingAction,
    dataVersion,
    runDiscover,
    runScrapePages,
    runPromoteEventPages,
    updatePageKinds,
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
          <CardTitle>Loading pages</CardTitle>
          <CardSubtitle>Fetching the latest pages for this gallery…</CardSubtitle>
        </CardBody>
      </Card>
    );
  }

  if (!galleryId) {
    return (
      <Card>
        <CardBody>
          <CardTitle>No pages loaded</CardTitle>
          <CardSubtitle>Seed or select a gallery to manage its pages.</CardSubtitle>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <DiscoverLinksCard
        pendingAction={pendingAction}
        onDiscover={payload => {
          void runDiscover(payload);
        }}
      />
      <PageLinksView
        gallery={gallery ?? null}
        pages={pages}
        pendingAction={pendingAction}
        onScrapePages={ids => {
          if (!ids.length) {
            return Promise.resolve();
          }
          return runScrapePages(ids);
        }}
        onUpdatePageKind={updates => {
          if (!updates.length) {
            return Promise.resolve(0);
          }
          return updatePageKinds(updates);
        }}
        onMarkPagesAsEvent={ids => {
          if (!ids.length) {
            return Promise.resolve();
          }
          return runPromoteEventPages(ids);
        }}
        onPreviewPages={async selections => {
          if (!selections.length) return;
          try {
            const items = await Promise.all(
              selections.map(async ({ id, label }) => {
                const content = await getPageContent(id);
                return {
                  title: label,
                  content: content.page_content?.markdown ?? null
                };
              })
            );
            showPreviewDialog({
              title: selections.length === 1 ? selections[0].label : `${selections.length} pages selected`,
              description: "Markdown captured from the latest scrape.",
              items
            });
          } catch (issue) {
            console.error("[GalleryPagesPage] preview fetch failed", issue);
          }
        }}
      />
    </div>
  );
}
