import { Loader2 } from "lucide-react";

export function ThinkingMessage({ city }: { city: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#0140B6]/30 bg-[#F1F5FF]">
        <Loader2 className="h-4 w-4 animate-spin text-[#0140B6]" />
      </div>
      <div className="flex flex-col gap-1 pt-1">
        <div className="text-sm text-[#0140B6]">
          Looking around {city}…
        </div>
      </div>
    </div>
  );
}
