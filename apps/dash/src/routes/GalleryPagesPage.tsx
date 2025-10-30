import { useMemo } from "react";
import { Card, CardBody, CardSubtitle, CardTitle } from "@shared/ui";
import { DiscoverLinksCard } from "../features/pages/DiscoverLinksCard";
import { PageLinksView } from "../features/pages/PageLinksView";
import { useGalleryRoute } from "./GalleryDetailLayout";
import { getPageContent } from "../api";

export function GalleryPagesPage() {
  const {
    pipeline,
    loadingPipeline,
    pendingAction,
    runDiscover,
    runScrapePages,
    runExtractPages,
    updatePageKinds,
    showPreviewDialog
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
        onScrapePages={ids => {
          if (!ids.length) return;
          void runScrapePages(ids);
        }}
        onExtractPages={ids => {
          if (!ids.length) return;
          void runExtractPages(ids);
        }}
        onUpdatePageKind={updates => {
          void updatePageKinds(updates);
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
