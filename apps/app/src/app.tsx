import { useState, useCallback } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "agents/ai-react";
import type { UIMessage } from "@ai-sdk/react";
import { SidebarLayout } from "./components/sidebar-layout";
import { Chat } from "./components/chat";
import { JsonDisplay } from "./components/messages/json-display";
import type { ZineChatState } from "./types/chat-state";
import type { EventMatchItem } from "./types/tool-results";

type MessageMeta = { createdAt: string; internal?: boolean };

export default function App() {
  const [agentState, setAgentState] = useState<ZineChatState | null>(null);

  const agent = useAgent<ZineChatState>({
    agent: "zine",
    onStateUpdate: setAgentState,
  });

  const { messages, sendMessage, status } = useAgentChat<
    ZineChatState,
    UIMessage<MessageMeta>
  >({
    agent,
    experimental_automaticToolResolution: true
  });

  const handleSaveToZine = useCallback(
    async (event: EventMatchItem) => {
      if (!agentState) return;

      const savedCards = agentState.savedCards ?? [];
      const existingIndex = savedCards.findIndex((card) => card.event_id === event.event_id);

      const newSavedCards = existingIndex >= 0
        ? savedCards.map((card, i) => i === existingIndex ? event : card)
        : [...savedCards, event];

      agent.setState({
        ...agentState,
        savedCards: newSavedCards
      });
    },
    [agent, agentState]
  );

  const savedEvents = agentState?.savedCards ?? [];

  return (
    <>
      {/* Debug State Display */}
      <div className="fixed top-0 left-0 right-0 z-50 p-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto">
          <JsonDisplay
            data={{
              userRequirements: agentState?.userRequirements,
              lastSearchResults: agentState?.lastSearchResults,
              savedCardsCount: savedEvents.length
            }}
            title="Agent State (Debug)"
            defaultExpanded={false}
          />
        </div>
      </div>
      <div className="pt-20">
        <SidebarLayout savedEvents={savedEvents}>
          <Chat
            title="Assistant"
            messages={messages}
            sendMessage={sendMessage}
            status={status}
            onSaveToZine={handleSaveToZine}
          />
        </SidebarLayout>
      </div>
    </>
  );
}
