import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useOutletContext, useParams } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@shared/ui";
import { cn } from "@shared";
import {
  discoverLinks,
  embedEvents,
  embedGallery,
  extractGalleryInfo,
  extractPages,
  fetchPipeline,
  getPageContent,
  processEvents,
  scrapePages,
  updatePageKinds,
  type DashboardAction,
  type PageKindUpdate,
  type PipelineData
} from "../api";
import { useDashboard } from "../providers/dashboard-context";

type PagePreviewState = { title: string; markdown: string | null };
type GalleryEmbeddingPreview = { title: string; embedding: string };

export type GalleryRouteContext = {
  galleryId: string;
  pipeline: PipelineData | null;
  loadingPipeline: boolean;
  pendingAction: DashboardAction | null;
  status: string | null;
  error: string | null;
  refreshPipeline: () => Promise<void>;
  runDiscover: (payload: { listUrls: string[]; limit?: number }) => Promise<void>;
  runScrapePages: (pageIds: string[]) => Promise<void>;
  runExtractPages: (pageIds: string[]) => Promise<boolean>;
  runProcessEvents: (pageIds: string[]) => Promise<void>;
  runEmbedEvents: (eventIds: string[]) => Promise<void>;
  runEmbedGallery: () => Promise<void>;
  runExtractGallery: () => Promise<void>;
  updatePageKinds: (updates: PageKindUpdate[]) => Promise<number>;
  openPagePreview: (pageId: string, label: string) => Promise<void>;
  openEmbeddingPreview: (title: string, embedding: string) => void;
  pagePreview: PagePreviewState | null;
  embeddingPreview: GalleryEmbeddingPreview | null;
  setStatus: (value: string | null) => void;
  setError: (value: string | null) => void;
};

export function useGalleryRoute(): GalleryRouteContext {
  return useOutletContext<GalleryRouteContext>();
}

export function GalleryDetailLayout() {
  const navigate = useNavigate();
  const { galleryId } = useParams<{ galleryId: string }>();
  const { galleries, refreshGalleries, loading: galleriesLoading } = useDashboard();

  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [loadingPipeline, setLoadingPipeline] = useState(false);
  const [pendingAction, setPendingAction] = useState<DashboardAction | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pagePreview, setPagePreview] = useState<PagePreviewState | null>(null);
  const [embeddingPreview, setEmbeddingPreview] = useState<GalleryEmbeddingPreview | null>(null);

  useEffect(() => {
    if (!galleryId) return;
    setStatus(null);
    setError(null);
    void loadPipeline(galleryId, { silent: false });
  }, [galleryId]);

  useEffect(() => {
    if (!galleries.length && !galleriesLoading) {
      void refreshGalleries();
    }
  }, [galleries.length, galleriesLoading, refreshGalleries]);


  async function loadPipeline(id: string, options?: { silent?: boolean }) {
    if (!options?.silent) {
      setLoadingPipeline(true);
    }
    try {
      const data = await fetchPipeline(id);
      setPipeline(data);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : String(issue));
    } finally {
      setLoadingPipeline(false);
    }
  }

  async function refreshPipeline(): Promise<void> {
    if (!galleryId) return;
    await loadPipeline(galleryId, { silent: true });
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
      await refreshPipeline();
    }
  }

  async function runDiscover(payload: { listUrls: string[]; limit?: number }): Promise<void> {
    if (!galleryId) return;
    await runWorkflow("discover", () => discoverLinks({ galleryId, ...payload }));
  }

  async function runScrapePages(pageIds: string[]): Promise<void> {
    if (!pageIds.length) return;
    await runWorkflow("scrape", () => scrapePages(pageIds));
  }

  async function runExtractPages(pageIds: string[]): Promise<boolean> {
    if (!pageIds.length) return false;
    await runWorkflow("extract", () => extractPages(pageIds));
    return true;
  }

  async function runProcessEvents(pageIds: string[]): Promise<void> {
    if (!pageIds.length) return;
    await runWorkflow("process", () => processEvents(pageIds));
  }

  async function runEmbedEvents(eventIds: string[]): Promise<void> {
    if (!eventIds.length) return;
    await runWorkflow("embed", () => embedEvents(eventIds));
  }

  async function runEmbedGallery(): Promise<void> {
    if (!galleryId) return;
    await runWorkflow("embedGallery", () => embedGallery(galleryId));
  }

  async function runExtractGallery(): Promise<void> {
    if (!galleryId) return;
    await runWorkflow("extractGallery", () => extractGalleryInfo(galleryId));
  }

  async function handleUpdatePageKinds(updates: PageKindUpdate[]): Promise<number> {
    if (!updates.length) return 0;
    try {
      const updated = await updatePageKinds(updates);
      setStatus(`Updated ${updated} pages`);
      await refreshPipeline();
      return updated;
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : String(issue));
      return 0;
    }
  }

  async function openPagePreview(pageId: string, label: string): Promise<void> {
    try {
      const content = await getPageContent(pageId);
      setPagePreview({
        title: label,
        markdown: content.page_content?.markdown ?? null,
      });
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : String(issue));
    }
  }

  function openEmbeddingPreview(title: string, embedding: string): void {
    setEmbeddingPreview({ title, embedding });
  }

  if (!galleryId) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-10">
        <Card>
          <CardBody>
            <CardTitle>Select a gallery</CardTitle>
            <p className="text-sm text-slate-600">
              Choose a gallery from the list or seed a new one to manage its pipeline.
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-6 border-b border-slate-200 pb-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">Gallery dashboard</h1>
          <nav className="flex flex-wrap gap-2">
            {[
              { label: "Gallery", to: "overview" },
              { label: "Pages", to: "pages" },
              { label: "Events", to: "events" }
            ].map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "overview"}
                className={({ isActive }) =>
                  cn(
                    "rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-slate-100",
                    isActive
                      ? "border-slate-200 bg-white text-slate-900 shadow-sm"
                      : "border-transparent text-slate-600"
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="gallery-select">Active gallery</Label>
            <Select
              value={galleryId ?? undefined}
              onValueChange={value => navigate(`/galleries/${value}/overview`)}
            >
              <SelectTrigger className="min-w-[220px]" id="gallery-select">
                <SelectValue placeholder="Choose a gallery..." />
              </SelectTrigger>
              <SelectContent>
                {galleries.map(gallery => (
                  <SelectItem key={gallery.id} value={gallery.id}>
                    {gallery.gallery_info?.name ?? gallery.main_url}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="muted"
            onClick={() => navigate("/gallery-list")}
          >
            Manage galleries
          </Button>
        </div>
      </header>

      {status ? <Badge variant="secondary" className="w-fit">{status}</Badge> : null}
      {error ? <Badge variant="destructive" className="w-fit">{error}</Badge> : null}

      <Outlet
        context={{
          galleryId,
          pipeline,
          loadingPipeline,
          pendingAction,
          status,
          error,
          refreshPipeline,
          runDiscover,
          runScrapePages,
          runExtractPages,
          runProcessEvents,
          runEmbedEvents,
          runEmbedGallery,
          runExtractGallery,
          updatePageKinds: handleUpdatePageKinds,
          openPagePreview,
          openEmbeddingPreview,
          pagePreview,
          embeddingPreview,
          setStatus,
          setError,
        }}
      />

      {pagePreview ? (
        <Dialog open onOpenChange={open => !open && setPagePreview(null)}>
          <DialogContent className="max-w-3xl" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{pagePreview.title}</DialogTitle>
              <DialogDescription>Markdown captured from the latest scrape.</DialogDescription>
            </DialogHeader>
            <pre className="max-h-[60vh] overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
              {pagePreview.markdown ?? "No content available."}
            </pre>
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="muted" onClick={() => setPagePreview(null)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      {embeddingPreview ? (
        <Dialog open onOpenChange={open => !open && setEmbeddingPreview(null)}>
          <DialogContent className="max-w-2xl" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{embeddingPreview.title}</DialogTitle>
              <DialogDescription>Embedding vector payload for inspection.</DialogDescription>
            </DialogHeader>
            <pre className="max-h-[60vh] overflow-y-auto rounded-md bg-slate-900/90 p-4 text-xs text-slate-100">
              {embeddingPreview.embedding ?? "No embedding stored."}
            </pre>
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="muted" onClick={() => setEmbeddingPreview(null)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
