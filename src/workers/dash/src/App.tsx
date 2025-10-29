import { SeedGallerySection } from "./components/SeedGallerySection";
import { DiscoverLinksSection } from "./components/DiscoverLinksSection";
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
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 980, margin: "2rem auto" }}>
      <h1>Ingest Dashboard</h1>
      <SeedGallerySection post={post} get={get} />
      <DiscoverLinksSection post={post} />
      <PagesSection get={get} post={post} />
      <EventsSection get={get} post={post} />
    </div>
  );
}

export default App;