import { describe, expect, it } from "vitest";
import {
  hasRenderedEventCards,
  shouldHideRepeatedAssistantText
} from "../src/components/messages";

type Message = Parameters<typeof hasRenderedEventCards>[0];

function eventResultMessage(events: unknown[]): Message {
  return {
    id: "assistant-message",
    role: "assistant",
    metadata: { createdAt: "2026-08-14T16:00:00.000Z" },
    parts: [
      {
        type: "tool-search_events",
        toolCallId: "tool-call",
        state: "output-available",
        input: {},
        output: { type: "event-results", events }
      }
    ]
  };
}

describe("event result prose", () => {
  it("hides repeated assistant prose after successful event cards", () => {
    expect(hasRenderedEventCards(eventResultMessage([{ event_id: "event-1" }]))).toBe(
      true
    );
  });

  it("keeps the assistant explanation when an event search is empty", () => {
    expect(hasRenderedEventCards(eventResultMessage([]))).toBe(false);
  });

  it("hides a separate assistant summary immediately after event cards", () => {
    const toolMessage = eventResultMessage([{ event_id: "event-1" }]);
    const summaryMessage: Message = {
      id: "assistant-summary",
      role: "assistant",
      metadata: { createdAt: "2026-08-14T16:00:01.000Z" },
      parts: [{ type: "text", text: "A repeated list of every card." }]
    };

    expect(
      shouldHideRepeatedAssistantText([toolMessage, summaryMessage], 1)
    ).toBe(true);
  });
});
