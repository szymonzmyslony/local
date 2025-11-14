import type { ToolUIPart } from "ai";
import { getToolName } from "ai";
import { ToolCallDisplay } from "./tool-call-display";
import { ToolResult } from "./tool-result";
import type { SavedEventCard } from "../../types/chat-state"; // was SavedEventCard from "../../types/tool-results";

interface ToolMessageProps {
  part: ToolUIPart;
  timestamp: string;
  onSaveToZine?: (event: SavedEventCard) => void;
  debugMode: boolean;
}

export function ToolMessage({ part, timestamp, onSaveToZine, debugMode }: ToolMessageProps) {
  const toolName = getToolName(part);

  return (
    <div className="space-y-1.5">
      <ToolCallDisplay part={part} toolName={toolName} />

      <ToolResult part={part} onSaveToZine={onSaveToZine} debugMode={debugMode} />

      <p className="text-[10px] text-slate-400">{timestamp}</p>
    </div>
  );
}
