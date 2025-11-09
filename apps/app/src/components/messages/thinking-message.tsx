import { Loader2 } from "lucide-react";

export function ThinkingMessage() {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
        <Loader2 className="h-4 w-4 animate-spin text-slate-600 dark:text-slate-400" />
      </div>
      <div className="flex flex-col gap-1 pt-1">
        <div className="text-sm text-slate-600 dark:text-slate-400">
          Thinking...
        </div>
      </div>
    </div>
  );
}
