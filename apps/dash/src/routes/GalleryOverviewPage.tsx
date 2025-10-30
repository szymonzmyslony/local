import { Card, CardBody, CardSubtitle, CardTitle } from "@shared/ui";
import { GalleryOverviewCard } from "../features/gallery/GalleryOverviewCard";
import { useGalleryRoute } from "./GalleryDetailLayout";

export function GalleryOverviewPage() {
  const {
    pipeline,
    loadingPipeline,
    pendingAction,
    refreshPipeline,
    runExtractGallery,
    runScrapePages,
    runEmbedGallery,
    openPagePreview
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

  const canEmbed = Boolean(
    mainPage &&
      mainPage.fetch_status === "ok" &&
      (!aboutPage || aboutPage.fetch_status === "ok")
  );

  const canExtract = canEmbed;

  return (
    <GalleryOverviewCard
      gallery={pipeline.gallery}
      mainPage={mainPage}
      aboutPage={aboutPage}
      refreshDisabled={pendingAction === "refresh" || loadingPipeline}
      extractDisabled={pendingAction === "extractGallery"}
      scrapeDisabled={pendingAction === "scrape"}
      embeddingDisabled={pendingAction === "embedGallery"}
      canExtract={canExtract}
      canEmbed={canEmbed}
      onRefresh={() => {
        console.log("[GalleryOverviewPage] refresh requested", { galleryId: pipeline.gallery.id });
        void refreshPipeline();
      }}
      onExtractGallery={() => {
        console.log("[GalleryOverviewPage] extract requested", { galleryId: pipeline.gallery.id });
        void runExtractGallery();
      }}
      onPreviewMarkdown={(pageId, label) => {
        console.log("[GalleryOverviewPage] preview requested", { pageId, label });
        void openPagePreview(pageId, label);
      }}
      onScrapePage={pageId => {
        console.log("[GalleryOverviewPage] scrape requested", { pageId });
        void runScrapePages([pageId]);
      }}
      onRunEmbedding={() => {
        console.log("[GalleryOverviewPage] embedding requested", { galleryId: pipeline.gallery.id });
        void runEmbedGallery();
      }}
    />
  );
}
