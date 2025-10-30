import { useMemo } from "react";
import { Card, CardBody, CardSubtitle, CardTitle } from "@shared/ui";
import { DiscoverLinksCard } from "../features/pages/DiscoverLinksCard";
import { PageLinksView } from "../features/pages/PageLinksView";
import { useGalleryRoute } from "./GalleryDetailLayout";

export function GalleryPagesPage() {
  const {
    pipeline,
    loadingPipeline,
    pendingAction,
    runDiscover,
    runScrapePages,
    runExtractPages,
    updatePageKinds,
    openPagePreview
  } = useGalleryRoute();

  const pages = useMemo(() => pipeline?.pages ?? [], [pipeline?.pages]);

  if (loadingPipeline) {
    return (
      <Card>
        <CardBody>
          <CardTitle>Loading pages</CardTitle>
          <CardSubtitle>Fetching the latest page pipeline data…</CardSubtitle>
        </CardBody>
      </Card>
    );
  }

  if (!pipeline) {
    return (
      <Card>
        <CardBody>
          <CardTitle>No pages loaded</CardTitle>
          <CardSubtitle>Seed or select a gallery to manage its page pipeline.</CardSubtitle>
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
        pages={pages}
        pendingAction={pendingAction}
        onPreviewMarkdown={openPagePreview}
        onScrapePage={pageId => {
          void runScrapePages([pageId]);
        }}
        onExtractPage={pageId => {
          void runExtractPages([pageId]);
        }}
        onUpdatePageKind={updates => {
          void updatePageKinds(updates);
        }}
      />
    </div>
  );
}
