import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Card, CardBody, CardHeader, CardTitle } from "@shared/ui";

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
    <Card className="max-w-lg">
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Seed gallery</CardTitle>
        <Button type="button" variant="muted" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardBody>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700" htmlFor="seed-main-url">
            Main URL <span className="text-red-500">*</span>
            <input
              id="seed-main-url"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              placeholder="https://example.com"
              value={mainUrl}
              onChange={event => setMainUrl(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700" htmlFor="seed-about-url">
            About URL
            <input
              id="seed-about-url"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              placeholder="https://example.com/about"
              value={aboutUrl}
              onChange={event => setAboutUrl(event.target.value)}
            />
          </label>
          <div className="flex justify-end">
            <Button type="submit" disabled={submitting || mainUrl.trim().length === 0}>
              {submitting ? "Seeding..." : "Seed gallery"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
