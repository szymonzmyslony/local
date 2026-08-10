import { useState } from "react";
import type { FormEvent } from "react";
import type { MarketCode } from "@shared";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@shared/ui";

type SeedGalleryPayload = {
  market: MarketCode;
  mainUrl: string;
  aboutUrl: string | null;
  eventsUrl: string | null;
};

type SeedGalleryFormProps = {
  onSubmit: (payload: SeedGalleryPayload) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
};

export function SeedGalleryForm({ onSubmit, onCancel, submitting }: SeedGalleryFormProps) {
  const [market, setMarket] = useState<MarketCode>("waw");
  const [mainUrl, setMainUrl] = useState("");
  const [aboutUrl, setAboutUrl] = useState("");
  const [eventsUrl, setEventsUrl] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedMain = mainUrl.trim();
    if (!trimmedMain) return;
    const trimmedAbout = aboutUrl.trim();
    const trimmedEvents = eventsUrl.trim();
    await onSubmit({
      market,
      mainUrl: trimmedMain,
      aboutUrl: trimmedAbout ? trimmedAbout : null,
      eventsUrl: trimmedEvents ? trimmedEvents : null
    });
    setMainUrl("");
    setAboutUrl("");
    setEventsUrl("");
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="seed-market">Market</Label>
        <Select value={market} onValueChange={value => setMarket(value as MarketCode)}>
          <SelectTrigger id="seed-market" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="waw">Warsaw</SelectItem>
            <SelectItem value="ldn">London</SelectItem>
          </SelectContent>
        </Select>
      </div>
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
      <div className="flex flex-col gap-2">
        <Label htmlFor="seed-events-url">Events URL</Label>
        <Input
          id="seed-events-url"
          placeholder="https://example.com/events"
          value={eventsUrl}
          onChange={event => setEventsUrl(event.target.value)}
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
