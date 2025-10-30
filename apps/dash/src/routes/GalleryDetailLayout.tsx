import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useOutletContext, useParams } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@shared/ui";
import { cn } from "@shared";
import { DashboardShell } from "../components/layout";
import { PreviewDialog, type PreviewDialogItem } from "../components/preview/PreviewDialog";
import { StatusMessages } from "../components/status";
import {
  discoverLinks,
  embedEvents,
  embedGallery,
  extractGalleryInfo,
  extractPages,
  fetchPipeline,
  processEvents,
  scrapePages,
  updatePageKinds,
  type DashboardAction,
  type PageKindUpdate,
  type PipelineData
} from "../api";
import { useDashboard } from "../providers/dashboard-context";

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
  runExtractGallery: () => Promise<void>;
  updatePageKinds: (updates: PageKindUpdate[]) => Promise<number>;
  showPreviewDialog: (payload: { title: string; description?: string; items: PreviewDialogItem[] }) => void;
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
  const [previewDialog, setPreviewDialog] = useState<{
    title: string;
    description?: string;
    items: PreviewDialogItem[];
  } | null>(null);

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
    const eventPageIds = (pipeline?.pages ?? [])
      .filter(page => page.kind === "event_detail" && pageIds.includes(page.id))
      .map(page => page.id);
    if (eventPageIds.length) {
      await runProcessEvents(eventPageIds);
    }
    return true;
  }

  async function runProcessEvents(pageIds: string[]): Promise<void> {
    if (!pageIds.length) return;
    if (!galleryId) return;
    await runWorkflow("process", () => processEvents(pageIds));
    const current = await fetchPipeline(galleryId);
    setPipeline(current);
    const eventIds = current.events
      .filter(event => event.page_id && pageIds.includes(event.page_id))
      .map(event => event.id);
    if (eventIds.length) {
      await runWorkflow("embed", () => embedEvents(eventIds));
    }
  }

  async function runExtractGallery(): Promise<void> {
    if (!galleryId) return;
    await runWorkflow("extractGallery", () => extractGalleryInfo(galleryId));
    await runWorkflow("embedGallery", () => embedGallery(galleryId));
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

  function showPreviewDialog(payload: { title: string; description?: string; items: PreviewDialogItem[] }): void {
    setPreviewDialog(payload);
  }

  if (!galleryId) {
    return (
      <DashboardShell
        title="Gallery dashboard"
        subtitle="Choose a gallery from the list to inspect its pipeline."
        maxWidth="5xl"
      >
        <Card>
          <CardBody>
            <CardTitle>Select a gallery</CardTitle>
            <p className="text-sm text-slate-600">
              Choose a gallery from the list or seed a new one to manage its pipeline.
            </p>
          </CardBody>
        </Card>
      </DashboardShell>
    );
  }

  const fallbackGallery = galleries.find(gallery => gallery.id === galleryId);
  const activeGalleryName =
    pipeline?.gallery.gallery_info?.name ??
    fallbackGallery?.gallery_info?.name ??
    pipeline?.gallery.normalized_main_url ??
    fallbackGallery?.normalized_main_url ??
    "Gallery dashboard";

  const activeGalleryUrl =
    pipeline?.gallery.main_url ?? fallbackGallery?.main_url ?? null;

  const headerContent = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active gallery</span>
          <Select
            value={galleryId}
            onValueChange={value => navigate(`/galleries/${value}/overview`)}
          >
            <SelectTrigger className="min-w-[220px]">
              <SelectValue placeholder="Choose a gallery…" />
            </SelectTrigger>
            <SelectContent>
              {galleries.map(gallery => (
                <SelectItem key={gallery.id} value={gallery.id}>
                  {gallery.gallery_info?.name ?? gallery.normalized_main_url}
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
      <nav className="flex flex-wrap gap-2">
        {[
          { label: "Overview", to: "overview" },
          { label: "Pages", to: "pages" },
          { label: "Events", to: "events" }
        ].map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "overview"}
            className={({ isActive }) =>
              cn(
                "rounded-md border px-3 py-2 text-sm font-medium transition",
                isActive
                  ? "border-slate-300 bg-white text-slate-900 shadow-sm"
                  : "border-transparent text-slate-600 hover:bg-slate-100"
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );

  return (
    <>
      <DashboardShell
        title={activeGalleryName}
        subtitle={
          activeGalleryUrl ? (
            <a href={activeGalleryUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
              {activeGalleryUrl}
            </a>
          ) : "Select a gallery to manage its pipeline."
        }
        titleAside={
          status ? (
            <Badge variant="secondary" className="whitespace-nowrap">
              {status}
            </Badge>
          ) : null
        }
        headerContent={headerContent}
        maxWidth="6xl"
      >
        <StatusMessages error={error} />
        <Outlet
          context={{
            galleryId,
            pipeline,
            loadingPipeline,
            pendingAction,
            status,
            error,
            runDiscover,
            runScrapePages,
          runExtractPages,
          runProcessEvents,
          runExtractGallery,
          updatePageKinds: handleUpdatePageKinds,
          showPreviewDialog,
          setStatus,
          setError,
        }}
      />
      </DashboardShell>
      {previewDialog ? (
        <PreviewDialog
          open
          onClose={() => setPreviewDialog(null)}
          title={previewDialog.title}
          description={previewDialog.description}
          items={previewDialog.items}
        />
      ) : null}
    </>
  );
}
