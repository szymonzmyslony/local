import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate
} from "react-router-dom";
import {
  discoverLinks,
  embedEvents,
  embedGallery,
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
import type {
  DashboardAction,
  GalleryListItem,
  PageKindUpdate,
  PipelineData,
  PipelinePage
} from "./api";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardSubtitle,
  CardTitle,
  Tabs,
  TabsList,
  TabsTrigger
} from "@shared/ui";
import { GalleryOverviewCard } from "./features/gallery/GalleryOverviewCard";
import { SeedGalleryForm } from "./features/gallery/SeedGalleryForm";
import { DiscoverLinksCard } from "./features/pages/DiscoverLinksCard";
import { PageLinksView } from "./features/pages/PageLinksView";
import { EventsView } from "./features/events/EventsView";
import { PreviewModal } from "./components/common/PreviewModal";
import { normalizeUrl } from "../workflows/utils/normalizeUrl";

type DashboardTab = "overview" | "pages" | "events";

type PagePreviewState = { title: string; markdown: string | null };
type GalleryEmbeddingPreview = { title: string; embedding: string };

const TAB_PATH: Record<DashboardTab, string> = {
  overview: "/overview",
  pages: "/pages",
  events: "/events"
};

const TAB_VALUES: DashboardTab[] = ["overview", "pages", "events"];
function getTabFromPath(pathname: string): DashboardTab {
  if (pathname.startsWith("/pages")) return "pages";
  if (pathname.startsWith("/events")) return "events";
  return "overview";
}

export default function App() {
  return (
    <BrowserRouter>
      <DashboardApp />
    </BrowserRouter>
  );
}

function DashboardApp() {
  const [galleries, setGalleries] = useState<GalleryListItem[]>([]);
  const [selectedGalleryId, setSelectedGalleryId] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [pendingAction, setPendingAction] = useState<DashboardAction | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);
  const [pagePreview, setPagePreview] = useState<PagePreviewState | null>(null);
  const [galleryEmbeddingPreview, setGalleryEmbeddingPreview] = useState<GalleryEmbeddingPreview | null>(null);

  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = getTabFromPath(location.pathname);

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

  async function refreshPipeline(
    action: DashboardAction = "refresh",
    options?: { silent?: boolean }
  ): Promise<void> {
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

  async function handleEmbedGallery(): Promise<void> {
    if (!selectedGalleryId) return;
    await runWorkflow("embedGallery", () => embedGallery(selectedGalleryId));
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
    navigate(TAB_PATH.overview);
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

  const hasSelection = Boolean(selectedGalleryId && pipeline);

  const banners = useMemo(() => {
    const items: ReactNode[] = [];
    if (status) {
      items.push(
        <div key="status" className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700">
          {status}
        </div>
      );
    }
    if (error) {
      items.push(
        <div key="error" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {error}
        </div>
      );
    }
    return items;
  }, [status, error]);

  const seedForm = seedOpen ? (
    <SeedGalleryForm
      onSubmit={handleSeed}
      onClose={() => setSeedOpen(false)}
      submitting={seeding}
    />
  ) : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-6 border-b border-slate-200 pb-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">Gallery dashboard</h1>
          <Tabs
            value={activeTab}
            onValueChange={(value: string) => {
              if (TAB_VALUES.includes(value as DashboardTab)) {
                navigate(TAB_PATH[value as DashboardTab]);
              }
            }}
            className="w-full md:w-auto"
          >
            <TabsList>
              <TabsTrigger value="overview">Gallery</TabsTrigger>
              <TabsTrigger value="pages">Pages</TabsTrigger>
              <TabsTrigger value="events">Events</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 md:w-64" htmlFor="gallery-select">
            Active gallery
            <select
              id="gallery-select"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              value={selectedGalleryId ?? ""}
              onChange={event => handleSelectGallery(event.target.value)}
            >
              <option value="">Choose a gallery...</option>
              {galleries.map(gallery => (
                <option key={gallery.id} value={gallery.id}>
                  {gallery.gallery_info?.name ?? gallery.normalized_main_url}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" variant="secondary" onClick={() => setSeedOpen(true)}>
            Seed gallery
          </Button>
        </div>
      </header>

      {banners.length > 0 ? <div className="flex flex-col gap-3">{banners}</div> : null}
      {seedForm}

      <Routes>
        <Route path="/" element={<Navigate to={TAB_PATH.overview} replace />} />
        <Route
          path={TAB_PATH.overview}
          element={
            hasSelection && pipeline ? (
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
                onEmbedGallery={() => {
                  void handleEmbedGallery();
                }}
                embedPending={pendingAction === "embedGallery"}
                onViewEmbedding={() => {
                  const info = pipeline.gallery.gallery_info;
                  if (!info?.embedding) return;
                  setGalleryEmbeddingPreview({
                    title: info.name ?? pipeline.gallery.normalized_main_url,
                    embedding: info.embedding
                  });
                }}
              />
            ) : (
              <EmptyState />
            )
          }
        />
        <Route
          path={TAB_PATH.pages}
          element={
            hasSelection && pipeline ? (
              <div className="flex flex-col gap-6">
                <DiscoverLinksCard pendingAction={pendingAction} onDiscover={handleDiscover} />
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
            ) : (
              <EmptyState />
            )
          }
        />
        <Route
          path={TAB_PATH.events}
          element={
            hasSelection && pipeline ? (
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
            ) : (
              <EmptyState />
            )
          }
        />
        <Route path="*" element={<Navigate to={TAB_PATH.overview} replace />} />
      </Routes>

      {pagePreview ? (
        <PreviewModal
          title={pagePreview.title}
          markdown={pagePreview.markdown}
          onClose={() => setPagePreview(null)}
        />
      ) : null}

      {galleryEmbeddingPreview ? (
        <PreviewModal
          title={`Gallery embedding - ${galleryEmbeddingPreview.title}`}
          markdown={galleryEmbeddingPreview.embedding}
          onClose={() => setGalleryEmbeddingPreview(null)}
        />
      ) : null}
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Select a gallery to get started</CardTitle>
        <CardSubtitle>The pipeline overview will appear once you choose a gallery.</CardSubtitle>
      </CardHeader>
      <CardBody>
        <p className="text-sm text-slate-600">
          Use the selector above to choose or seed a gallery. Once selected you can manage its pages and events.
        </p>
      </CardBody>
    </Card>
  );
}
