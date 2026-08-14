import type { MarketConfig } from "@shared";
import { type ChatStatus, isToolUIPart, type UIMessage } from "ai";
import { useMemo } from "react";
import type { SavedEventCard } from "../types/chat-state";
import { TextMessage } from "./messages/text-message";
import { ThinkingMessage } from "./messages/thinking-message";
import { ToolMessage } from "./messages/tool-message";

type MessageMeta = { createdAt: string; internal?: boolean };

interface MessagesProps {
  messages: UIMessage<MessageMeta>[];
  status: ChatStatus;
  onSaveToZine?: (event: SavedEventCard) => void;
  debugMode: boolean;
  market: MarketConfig;
}

function formatTimestamp(value: string | Date | undefined): string {
  const date =
    value instanceof Date ? value : value ? new Date(value) : new Date();
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function hasRenderedEventCards(message: UIMessage<MessageMeta>): boolean {
  return Boolean(
    message.parts?.some((part) => {
      if (!isToolUIPart(part) || part.state !== "output-available") return false;
      const output = part.output;
      return Boolean(
        output &&
          typeof output === "object" &&
          "type" in output &&
          output.type === "event-results" &&
          "events" in output &&
          Array.isArray(output.events) &&
          output.events.length > 0
      );
    })
  );
}

export function shouldHideRepeatedAssistantText(
  messages: UIMessage<MessageMeta>[],
  index: number
): boolean {
  const message = messages[index];
  if (!message || message.role === "user") return false;
  if (hasRenderedEventCards(message)) return true;
  const previous = messages[index - 1];
  return Boolean(
    previous &&
      previous.role === "assistant" &&
      hasRenderedEventCards(previous)
  );
}

export function Messages({
  messages,
  status,
  onSaveToZine,
  debugMode,
  market
}: MessagesProps) {
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
        const hideRepeatedAssistantText = shouldHideRepeatedAssistantText(
          visibleMessages,
          index
        );
        const timestamp = formatTimestamp(message.metadata?.createdAt);
        const isLastMessage = index === visibleMessages.length - 1;
        const isMessageLoading = isLastMessage && isLoading && message.role === "assistant";

        return (
          <div key={message.id} className="space-y-1.5">
            {message.parts?.map((part, partIndex) => {
              if (part.type === "text") {
                if (hideRepeatedAssistantText) return null;
                return (
                  <TextMessage
                    // biome-ignore lint/suspicious/noArrayIndexKey: AI message part positions are stable while streamed text changes.
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
                    key={`${message.id}-tool-${part.toolCallId}`}
                    part={part}
                    timestamp={timestamp}
                    onSaveToZine={onSaveToZine}
                    debugMode={debugMode}
                    market={market}
                  />
                );
              }

              return null;
            })}

            {/* Show thinking indicator while loading and no text content yet */}
            {isMessageLoading && !hasTextContent && (
              <ThinkingMessage city={market.city} />
            )}
          </div>
        );
      })}

      {/* Show thinking message when waiting for initial assistant response */}
      {isLoading && (!lastMessage || lastMessage.role === "user") && (
        <ThinkingMessage city={market.city} />
      )}
    </div>
  );
}
