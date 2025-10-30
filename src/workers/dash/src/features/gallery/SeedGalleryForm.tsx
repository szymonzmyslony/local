import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "../../components/ui/button";

type SeedGalleryPayload = {
  mainUrl: string;
  aboutUrl: string | null;
};

type SeedGalleryFormProps = {
  onSubmit: (payload: SeedGalleryPayload) => Promise<void>;
  onClose: () => void;
  submitting: boolean;
};

export function SeedGalleryForm({ onSubmit, onClose, submitting }: SeedGalleryFormProps) {
  const [mainUrl, setMainUrl] = useState("");
  const [aboutUrl, setAboutUrl] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedMain = mainUrl.trim();
    if (!trimmedMain) return;
    const trimmedAbout = aboutUrl.trim();
    await onSubmit({ mainUrl: trimmedMain, aboutUrl: trimmedAbout ? trimmedAbout : null });
    setMainUrl("");
    setAboutUrl("");
    onClose();
  }

  return (
    <div className="seed-card">
      <div className="seed-card__header">
        <h2>Seed gallery</h2>
        <Button type="button" variant="muted" onClick={onClose}>
          Close
        </Button>
      </div>
      <form className="seed-card__form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="seed-main-url">Main URL *</label>
          <input
            id="seed-main-url"
            placeholder="https://example.com"
            value={mainUrl}
            onChange={event => setMainUrl(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="seed-about-url">About URL</label>
          <input
            id="seed-about-url"
            placeholder="https://example.com/about"
            value={aboutUrl}
            onChange={event => setAboutUrl(event.target.value)}
          />
        </div>
        <div className="seed-card__actions">
          <Button type="submit" disabled={submitting || mainUrl.trim().length === 0}>
            {submitting ? "Seeding…" : "Seed gallery"}
          </Button>
        </div>
      </form>
    </div>
  );
}
