import { useState } from "react";

interface JsonDisplayProps {
  data: unknown;
  title?: string;
  defaultExpanded?: boolean;
}

export function JsonDisplay({ data, title, defaultExpanded = false }: JsonDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
      >
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
          {title || "Result"}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {isExpanded ? "▼" : "▶"}
        </span>
      </button>
      {isExpanded && (
        <div className="px-3 pb-2 border-t border-slate-200 dark:border-slate-700">
          <pre className="text-xs text-slate-600 dark:text-slate-400 overflow-x-auto mt-2">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
