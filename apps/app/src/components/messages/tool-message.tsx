import type { DynamicToolUIPart, ToolUIPart } from "ai";
import { getToolName } from "ai";
import { ToolCallDisplay } from "./tool-call-display";
import { ToolResult } from "./tool-result";
import type { SavedEventCard } from "../../types/chat-state"; // was SavedEventCard from "../../types/tool-results";

interface ToolMessageProps {
  part: ToolUIPart | DynamicToolUIPart;
  timestamp: string;
  onSaveToZine?: (event: SavedEventCard) => void;
  debugMode: boolean;
}

export function ToolMessage({ part, timestamp, onSaveToZine, debugMode }: ToolMessageProps) {
  const toolName = getToolName(part);

  return (
    <div className="space-y-1.5">
      <ToolCallDisplay part={part} toolName={toolName} debugMode={debugMode} />

      <ToolResult part={part} onSaveToZine={onSaveToZine} debugMode={debugMode} />

      <p className="font-mono text-[9px] text-[#0140B6]/45">{timestamp}</p>
    </div>
  );
}
