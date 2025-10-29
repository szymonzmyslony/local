import { useEffect, useMemo, useState } from "react";
import "./App.css";
import {
  discoverLinks,
  embedEvents,
  extractGalleryInfo,
  extractPages,
  classifyPages,
  fetchPipeline,
  listGalleries,
  processEvents,
  scrapePages,
  seedGallery,
  type GalleryListItem,
  type PipelineData
} from "./api";
import { GalleryPanel } from "./components/GalleryPanel";
import { PipelineView, type PipelineAction } from "./components/PipelineView";
import { normalizeUrl } from "./utils/normalizeUrl";

export function App() {
  const [galleries, setGalleries] = useState<GalleryListItem[]>([]);
  const [selectedGalleryId, setSelectedGalleryId] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PipelineAction | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    void loadGalleries();
  }, []);

  useEffect(() => {
    if (!selectedGalleryId) {
      setPipeline(null);
      setSelectedPageIds(new Set());
      setSelectedEventIds(new Set());
      return;
    }
    void refreshPipeline("refresh", { quiet: true });
  }, [selectedGalleryId]);

  useEffect(() => {
    if (selectedGalleryId) return;
    if (galleries.length === 0) return;
    setSelectedGalleryId(galleries[0].id);
  }, [galleries, selectedGalleryId]);

  const selectedGallery = useMemo(
    () => galleries.find(gallery => gallery.id === selectedGalleryId) ?? null,
    [galleries, selectedGalleryId]
  );

  async function loadGalleries(): Promise<GalleryListItem[]> {
    try {
      const list = await listGalleries();
      setGalleries(list);
      return list;
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      return [];
    }
  }

  async function refreshPipeline(action: PipelineAction = "refresh", options?: { quiet?: boolean }): Promise<void> {
    if (!selectedGalleryId) return;
    setPendingAction(action);
    setError(null);
    if (!options?.quiet) setStatus(null);
    try {
      const data = await fetchPipeline(selectedGalleryId);
      setPipeline(data);
      setSelectedPageIds(new Set());
      setSelectedEventIds(new Set());
      if (!options?.quiet) {
        setStatus("Pipeline refreshed");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction(previous => (previous === action ? null : previous));
    }
  }

  async function handleSeed(payload: { mainUrl: string; aboutUrl: string | null }): Promise<void> {
    setSeeding(true);
    setError(null);
    setStatus(null);
    try {
      const workflowId = await seedGallery(payload);
      setStatus(`Seed workflow started (${workflowId})`);
      const list = await loadGalleries();
      const normalized = normalizeUrl(payload.mainUrl);
      const match = list.find(gallery => gallery.normalized_main_url === normalized);
      if (match) {
        setSelectedGalleryId(match.id);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setSeeding(false);
    }
  }

  async function runWorkflow(action: PipelineAction, task: () => Promise<string>): Promise<void> {
    setPendingAction(action);
    setError(null);
    setStatus(null);
    try {
      const workflowId = await task();
      setStatus(`Workflow started (${workflowId})`);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction(previous => (previous === action ? null : previous));
    }
    await refreshPipeline("refresh", { quiet: true });
  }

  async function handleDiscover(payload: { listUrls: string[]; limit?: number }): Promise<void> {
    if (!selectedGalleryId) return;
    await runWorkflow("discover", () => discoverLinks({ galleryId: selectedGalleryId, ...payload }));
  }

  async function handleScrape(pageIds: string[]): Promise<void> {
    if (pageIds.length === 0) return;
    await runWorkflow("scrape", () => scrapePages(pageIds));
  }

  async function handleClassify(pageIds: string[]): Promise<void> {
    if (pageIds.length === 0) return;
    await runWorkflow("classify", () => classifyPages(pageIds));
  }

  async function handleExtract(pageIds: string[]): Promise<void> {
    if (pageIds.length === 0) return;
    await runWorkflow("extract", () => extractPages(pageIds));
  }

  async function handleProcess(pageIds: string[]): Promise<void> {
    if (pageIds.length === 0) return;
    await runWorkflow("process", () => processEvents(pageIds));
  }

  async function handleEmbed(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;
    await runWorkflow("embed", () => embedEvents(eventIds));
  }

  async function handleExtractGallery(): Promise<void> {
    if (!selectedGalleryId) return;
    await runWorkflow("extractGallery", () => extractGalleryInfo(selectedGalleryId));
  }

  function togglePageSelection(pageId: string): void {
    setSelectedPageIds(previous => {
      const next = new Set(previous);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  }

  function toggleEventSelection(eventId: string): void {
    setSelectedEventIds(previous => {
      const next = new Set(previous);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  }

  function setPageSelection(ids: string[]): void {
    setSelectedPageIds(new Set(ids));
  }

  function setEventSelection(ids: string[]): void {
    setSelectedEventIds(new Set(ids));
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">Gallery Operations Dashboard</h1>
      </header>

      {status && <div className="status-banner">{status}</div>}
      {error && <div className="status-banner error">{error}</div>}

      <GalleryPanel
        galleries={galleries}
        selectedGalleryId={selectedGalleryId}
        onSelect={galleryId => setSelectedGalleryId(galleryId || null)}
        onSeed={handleSeed}
        seeding={seeding}
      />

      {selectedGallery && pipeline ? (
        <PipelineView
          pipeline={pipeline}
          pendingAction={pendingAction}
          onRefresh={() => void refreshPipeline()}
          onExtractGallery={() => void handleExtractGallery()}
          onDiscover={payload => void handleDiscover(payload)}
          onScrape={ids => void handleScrape(ids)}
          onClassifyPages={ids => void handleClassify(ids)}
          onExtractPages={ids => void handleExtract(ids)}
          onProcessEvents={ids => void handleProcess(ids)}
          onEmbedEvents={ids => void handleEmbed(ids)}
          selectedPageIds={selectedPageIds}
          onTogglePage={togglePageSelection}
          onSetPageSelection={setPageSelection}
          selectedEventIds={selectedEventIds}
          onToggleEvent={toggleEventSelection}
          onSetEventSelection={setEventSelection}
        />
      ) : (
        <section className="card">
          <h2 className="card-title">Pipeline</h2>
          <p className="card-subtitle">
            Select a gallery to load its ingestion pipeline, then work through pages, structured data and events.
          </p>
        </section>
      )}
    </div>
  );
}

export default App;
