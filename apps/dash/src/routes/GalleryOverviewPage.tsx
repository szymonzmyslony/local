import { Card, CardBody, CardSubtitle, CardTitle } from "@shared/ui";
import { GalleryOverviewCard } from "../features/gallery/GalleryOverviewCard";
import { useGalleryRoute } from "./GalleryDetailLayout";
import { getPageContent } from "../api";

export function GalleryOverviewPage() {
  const {
    pipeline,
    loadingPipeline,
    pendingAction,
    runExtractGallery,
    runScrapePages,
    showPreviewDialog
  } = useGalleryRoute();

  if (loadingPipeline) {
    return (
      <Card>
        <CardBody>
          <CardTitle>Loading</CardTitle>
          <CardSubtitle>Please wait while we load the gallery pipeline.</CardSubtitle>
        </CardBody>
      </Card>
    );
  }

  if (!pipeline) {
    return (
      <Card>
        <CardBody>
          <CardTitle>No pipeline data</CardTitle>
          <CardSubtitle>Select a gallery from the list to view its pipeline overview.</CardSubtitle>
        </CardBody>
      </Card>
    );
  }

  const pages = pipeline.pages;
  const mainPage = pages.find(page => page.kind === "gallery_main") ?? null;
  const aboutPage = pages.find(page => page.kind === "gallery_about") ?? null;

  const canExtract = Boolean(
    mainPage &&
      mainPage.fetch_status === "ok" &&
      (!aboutPage || aboutPage.fetch_status === "ok")
  );

  return (
    <GalleryOverviewCard
      gallery={pipeline.gallery}
      mainPage={mainPage}
      aboutPage={aboutPage}
        extractDisabled={pendingAction === "extractGallery"}
      scrapeDisabled={pendingAction === "scrape"}
      canExtract={canExtract}
      onExtractGallery={() => {
        console.log("[GalleryOverviewPage] extract requested", { galleryId: pipeline.gallery.id });
        void runExtractGallery();
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
