import { useState } from "react";
import type { FormEvent } from "react";
import type { DashboardAction } from "../../api";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
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
  const [open, setOpen] = useState(false);

  const disabled = pendingAction === "discover" || discoverInput.trim().length === 0;

  function handleDiscover(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const urls = parseUrlInput(discoverInput);
    if (urls.length === 0) return;
    const limit = Number.parseInt(discoverLimit, 10);
    console.log("[DiscoverLinksCard] submit discover", { urls, limit });
    onDiscover({ listUrls: urls, limit: Number.isNaN(limit) ? undefined : limit });
    setDiscoverInput("");
  }

  return (
    <Collapsible open={open} onOpenChange={value => setOpen(value)}>
      <div className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-900">Add seed URLs</p>
            <p className="text-xs text-slate-500">Discover new pages for this gallery.</p>
          </div>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="secondary">
              {open ? "Hide form" : "Add links"}
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent className="mt-4">
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
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function parseUrlInput(value: string): string[] {
  return value
    .split(/\s|,/)
    .map(url => url.trim())
    .filter(url => url.length > 0);
}
