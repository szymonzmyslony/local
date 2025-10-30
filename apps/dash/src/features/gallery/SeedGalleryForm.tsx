import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Input, Label } from "@shared/ui";

type SeedGalleryPayload = {
  mainUrl: string;
  aboutUrl: string | null;
};

type SeedGalleryFormProps = {
  onSubmit: (payload: SeedGalleryPayload) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
};

export function SeedGalleryForm({ onSubmit, onCancel, submitting }: SeedGalleryFormProps) {
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
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="seed-main-url">
          Main URL <span className="text-destructive">*</span>
        </Label>
        <Input
          id="seed-main-url"
          placeholder="https://example.com"
          value={mainUrl}
          onChange={event => setMainUrl(event.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="seed-about-url">About URL</Label>
        <Input
          id="seed-about-url"
          placeholder="https://example.com/about"
          value={aboutUrl}
          onChange={event => setAboutUrl(event.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="muted" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting || mainUrl.trim().length === 0}>
          {submitting ? "Seeding..." : "Seed gallery"}
        </Button>
      </div>
    </form>
  );
}
