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
  fetchGalleryDetail,
  fetchGalleryEvents,
  promotePagesToEvent,
  scrapePages,
  updatePageKinds,
  type DashboardAction,
  type GalleryDetail,
  type PageKindUpdate
} from "../api";
import { useDashboard } from "../providers/dashboard-context";

export type GalleryRouteContext = {
  galleryId: string;
  gallery: GalleryDetail | null;
  loadingGallery: boolean;
  pendingAction: DashboardAction | null;
  status: string | null;
  error: string | null;
  dataVersion: number;
  refreshData: () => void;
  runDiscover: (payload: { listUrls: string[]; limit?: number }) => Promise<void>;
  runScrapePages: (pageIds: string[]) => Promise<void>;
  runExtractPages: (pageIds: string[]) => Promise<boolean>;
  runPromoteEventPages: (pageIds: string[]) => Promise<void>;
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

  const [gallery, setGallery] = useState<GalleryDetail | null>(null);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [pendingAction, setPendingAction] = useState<DashboardAction | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewDialog, setPreviewDialog] = useState<{
    title: string;
    description?: string;
    items: PreviewDialogItem[];
  } | null>(null);

  useEffect(() => {
    setStatus(null);
    setError(null);
  }, [galleryId]);

  useEffect(() => {
    if (!galleryId) {
      setGallery(null);
      return;
    }
    void loadGallery(galleryId, { silent: dataVersion > 0 });
  }, [galleryId, dataVersion]);

  useEffect(() => {
    if (!galleries.length && !galleriesLoading) {
      void refreshGalleries();
    }
  }, [galleries.length, galleriesLoading, refreshGalleries]);


  async function loadGallery(id: string, options?: { silent?: boolean }) {
    if (!options?.silent) {
      setLoadingGallery(true);
    }
    try {
      const data = await fetchGalleryDetail(id);
      setGallery(data);
    } catch (issue) {
      setGallery(null);
      setError(issue instanceof Error ? issue.message : String(issue));
    } finally {
      setLoadingGallery(false);
    }
  }

  function bumpDataVersion(): void {
    setDataVersion(current => current + 1);
  }

  function refreshData(): void {
    bumpDataVersion();
  }

  async function runWorkflow(action: DashboardAction, task: () => Promise<string>): Promise<boolean> {
    setPendingAction(action);
    setStatus(null);
    setError(null);
    try {
      const workflowId = await task();
      setStatus(`Workflow started (${workflowId})`);
      return true;
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : String(issue));
      return false;
    } finally {
      setPendingAction(null);
      bumpDataVersion();
    }
  }

  async function runDiscover(payload: { listUrls: string[]; limit?: number }): Promise<void> {
    if (!galleryId) return;
    await runWorkflow("discover", () => discoverLinks({ galleryId, ...payload }));
  }

  async function runScrapePages(pageIds: string[]): Promise<void> {
    if (!pageIds.length) return;
    const uniqueIds = Array.from(new Set(pageIds));
    await runWorkflow("scrape", async () => {
      const runs = await Promise.all(uniqueIds.map(id => scrapePages([id])));
      return runs.join(", ");
    });
  }

  async function runExtractPages(pageIds: string[]): Promise<boolean> {
    if (!pageIds.length) return false;
    const started = await runWorkflow("extract", () => extractPages(pageIds));
    return started;
  }

  async function runPromoteEventPages(pageIds: string[]): Promise<void> {
    if (!pageIds.length) return;
    if (!galleryId) return;
    const started = await runWorkflow("scrapeAndExtract", () => promotePagesToEvent(pageIds));
    if (!started) {
      return;
    }
    try {
      const events = await fetchGalleryEvents(galleryId);
      const eventIds = events
        .filter(event => event.page_id && pageIds.includes(event.page_id))
        .map(event => event.id);
      if (eventIds.length) {
        await runWorkflow("embed", () => embedEvents(eventIds));
      }
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : String(issue));
    }
  }

  async function runProcessEvents(pageIds: string[]): Promise<void> {
    await runPromoteEventPages(pageIds);
  }

  async function runExtractGallery(): Promise<void> {
    if (!galleryId) return;
    const extracted = await runWorkflow("extractGallery", () => extractGalleryInfo(galleryId));
    if (!extracted) {
      return;
    }
    await runWorkflow("embedGallery", () => embedGallery(galleryId));
  }

  async function handleUpdatePageKinds(updates: PageKindUpdate[]): Promise<number> {
    if (!updates.length) return 0;
    try {
      const updated = await updatePageKinds(updates);
      setStatus(`Updated ${updated} pages`);
      bumpDataVersion();
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
        subtitle="Choose a gallery from the list to inspect its details."
        maxWidth="5xl"
      >
        <Card>
          <CardBody>
            <CardTitle>Select a gallery</CardTitle>
            <p className="text-sm text-slate-600">
              Choose a gallery from the list or seed a new one to manage it.
            </p>
          </CardBody>
        </Card>
      </DashboardShell>
    );
  }

  const fallbackGallery = galleries.find(gallery => gallery.id === galleryId);
  const activeGalleryName =
    gallery?.gallery_info?.name ??
    fallbackGallery?.gallery_info?.name ??
    gallery?.normalized_main_url ??
    fallbackGallery?.normalized_main_url ??
    "Gallery dashboard";

  const activeGalleryUrl =
    gallery?.main_url ?? fallbackGallery?.main_url ?? null;

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
          ) : "Select a gallery to manage it."
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
            gallery,
            loadingGallery,
          pendingAction,
          status,
          error,
          dataVersion,
          refreshData,
          runDiscover,
          runScrapePages,
          runExtractPages,
          runPromoteEventPages,
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
