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
    openPagePreview,
    openEmbeddingPreview,
    setStatus
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

  return (
    <GalleryOverviewCard
      gallery={pipeline.gallery}
      pages={pipeline.pages}
      refreshDisabled={pendingAction === "refresh" || loadingPipeline}
      extractDisabled={pendingAction === "extractGallery"}
      onRefresh={() => {
        void refreshPipeline();
      }}
      onExtractGallery={() => {
        void runExtractGallery();
      }}
      onPreviewMarkdown={openPagePreview}
      onScrapePage={pageId => {
        void runScrapePages([pageId]);
      }}
      onEmbedGallery={() => {
        void runEmbedGallery();
      }}
      embedPending={pendingAction === "embedGallery"}
      onViewEmbedding={() => {
        const info = pipeline.gallery.gallery_info;
        if (!info?.embedding) {
          setStatus("No embedding available for this gallery.");
          return;
        }
        openEmbeddingPreview(info.name ?? pipeline.gallery.normalized_main_url, info.embedding);
      }}
    />
  );
}
