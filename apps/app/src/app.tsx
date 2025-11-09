import { useState, useCallback } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "agents/ai-react";
import type { UIMessage } from "@ai-sdk/react";
import { SidebarLayout } from "./components/sidebar-layout";
import { Chat } from "./components/chat";
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
  >({ agent });

  const handleSaveToZine = useCallback(
    async (event: EventMatchItem) => {
      if (agent) {
        try {
          await agent.call("saveToZine", [event]);
        } catch (error) {
          console.error("Failed to save event:", error);
        }
      }
    },
    [agent]
  );

  const savedEvents = agentState?.savedCards ?? [];

  return (
    <SidebarLayout savedEvents={savedEvents}>
      <Chat
        title="Assistant"
        messages={messages}
        sendMessage={sendMessage}
        status={status}
        onSaveToZine={handleSaveToZine}
      />
    </SidebarLayout>
  );
}
