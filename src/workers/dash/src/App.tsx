import { useEffect, useState } from "react";
import "./App.css";
import {
  discoverLinks,
  embedEvents,
  extractGalleryInfo,
  extractPages,
  fetchPipeline,
  getPageContent,
  listGalleries,
  processEvents,
  scrapePages,
  seedGallery,
  updatePageKinds
} from "./api";
import type { DashboardAction, GalleryListItem, PageKindUpdate, PipelineData, PipelinePage } from "./api";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/Tabs";
import { Button } from "./components/ui/button";
import { PreviewModal } from "./components/common/PreviewModal";
import { GalleryOverviewCard } from "./features/gallery/GalleryOverviewCard";
import { SeedGalleryForm } from "./features/gallery/SeedGalleryForm";
import { PageLinksView } from "./features/pages/PageLinksView";
import { DiscoverLinksCard } from "./features/pages/DiscoverLinksCard";
import { EventsView } from "./features/events/EventsView";
import { normalizeUrl } from "../workflows/utils/normalizeUrl";

type DashboardView = "overview" | "pages" | "events";

type PagePreviewState = {
  title: string;
  markdown: string | null;
};

export function App() {
  const [galleries, setGalleries] = useState<GalleryListItem[]>([]);
  const [selectedGalleryId, setSelectedGalleryId] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [view, setView] = useState<DashboardView>("overview");
  const [pendingAction, setPendingAction] = useState<DashboardAction | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);
  const [pagePreview, setPagePreview] = useState<PagePreviewState | null>(null);

  useEffect(() => {
    void loadGalleries();
  }, []);

  useEffect(() => {
    if (!selectedGalleryId) {
      setPipeline(null);
      return;
    }
    void refreshPipeline("refresh", { silent: true });
  }, [selectedGalleryId]);

  useEffect(() => {
    if (selectedGalleryId) return;
    if (galleries.length === 0) return;
    setSelectedGalleryId(galleries[0].id);
  }, [galleries, selectedGalleryId]);

  async function loadGalleries(): Promise<GalleryListItem[]> {
    try {
      const list = await listGalleries();
      setGalleries(list);
      return list;
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : String(issue));
      return [];
    }
  }

  async function refreshPipeline(action: DashboardAction = "refresh", options?: { silent?: boolean }): Promise<void> {
    if (!selectedGalleryId) return;
    if (!options?.silent) {
      setPendingAction(action);
      setStatus(null);
    }
    setError(null);
    try {
      const data = await fetchPipeline(selectedGalleryId);
      setPipeline(data);
      if (!options?.silent && action === "refresh") {
        setStatus("Pipeline refreshed");
      }
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : String(issue));
    } finally {
      if (!options?.silent) {
        setPendingAction(null);
      }
    }
  }

  async function runWorkflow(action: DashboardAction, task: () => Promise<string>): Promise<void> {
    setPendingAction(action);
    setStatus(null);
    setError(null);
    try {
      const workflowId = await task();
      setStatus(`Workflow started (${workflowId})`);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : String(issue));
    } finally {
      setPendingAction(null);
    }
    await refreshPipeline("refresh", { silent: true });
  }

  async function handleSeed(payload: { mainUrl: string; aboutUrl: string | null }): Promise<void> {
    setSeeding(true);
    setStatus(null);
    setError(null);
    try {
      const workflowId = await seedGallery(payload);
      setStatus(`Seed workflow started (${workflowId})`);
      const list = await loadGalleries();
      const normalized = normalizeUrl(payload.mainUrl);
      const match = list.find(gallery => gallery.normalized_main_url === normalized);
      if (match) {
        setSelectedGalleryId(match.id);
      }
      setSeedOpen(false);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : String(issue));
    } finally {
      setSeeding(false);
    }
  }

  async function handleDiscover(payload: { listUrls: string[]; limit?: number }): Promise<void> {
    if (!selectedGalleryId) return;
    await runWorkflow("discover", () => discoverLinks({ galleryId: selectedGalleryId, ...payload }));
  }

  async function handleScrapePages(pageIds: string[]): Promise<void> {
    if (pageIds.length === 0) return;
    markPagesStatus(pageIds, "fetching");
    await runWorkflow("scrape", () => scrapePages(pageIds));
  }

  async function handleExtractPages(pageIds: string[]): Promise<boolean> {
    if (pageIds.length === 0) return false;
    const ready = getScrapedPageIds(pageIds);
    if (ready.length === 0) {
      setStatus("Scrape pages before extracting");
      return false;
    }
    if (ready.length < pageIds.length) {
      setStatus(`Skipping ${pageIds.length - ready.length} pages that are not scraped yet`);
    }
    await runWorkflow("extract", () => extractPages(ready));
    return true;
  }

  async function handleProcessEventPages(pageIds: string[]): Promise<void> {
    if (pageIds.length === 0) return;
    const ready = getScrapedPageIds(pageIds);
    if (ready.length === 0) {
      setStatus("Scrape pages before processing events");
      return;
    }
    if (ready.length < pageIds.length) {
      setStatus(`Skipping ${pageIds.length - ready.length} pages that are not scraped yet`);
    }
    const extracted = await handleExtractPages(ready);
    if (!extracted) return;
    await runWorkflow("process", () => processEvents(ready));
  }

  async function handleExtractPage(pageId: string): Promise<void> {
    await handleExtractPages([pageId]);
  }

  async function handleEmbedEvents(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;
    await runWorkflow("embed", () => embedEvents(eventIds));
  }

  async function handleExtractGallery(): Promise<void> {
    if (!selectedGalleryId) return;
    await runWorkflow("extractGallery", () => extractGalleryInfo(selectedGalleryId));
  }

  async function handleUpdatePageKinds(updates: PageKindUpdate[]): Promise<void> {
    if (updates.length === 0) return;
    setPendingAction("updateKinds");
    setStatus(null);
    setError(null);
    try {
      const updated = await updatePageKinds(updates);
      applyPageKindUpdates(updates);
      setStatus(updated === 1 ? "Updated 1 page kind" : `Updated ${updated} page kinds`);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : String(issue));
    } finally {
      setPendingAction(null);
    }
    await refreshPipeline("refresh", { silent: true });
  }

  async function handlePreviewPage(pageId: string, label: string): Promise<void> {
    try {
      const page = await getPageContent(pageId);
      setPagePreview({ title: label, markdown: page.page_content?.markdown ?? null });
    } catch (issue) {
      const message = issue instanceof Error ? issue.message : String(issue);
      setPagePreview({ title: label, markdown: message });
    }
  }

  function handleSelectGallery(galleryId: string): void {
    setSelectedGalleryId(galleryId.length === 0 ? null : galleryId);
    setView("overview");
    setPagePreview(null);
  }

  function markPagesStatus(pageIds: string[], statusValue: PipelinePage["fetch_status"]): void {
    setPipeline(previous => {
      if (!previous) return previous;
      const nextPages = previous.pages.map(page =>
        pageIds.includes(page.id) ? { ...page, fetch_status: statusValue } : page
      );
      return { ...previous, pages: nextPages };
    });
  }

  function applyPageKindUpdates(updates: PageKindUpdate[]): void {
    if (updates.length === 0) return;
    const updatesById = new Map(updates.map(update => [update.pageId, update.kind]));
    setPipeline(previous => {
      if (!previous) return previous;
      const nextPages = previous.pages.map(page => {
        const nextKind = updatesById.get(page.id);
        return nextKind ? { ...page, kind: nextKind } : page;
      });
      return { ...previous, pages: nextPages };
    });
  }

  function getScrapedPageIds(pageIds: string[]): string[] {
    if (!pipeline) return [];
    const scraped = new Set(
      pipeline.pages.filter(page => page.fetch_status === "ok").map(page => page.id)
    );
    return pageIds.filter(id => scraped.has(id));
  }

  const showPlaceholder = !pipeline || !selectedGalleryId;

  let content = (
    <section className="card">
      <h2 className="card-title">Pipeline</h2>
      <p className="card-subtitle">Select a gallery to get started.</p>
    </section>
  );

  if (!showPlaceholder && pipeline) {
    if (view === "overview") {
      content = (
        <GalleryOverviewCard
          gallery={pipeline.gallery}
          pages={pipeline.pages}
          refreshDisabled={pendingAction === "refresh"}
          extractDisabled={pendingAction === "extractGallery"}
          onRefresh={() => {
            void refreshPipeline();
          }}
          onExtractGallery={() => {
            void handleExtractGallery();
          }}
          onPreviewMarkdown={handlePreviewPage}
          onScrapePage={pageId => {
            void handleScrapePages([pageId]);
          }}
        />
      );
    } else if (view === "pages") {
      content = (
        <div className="pages-stack">
          <DiscoverLinksCard
            pendingAction={pendingAction}
            onDiscover={payload => {
              void handleDiscover(payload);
            }}
          />
          <PageLinksView
            pages={pipeline.pages}
            pendingAction={pendingAction}
            onPreviewMarkdown={handlePreviewPage}
            onScrapePage={pageId => {
              void handleScrapePages([pageId]);
            }}
            onExtractPage={pageId => {
              void handleExtractPage(pageId);
            }}
            onUpdatePageKind={handleUpdatePageKinds}
          />
        </div>
      );
    } else {
      content = (
        <EventsView
          events={pipeline.events}
          pages={pipeline.pages}
          pendingAction={pendingAction}
          onProcessEventPages={pageIds => {
            void handleProcessEventPages(pageIds);
          }}
          onEmbedEvents={eventIds => {
            void handleEmbedEvents(eventIds);
          }}
        />
      );
    }
  }

  return (
    <div className="app-shell">
      <header className="dashboard-header">
        <div className="dashboard-header__left">
          <h1 className="app-title">Gallery dashboard</h1>
          <Tabs
            value={view}
            onValueChange={value => setView(value as DashboardView)}
            className="dashboard-tabs"
          >
            <TabsList>
              <TabsTrigger value="overview">Gallery</TabsTrigger>
              <TabsTrigger value="pages">Pages</TabsTrigger>
              <TabsTrigger value="events">Events</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="dashboard-header__right">
          <div className="field">
            <label htmlFor="gallery-select">Active gallery</label>
            <select
              id="gallery-select"
              value={selectedGalleryId ?? ""}
              onChange={event => handleSelectGallery(event.target.value)}
            >
              <option value="">Choose a gallery…</option>
              {galleries.map(gallery => (
                <option key={gallery.id} value={gallery.id}>
                  {gallery.gallery_info?.name ?? gallery.normalized_main_url}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" variant="secondary" onClick={() => setSeedOpen(true)}>
            Seed gallery
          </Button>
        </div>
      </header>

      {status ? <div className="status-banner">{status}</div> : null}
      {error ? <div className="status-banner error">{error}</div> : null}

      {seedOpen ? (
        <SeedGalleryForm
          onSubmit={handleSeed}
          onClose={() => setSeedOpen(false)}
          submitting={seeding}
        />
      ) : null}

      {content}

      {pagePreview ? (
        <PreviewModal
          title={pagePreview.title}
          markdown={pagePreview.markdown}
          onClose={() => setPagePreview(null)}
        />
      ) : null}
    </div>
  );
}

export default App;
