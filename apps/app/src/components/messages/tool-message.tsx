import type { DynamicToolUIPart, ToolUIPart } from "ai";
import { getToolName } from "ai";
import { ToolCallDisplay } from "./tool-call-display";
import { ToolResult } from "./tool-result";
import type { SavedEventCard } from "../../types/chat-state"; // was SavedEventCard from "../../types/tool-results";
import type { MarketConfig } from "@shared";

interface ToolMessageProps {
  part: ToolUIPart | DynamicToolUIPart;
  timestamp: string;
  onSaveToZine?: (event: SavedEventCard) => void;
  debugMode: boolean;
  market: MarketConfig;
}

export function ToolMessage({
  part,
  timestamp,
  onSaveToZine,
  debugMode,
  market
}: ToolMessageProps) {
  const toolName = getToolName(part);

  return (
    <div className="space-y-1.5">
      <ToolCallDisplay
        part={part}
        toolName={toolName}
        debugMode={debugMode}
        market={market}
      />

      <ToolResult part={part} onSaveToZine={onSaveToZine} debugMode={debugMode} />

      <p className="font-mono text-[9px] text-[#0140B6]/45">{timestamp}</p>
    </div>
  );
}
