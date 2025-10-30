import { useState } from "react";
import type { FormEvent } from "react";
import type { DashboardAction } from "../../api";
import { Button } from "../../components/ui/button";

type DiscoverLinksCardProps = {
  pendingAction: DashboardAction | null;
  onDiscover: (payload: { listUrls: string[]; limit?: number }) => void;
};

export function DiscoverLinksCard({ pendingAction, onDiscover }: DiscoverLinksCardProps) {
  const [discoverInput, setDiscoverInput] = useState("");
  const [discoverLimit, setDiscoverLimit] = useState("50");

  const disabled = pendingAction === "discover" || discoverInput.trim().length === 0;

  function handleDiscover(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const urls = parseUrlInput(discoverInput);
    if (urls.length === 0) return;
    const limit = Number.parseInt(discoverLimit, 10);
    onDiscover({ listUrls: urls, limit: Number.isNaN(limit) ? undefined : limit });
    setDiscoverInput("");
  }

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <h2 className="card-title">Discover links</h2>
          <p className="card-subtitle">Add seed URLs to find new pages for this gallery.</p>
        </div>
      </header>
      <form className="discover-form" onSubmit={handleDiscover}>
        <div className="field">
          <label htmlFor="discover-input">Seed URLs</label>
          <textarea
            id="discover-input"
            placeholder="Paste one or many URLs separated by spaces or new lines"
            rows={2}
            value={discoverInput}
            onChange={event => setDiscoverInput(event.target.value)}
          />
        </div>
        <div className="discover-form__controls">
          <div className="field">
            <label htmlFor="discover-limit">Links to discover</label>
            <input
              id="discover-limit"
              type="number"
              min={1}
              max={500}
              value={discoverLimit}
              onChange={event => setDiscoverLimit(event.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={disabled}>
            {pendingAction === "discover" ? "Discovering…" : "Discover links"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function parseUrlInput(value: string): string[] {
  return value
    .split(/\s|,/)
    .map(url => url.trim())
    .filter(url => url.length > 0);
}
