import type { ToolUIPart } from "ai";
import { getToolName } from "ai";
import { ToolCallDisplay } from "./tool-call-display";
import { ToolResult } from "./tool-result";
import type { EventMatchItem } from "../../types/tool-results";

interface ToolMessageProps {
  part: ToolUIPart;
  timestamp: string;
  onSaveToZine?: (event: EventMatchItem) => void;
}

export function ToolMessage({ part, timestamp, onSaveToZine }: ToolMessageProps) {
  const toolName = getToolName(part);

  return (
    <div className="space-y-1.5">
      <ToolCallDisplay part={part} toolName={toolName} />

      <ToolResult part={part} onSaveToZine={onSaveToZine} />

      <p className="text-[10px] text-slate-400">{timestamp}</p>
    </div>
  );
}
