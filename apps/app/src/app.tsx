import { useState, useCallback, useEffect } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/think/react";
import type { UIMessage } from "ai";
import { SidebarLayout } from "./components/sidebar-layout";
import { Chat } from "./components/chat";
import type { ZineChatState, SavedEventCard } from "./types/chat-state";
import { getMarketConfig, type MarketCode } from "@shared";
import { resolveMarket } from "./market";

type MessageMeta = { createdAt: string; internal?: boolean };

const DEBUG_MODE_KEY = "zine-debug-mode";
const WEB_AGENT_ID_KEY = "zine-web-agent-id-v5";

export function getOrCreateWebAgentId(market: MarketCode): string {
  const storageKey = `${WEB_AGENT_ID_KEY}-${market}`;
  const existing = localStorage.getItem(storageKey);
  if (existing?.startsWith(`${market}-web-`)) return existing;

  const id = `${market}-web-${crypto.randomUUID()}`;
  localStorage.setItem(storageKey, id);
  return id;
}

export default function App() {
  const [market] = useState(() => resolveMarket(window.location));
  const marketConfig = getMarketConfig(market);
  const [agentState, setAgentState] = useState<ZineChatState | null>(null);
  const [webAgentId] = useState(() => getOrCreateWebAgentId(market));
  useEffect(() => {
    document.title = `Zine Local — ${marketConfig.city} art guide`;
  }, [marketConfig.city]);
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
    name: webAgentId,
    onStateUpdate: setAgentState
  });

  const { messages, sendMessage, status } = useAgentChat<
    ZineChatState,
    UIMessage<MessageMeta>
  >({
    agent
  });

  const handleSaveToZine = useCallback(
    async (event: SavedEventCard) => {
      if (agentState?.kind !== "ready") return;

      const savedCards = agentState.savedCards;
      const existingIndex = savedCards.findIndex(
        (card) => card.event_id === event.event_id
      );

      const newSavedCards =
        existingIndex >= 0
          ? savedCards.map((card, i) => (i === existingIndex ? event : card))
          : [...savedCards, event];

      agent.setState({
        ...agentState,
        savedCards: newSavedCards
      });
    },
    [agent, agentState]
  );

  const savedEvents = agentState?.kind === "ready" ? agentState.savedCards : [];

  return (
    <>
      {/* Debug Toggle Button */}
      <button
        type="button"
        onClick={toggleDebugMode}
        className="fixed bottom-3 right-3 z-50 hidden rounded-md border border-[#0140B6]/35 bg-white px-2 py-1 text-[9px] uppercase tracking-[0.14em] text-[#0140B6] opacity-60 transition hover:opacity-100 md:block"
        title="Toggle debug mode (Ctrl/Cmd+D)"
      >
        Dev {debugMode ? "on" : "off"}
      </button>

      <SidebarLayout savedEvents={savedEvents} market={market}>
        <Chat
          messages={messages}
          sendMessage={sendMessage}
          status={status}
          onSaveToZine={handleSaveToZine}
          debugMode={debugMode}
          agentState={agentState}
          market={marketConfig}
        />
      </SidebarLayout>
    </>
  );
}
