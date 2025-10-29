import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { GalleryListItem } from "../api";

type SeedPayload = {
  mainUrl: string;
  aboutUrl: string | null;
};

type Props = {
  galleries: GalleryListItem[];
  selectedGalleryId: string | null;
  onSelect: (galleryId: string) => void;
  onSeed: (payload: SeedPayload) => Promise<void>;
  seeding: boolean;
};

export function GalleryPanel({ galleries, selectedGalleryId, onSelect, onSeed, seeding }: Props) {
  const [mainUrl, setMainUrl] = useState("");
  const [aboutUrl, setAboutUrl] = useState("");

  const sortedGalleries = useMemo(() => {
    return [...galleries].sort((a, b) => {
      const left = a.gallery_info?.name ?? a.normalized_main_url;
      const right = b.gallery_info?.name ?? b.normalized_main_url;
      return left.localeCompare(right);
    });
  }, [galleries]);

  const selectedGallery = useMemo(
    () => galleries.find(gallery => gallery.id === selectedGalleryId) ?? null,
    [galleries, selectedGalleryId]
  );

  async function handleSeed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedMain = mainUrl.trim();
    if (!trimmedMain) return;
    const trimmedAbout = aboutUrl.trim();
    await onSeed({ mainUrl: trimmedMain, aboutUrl: trimmedAbout ? trimmedAbout : null });
    setMainUrl("");
    setAboutUrl("");
  }

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">Galleries</h2>
          <p className="card-subtitle">Select an existing gallery or seed a new one. Scraping runs automatically for main and about pages.</p>
        </div>
        <span className="badge">{galleries.length} total</span>
      </div>

      <div className="grid-two">
        <div className="field">
          <label htmlFor="gallery-select">Active gallery</label>
          <select
            id="gallery-select"
            value={selectedGalleryId ?? ""}
            onChange={event => onSelect(event.target.value || "")}
          >
            <option value="">Choose a gallery…</option>
            {sortedGalleries.map(gallery => {
              const label = gallery.gallery_info?.name ?? gallery.normalized_main_url;
              return (
                <option key={gallery.id} value={gallery.id}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>

        {selectedGallery && (
          <div className="field">
            <label>Primary URL</label>
            <a href={selectedGallery.main_url} target="_blank" rel="noreferrer">
              {selectedGallery.normalized_main_url}
            </a>
          </div>
        )}
      </div>

      <form className="grid-two" onSubmit={handleSeed}>
        <div className="field">
          <label htmlFor="main-url">Main URL *</label>
          <input
            id="main-url"
            placeholder="https://example.com"
            value={mainUrl}
            onChange={event => setMainUrl(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="about-url">About URL</label>
          <input
            id="about-url"
            placeholder="https://example.com/about"
            value={aboutUrl}
            onChange={event => setAboutUrl(event.target.value)}
          />
        </div>
        <div className="field" style={{ alignSelf: "end" }}>
          <button type="submit" className="btn btn-primary" disabled={!mainUrl.trim() || seeding}>
            {seeding ? "Seeding…" : "Seed gallery"}
          </button>
        </div>
      </form>
    </section>
  );
}
