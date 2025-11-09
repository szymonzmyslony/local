import { useState } from "react";
import { Loader2, ChevronDown, ChevronRight, Search, Settings, CheckCircle2, XCircle } from "lucide-react";
import type { ToolUIPart } from "ai";

interface ToolCallDisplayProps {
  part: ToolUIPart;
  toolName: string;
}

const TOOL_LABELS: Record<string, { label: string; loadingLabel: string; icon: typeof Search }> = {
  match_event: {
    label: "Searched events",
    loadingLabel: "Searching for events...",
    icon: Search
  },
  match_gallery: {
    label: "Searched galleries",
    loadingLabel: "Searching for galleries...",
    icon: Search
  },
  update_user_requirements: {
    label: "Updated preferences",
    loadingLabel: "Updating preferences...",
    icon: Settings
  }
};

export function ToolCallDisplay({ part, toolName }: ToolCallDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Tool states: "input-available" (executing) | "output-available" (done) | "output-error" (failed)
  const isLoading = part.state === "input-available";
  const hasError = part.state === "output-error";
  const hasOutput = part.state === "output-available";
  const hasInput = !!part.input;

  const toolConfig = TOOL_LABELS[toolName] || {
    label: toolName,
    loadingLabel: `${toolName}...`,
    icon: Settings
  };
  const Icon = toolConfig.icon;

  return (
    <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          {isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          )}
          {!isLoading && hasOutput && (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          )}
          {!isLoading && hasError && (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {isLoading ? toolConfig.loadingLabel : toolConfig.label}
          </span>
        </div>

        {hasError && (
          <div className="mt-2 text-xs text-red-600 dark:text-red-400">
            {part.errorText}
          </div>
        )}

        {hasInput && (
          <>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-2 flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <span>{isExpanded ? "Hide" : "Show"} arguments</span>
            </button>

            {isExpanded && (
              <div className="mt-2 rounded-lg border border-slate-200/50 bg-white/50 px-2 py-1.5 dark:border-slate-600/50 dark:bg-slate-900/50">
                <pre className="text-[10px] text-slate-600 dark:text-slate-400 whitespace-pre-wrap break-words">
                  {JSON.stringify(part.input as Record<string, unknown>, null, 2)}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
