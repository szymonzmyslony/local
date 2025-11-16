import { useState, useCallback, useEffect } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "agents/ai-react";
import type { UIMessage } from "@ai-sdk/react";
import { SidebarLayout } from "./components/sidebar-layout";
import { Chat } from "./components/chat";
import { JsonDisplay } from "./components/messages/json-display";
import type { ZineChatState, SavedEventCard } from "./types/chat-state";

type MessageMeta = { createdAt: string; internal?: boolean };

const DEBUG_MODE_KEY = "zine-debug-mode";

export default function App() {
  const [agentState, setAgentState] = useState<ZineChatState | null>(null);
  const [debugMode, setDebugMode] = useState<boolean>(() => {
    // Initialize from localStorage
    const stored = localStorage.getItem(DEBUG_MODE_KEY);
    return stored === "true";
  });

  // Toggle debug mode and persist to localStorage
  const toggleDebugMode = useCallback(() => {
    setDebugMode((prev) => {
      const newValue = !prev;
      localStorage.setItem(DEBUG_MODE_KEY, String(newValue));
      return newValue;
    });
  }, []);



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
    async (event: SavedEventCard) => {
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
      {/* Debug Toggle Button */}
      <button
        onClick={toggleDebugMode}
        className="fixed bottom-4 right-4 z-50 px-3 py-2 text-xs font-medium rounded-lg shadow-lg transition-all hover:scale-105 bg-slate-800 text-slate-100 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600"
        title="Toggle debug mode (Ctrl/Cmd+D)"
      >
        Debug: {debugMode ? "ON" : "OFF"}
      </button>

      <SidebarLayout savedEvents={savedEvents}>
        <Chat
          title="Assistant"
          messages={messages}
          sendMessage={sendMessage}
          status={status}
          onSaveToZine={handleSaveToZine}
          debugMode={debugMode}
          agentState={agentState}
        />
      </SidebarLayout>
    </>
  );
}
