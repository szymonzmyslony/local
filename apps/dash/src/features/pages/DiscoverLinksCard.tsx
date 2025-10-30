import { useState } from "react";
import type { FormEvent } from "react";
import type { DashboardAction } from "../../api";
import { Button, Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@shared/ui";

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
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Discover links</CardTitle>
          <CardSubtitle>Add seed URLs to find new pages for this gallery.</CardSubtitle>
        </div>
      </CardHeader>
      <CardBody>
        <form className="flex flex-col gap-4" onSubmit={handleDiscover}>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700" htmlFor="discover-input">
            Seed URLs
            <textarea
              id="discover-input"
              className="min-h-[120px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              placeholder="Paste one or many URLs separated by spaces or new lines"
              value={discoverInput}
              onChange={event => setDiscoverInput(event.target.value)}
            />
          </label>

          <div className="flex flex-col items-start gap-3 md:flex-row md:items-end md:justify-between">
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700" htmlFor="discover-limit">
              Links to discover
              <input
                id="discover-limit"
                type="number"
                min={1}
                max={500}
                className="w-32 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                value={discoverLimit}
                onChange={event => setDiscoverLimit(event.target.value)}
              />
            </label>

            <Button type="submit" variant="secondary" disabled={disabled}>
              {pendingAction === "discover" ? "Discovering..." : "Discover links"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function parseUrlInput(value: string): string[] {
  return value
    .split(/\s|,/)
    .map(url => url.trim())
    .filter(url => url.length > 0);
}
