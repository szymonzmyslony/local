import { useState } from "react";
import type { FormEvent } from "react";
import type { DashboardAction } from "../../api";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardSubtitle,
  CardTitle,
  Input,
  Label,
  Textarea
} from "@shared/ui";

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
          <div className="flex flex-col gap-2">
            <Label htmlFor="discover-input">Seed URLs</Label>
            <Textarea
              id="discover-input"
              className="min-h-[120px]"
              placeholder="Paste one or many URLs separated by spaces or new lines"
              value={discoverInput}
              onChange={event => setDiscoverInput(event.target.value)}
            />
          </div>

          <div className="flex flex-col items-start gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-2">
              <Label htmlFor="discover-limit">Links to discover</Label>
              <Input
                id="discover-limit"
                type="number"
                min={1}
                max={500}
                className="w-32"
                value={discoverLimit}
                onChange={event => setDiscoverLimit(event.target.value)}
              />
            </div>

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
