import { useState } from "react";
import { SeedGallerySection } from "./components/SeedGallerySection";
import { GalleryOverview } from "./components/GalleryOverview";
import { PagesSection } from "./components/PagesSection";
import { EventsSection } from "./components/EventsSection";

async function post<T = unknown>(path: string, payload: unknown): Promise<T> {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function get<T = unknown>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export function App() {
  const [selectedGalleryId, setSelectedGalleryId] = useState<string | null>(null);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 1200, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>Gallery Ingest Dashboard</h1>

      <SeedGallerySection post={post} get={get} onGalleryCreated={setSelectedGalleryId} onGallerySelected={setSelectedGalleryId} />

      {selectedGalleryId && (
        <>
          <GalleryOverview galleryId={selectedGalleryId} get={get} post={post} />
          <PagesSection galleryId={selectedGalleryId} get={get} post={post} />
          <EventsSection galleryId={selectedGalleryId} get={get} post={post} />
        </>
      )}
    </div>
  );
}

export default App;