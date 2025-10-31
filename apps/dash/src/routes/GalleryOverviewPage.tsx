import { useEffect, useState } from "react";
import { Card, CardBody, CardSubtitle, CardTitle } from "@shared/ui";
import { GalleryOverviewCard } from "../features/gallery/GalleryOverviewCard";
import { useGalleryRoute } from "./GalleryDetailLayout";
import { fetchGalleryPages, getPageContent, type GalleryPage } from "../api";

export function GalleryOverviewPage() {
  const {
    gallery,
    galleryId,
    loadingGallery,
    pendingAction,
    dataVersion,
    runEmbedGallery,
    runScrapePages,
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

  const lastEmbeddedAt = gallery.gallery_info?.embedding_created_at ?? null;

  return (
    <GalleryOverviewCard
      gallery={gallery}
      mainPage={mainPage}
      aboutPage={aboutPage}
      eventsPage={eventsPage}
      embedDisabled={pendingAction === "embedGallery"}
      scrapeDisabled={pendingAction === "scrape"}
      lastEmbeddedAt={lastEmbeddedAt}
      onEmbedGallery={() => {
        console.log("[GalleryOverviewPage] embed requested", { galleryId });
        void runEmbedGallery();
      }}
      onPreviewMarkdown={async (pageId, label) => {
        console.log("[GalleryOverviewPage] preview requested", { pageId, label });
        try {
          const content = await getPageContent(pageId);
          showPreviewDialog({
            title: label,
            description: "Markdown captured from the latest scrape.",
            items: [
              {
                title: label,
                content: content.page_content?.markdown ?? null
              }
            ]
          });
        } catch (issue) {
          console.error("[GalleryOverviewPage] failed to load preview", issue);
        }
      }}
      onScrapePage={pageId => {
        console.log("[GalleryOverviewPage] scrape requested", { pageId });
        void runScrapePages([pageId]);
      }}
    />
  );
}
