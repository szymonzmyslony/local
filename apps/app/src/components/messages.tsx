import { useMemo } from "react";
import type { UIMessage } from "@ai-sdk/react";
import { ChatStatus, isToolUIPart } from "ai";
import { TextMessage } from "./messages/text-message";
import { ToolMessage } from "./messages/tool-message";
import { ThinkingMessage } from "./messages/thinking-message";
import type { EventMatchItem } from "../types/tool-results";

type MessageMeta = { createdAt: string; internal?: boolean };

interface MessagesProps {
  messages: UIMessage<MessageMeta>[];
  status: ChatStatus;
  onSaveToZine?: (event: EventMatchItem) => void;
  debugMode: boolean;
}

function formatTimestamp(value: string | Date | undefined): string {
  const date =
    value instanceof Date ? value : value ? new Date(value) : new Date();
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function Messages({ messages, status, onSaveToZine, debugMode }: MessagesProps) {
  const visibleMessages = useMemo(
    () => messages.filter((msg) => !msg.metadata?.internal),
    [messages]
  );

  const isLoading = status === "submitted" || status === "streaming";
  const lastMessage = visibleMessages[visibleMessages.length - 1];

  // Check if last message has any text content
  const hasTextContent = lastMessage?.parts?.some((part) => part.type === "text" && part.text.trim().length > 0);

  return (
    <div className="space-y-3">
      {visibleMessages.map((message, index) => {
        const isUser = message.role === "user";
        const timestamp = formatTimestamp(message.metadata?.createdAt);
        const isLastMessage = index === visibleMessages.length - 1;
        const isMessageLoading = isLastMessage && isLoading && message.role === "assistant";

        return (
          <div key={message.id} className="space-y-1.5">
            {message.parts?.map((part, partIndex) => {
              if (part.type === "text") {
                return (
                  <TextMessage
                    key={`${message.id}-text-${partIndex}`}
                    text={part.text}
                    timestamp={timestamp}
                    isUser={isUser}
                  />
                );
              }

              if (isToolUIPart(part)) {
                return (
                  <ToolMessage
                    key={`${message.id}-tool-${partIndex}`}
                    part={part}
                    timestamp={timestamp}
                    onSaveToZine={onSaveToZine}
                    debugMode={debugMode}
                  />
                );
              }

              return null;
            })}

            {/* Show thinking indicator while loading and no text content yet */}
            {isMessageLoading && !hasTextContent && (
              <ThinkingMessage />
            )}
          </div>
        );
      })}

      {/* Show thinking message when waiting for initial assistant response */}
      {isLoading && (!lastMessage || lastMessage.role === "user") && (
        <ThinkingMessage />
      )}
    </div>
  );
}
