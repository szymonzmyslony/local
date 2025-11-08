import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "agents/ai-react";
import type { UIMessage } from "@ai-sdk/react";
import { isToolUIPart } from "ai";
import {
  Bookmark,
  Clock,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus
} from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  Markdown,
  Textarea
} from "@shared/ui";
import { renderToolResult } from "./tool-results";
import { LeftDrawer } from "./components/left-drawer";
import type { ChatState, SavedEventCard } from "./types/chat-state";
import { detectLanguage } from "./utils";
import type { ToolResultPayload, EventToolResult } from "./types/tool-results";

type MessageMeta = { createdAt: string; internal?: boolean };

type ConversationSnapshot = {
  id: string;
  title: string;
  createdAt: string;
  messages: UIMessage<MessageMeta>[];
};

type MainView =
  | { mode: "chat" }
  | { mode: "history"; conversationId: string }
  | { mode: "event"; event: SavedEventCard };

function createSnapshotId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `conv-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
}

function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  if (!start) {
    return "Date to be announced";
  }
  try {
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : null;
    const formattedStart = startDate.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    });
    if (!endDate) {
      return formattedStart;
    }
    const formattedEnd = endDate.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    });
    return `${formattedStart} → ${formattedEnd}`;
  } catch {
    return start;
  }
}

function formatTimestamp(value: string | Date | undefined): string {
  const date =
    value instanceof Date ? value : value ? new Date(value) : new Date();
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Chat() {
  const [agentState, setAgentState] = useState<ChatState | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<
    ConversationSnapshot[]
  >([]);
  const [mainView, setMainView] = useState<MainView>({ mode: "chat" });

  const agent = useAgent<ChatState>({
    agent: "chat",
    onStateUpdate: setAgentState
  });
  const { messages, sendMessage, status, stop, clearHistory } = useAgentChat<
    ChatState,
    UIMessage<MessageMeta>
  >({ agent });

  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatCardScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (typeof window === "undefined") {
      setIsDesktop(true);
      return;
    }
    const updateViewport = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktop(desktop);
      if (desktop) {
        setIsMobileSidebarOpen(false);
        setIsSidebarOpen(true);
      }
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  const hasMessages = messages.some((msg) => !msg.metadata?.internal);
  const savedEvents = agentState?.savedCards ?? [];

  async function handleSaveToMyZine(
    eventId: string,
    eventData: EventToolResult["items"][number]
  ) {
    if (status === "submitted" || status === "streaming") return;

    setIsSaving(true);

    // Send a message to the agent that will trigger the save_to_my_zine tool
    // Send complete event data in the format the tool expects
    const saveMessage = `Please save this event to MY ZINE. Event details: ${JSON.stringify(
      {
        eventId: eventId,
        eventData: {
          id: eventData.id,
          title: eventData.title,
          status: eventData.status,
          startAt: eventData.startAt,
          endAt: eventData.endAt,
          description: eventData.description,
          occurrences: eventData.occurrences.map((occ) => ({
            id: occ.id,
            start_at: occ.start_at,
            end_at: occ.end_at,
            timezone: occ.timezone
          })),
          gallery: eventData.gallery
            ? {
                id: eventData.gallery.id,
                name: eventData.gallery.name,
                mainUrl: eventData.gallery.mainUrl,
                normalizedMainUrl: eventData.gallery.normalizedMainUrl
              }
            : null,
          similarity: eventData.similarity
        }
      }
    )}`;

    await sendMessage({
      role: "user",
      parts: [{ type: "text", text: saveMessage }],
      metadata: { createdAt: new Date().toISOString(), internal: true }
    });
  }

  const renderMessages = useCallback(
    (sourceMessages: UIMessage<MessageMeta>[]) =>
      sourceMessages
        .filter((message) => !message.metadata?.internal)
        .map((message) => {
          const isUser = message.role === "user";
          const timestamp = formatTimestamp(message.metadata?.createdAt);

          return (
            <div
              key={message.id}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div className="max-w-[98%] space-y-1.5">
                {message.parts?.map((part, index) => {
                  if (part.type === "text") {
                    const textLength = part.text?.length ?? 0;
                    const isShortMessage = textLength <= 16;
                    const borderRadius = isShortMessage
                      ? "rounded-full"
                      : "rounded-[16px]";

                    return (
                      <div
                        key={`${message.id}-text-${index}`}
                        className={`${borderRadius} px-3 py-2 ${isUser ? "bg-[#D8D3FA] text-slate-900" : "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"}`}
                      >
                        <Markdown className="text-xs">{part.text}</Markdown>
                        <p
                          className={`mt-1 text-[10px] ${isUser ? "text-slate-600" : "text-slate-400 dark:text-slate-400"}`}
                        >
                          {timestamp}
                        </p>
                      </div>
                    );
                  }

                  if (isToolUIPart(part)) {
                    if (
                      part.state === "output-available" &&
                      !part.errorText &&
                      part.output
                    ) {
                      const output = part.output;
                      if (
                        typeof output === "object" &&
                        output !== null &&
                        "type" in output &&
                        output.type === "event-results"
                      ) {
                        return (
                          <div
                            key={`${message.id}-tool-${index}`}
                            className="space-y-1.5"
                          >
                            {renderToolResult(
                              output as ToolResultPayload,
                              handleSaveToMyZine
                            )}
                            <p className="text-[10px] text-slate-400">
                              {timestamp}
                            </p>
                          </div>
                        );
                      }
                    }

                    if (part.errorText) {
                      return (
                        <div
                          key={`${message.id}-tool-${index}`}
                          className="space-y-1.5"
                        >
                          <div className="rounded-[16px] border border-red-200/50 bg-red-50/50 px-3 py-2 text-xs text-red-700 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-200">
                            Error: {part.errorText}
                          </div>
                          <p className="text-[10px] text-slate-400">
                            {timestamp}
                          </p>
                        </div>
                      );
                    }

                    return null;
                  }
                  return null;
                })}
              </div>
            </div>
          );
        }),
    [handleSaveToMyZine]
  );

  const conversation = useMemo(
    () => renderMessages(messages),
    [messages, renderMessages]
  );

  const conversationSummary = useMemo(() => {
    const visibleMessages = messages.filter((msg) => !msg.metadata?.internal);
    if (visibleMessages.length === 0) {
      return null;
    }

    const firstUserMessage = visibleMessages.find((msg) => msg.role === "user");
    const textPart = firstUserMessage?.parts?.find(
      (
        part
      ): part is {
        type: "text";
        text: string;
      } =>
        part.type === "text" &&
        typeof (part as { text?: unknown }).text === "string"
    );

    const snippet = textPart?.text?.trim();
    const lastMessage = visibleMessages[visibleMessages.length - 1];

    return {
      id: firstUserMessage?.id ?? lastMessage.id,
      title: snippet && snippet.length > 0 ? snippet : "Conversation",
      createdAt:
        lastMessage.metadata?.createdAt ?? firstUserMessage?.metadata?.createdAt
    };
  }, [messages]);

  const handleConversationLink = useCallback(() => {
    setMainView({ mode: "chat" });
    if (chatCardScrollRef.current) {
      chatCardScrollRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
    if (!isDesktop) {
      setIsMobileSidebarOpen(false);
    }
  }, [isDesktop]);

  const handleHistorySelect = useCallback(
    (conversationId: string) => {
      setMainView({ mode: "history", conversationId });
      if (!isDesktop) {
        setIsMobileSidebarOpen(false);
      }
    },
    [isDesktop]
  );

  const handleSavedEventSelect = useCallback(
    (event: SavedEventCard) => {
      setMainView({ mode: "event", event });
      if (!isDesktop) {
        setIsMobileSidebarOpen(false);
      }
    },
    [isDesktop]
  );

  const handleClearConversation = useCallback(async () => {
    const visibleMessages = messages.filter(
      (message) => !message.metadata?.internal
    );

    if (visibleMessages.length > 0) {
      const firstUserMessage = visibleMessages.find(
        (msg) => msg.role === "user"
      );
      const textPart = firstUserMessage?.parts?.find(
        (
          part
        ): part is {
          type: "text";
          text: string;
        } =>
          part.type === "text" &&
          typeof (part as { text?: unknown }).text === "string"
      );

      const title =
        textPart?.text?.trim() && textPart.text.trim().length > 0
          ? textPart.text.trim()
          : "Conversation";
      const createdAt =
        visibleMessages[0].metadata?.createdAt ?? new Date().toISOString();

      const snapshotMessages = visibleMessages.map((message) => ({
        ...message,
        parts: message.parts ? message.parts.map((part) => ({ ...part })) : [],
        metadata: message.metadata ? { ...message.metadata } : undefined
      }));

      const snapshot: ConversationSnapshot = {
        id: createSnapshotId(),
        title,
        createdAt,
        messages: snapshotMessages
      };

      setConversationHistory((previous) => [snapshot, ...previous]);
    }

    setMainView({ mode: "chat" });
    await clearHistory();
  }, [messages, clearHistory]);

  const handleNewChat = useCallback(async () => {
    const visibleMessages = messages.filter(
      (message) => !message.metadata?.internal
    );

    // Save current conversation if it has messages
    if (visibleMessages.length > 0) {
      const firstUserMessage = visibleMessages.find(
        (msg) => msg.role === "user"
      );
      const textPart = firstUserMessage?.parts?.find(
        (
          part
        ): part is {
          type: "text";
          text: string;
        } =>
          part.type === "text" &&
          typeof (part as { text?: unknown }).text === "string"
      );

      const title =
        textPart?.text?.trim() && textPart.text.trim().length > 0
          ? textPart.text.trim()
          : "Conversation";
      const createdAt =
        visibleMessages[0].metadata?.createdAt ?? new Date().toISOString();

      const snapshotMessages = visibleMessages.map((message) => ({
        ...message,
        parts: message.parts ? message.parts.map((part) => ({ ...part })) : [],
        metadata: message.metadata ? { ...message.metadata } : undefined
      }));

      const snapshot: ConversationSnapshot = {
        id: createSnapshotId(),
        title,
        createdAt,
        messages: snapshotMessages
      };

      setConversationHistory((previous) => [snapshot, ...previous]);
    }

    setMainView({ mode: "chat" });
    await clearHistory();
    if (!isDesktop) {
      setIsMobileSidebarOpen(false);
    }
  }, [messages, clearHistory, isDesktop]);

  const historySnapshot = useMemo(() => {
    if (mainView.mode !== "history") {
      return null;
    }
    return (
      conversationHistory.find((item) => item.id === mainView.conversationId) ??
      null
    );
  }, [mainView, conversationHistory]);

  const historyConversation = useMemo(
    () => (historySnapshot ? renderMessages(historySnapshot.messages) : null),
    [historySnapshot, renderMessages]
  );

  const selectedEvent = mainView.mode === "event" ? mainView.event : null;

  const headerTitle =
    mainView.mode === "chat"
      ? "Assistant"
      : mainView.mode === "history"
        ? "Conversation history"
        : (selectedEvent?.eventName ?? "Saved event");

  const drawerContent = (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <MessageSquare className="h-3 w-3" />
            <h2 className="text-[10px] font-semibold uppercase tracking-wide">
              Chat history
            </h2>
          </div>
          <button
            type="button"
            onClick={handleNewChat}
            className="flex items-center gap-1 rounded-md border border-slate-200/50 px-2 py-1 text-[10px] font-medium text-slate-600 transition hover:bg-slate-100/50 hover:text-slate-900 dark:border-slate-700/50 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-100"
            title="New chat"
          >
            <Plus className="h-3 w-3" />
            <span>New</span>
          </button>
        </div>
        {conversationSummary || conversationHistory.length > 0 ? (
          <div className="space-y-1.5">
            {conversationSummary ? (
              <button
                type="button"
                onClick={handleConversationLink}
                className={`flex w-full flex-col gap-1 rounded-xl border px-2.5 py-2 text-left transition ${
                  mainView.mode === "chat"
                    ? "border-[#D8D3FA]/50 bg-[#D8D3FA]/20 dark:border-[#D8D3FA]/30 dark:bg-[#D8D3FA]/10"
                    : "border-slate-200/50 bg-slate-50/50 hover:border-slate-200 hover:bg-slate-100/50 dark:border-slate-700/50 dark:bg-slate-800/50 dark:hover:border-slate-600/50 dark:hover:bg-slate-800"
                }`}
              >
                <span className="text-[10px] font-semibold text-[#D8D3FA] dark:text-[#D8D3FA]">
                  Current conversation
                </span>
                <span className="line-clamp-2 text-xs text-slate-700 dark:text-slate-200">
                  {conversationSummary.title}
                </span>
                {conversationSummary.createdAt ? (
                  <span className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-400">
                    <Clock className="h-3 w-3" />
                    {formatTimestamp(conversationSummary.createdAt)}
                  </span>
                ) : null}
              </button>
            ) : null}
            {conversationHistory.length > 0 ? (
              <div className="space-y-1.5">
                {conversationHistory.map((item) => {
                  const isActive =
                    mainView.mode === "history" &&
                    mainView.conversationId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleHistorySelect(item.id)}
                      className={`flex w-full flex-col gap-1 rounded-xl border px-2.5 py-2 text-left transition ${
                        isActive
                          ? "border-[#D8D3FA]/50 bg-[#D8D3FA]/20 dark:border-[#D8D3FA]/30 dark:bg-[#D8D3FA]/10"
                          : "border-slate-200/50 bg-white hover:border-slate-200 hover:bg-slate-50/50 dark:border-slate-700/50 dark:bg-slate-800 dark:hover:border-slate-600/50 dark:hover:bg-slate-700"
                      }`}
                    >
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {item.title}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-400">
                        <Clock className="h-3 w-3" />
                        {formatTimestamp(item.createdAt)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Finish a chat and clear it to save the conversation here.
          </p>
        )}
      </section>
      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
          <Bookmark className="h-3 w-3" />
          <h2 className="text-[10px] font-semibold uppercase tracking-wide">
            Saved events
          </h2>
        </div>
        {savedEvents.length > 0 ? (
          <div className="space-y-1.5">
            {savedEvents.map((event) => {
              const isActive =
                mainView.mode === "event" &&
                mainView.event.eventId === event.eventId;
              return (
                <button
                  key={event.eventId}
                  type="button"
                  onClick={() => handleSavedEventSelect(event)}
                  className={`w-full rounded-xl border px-2.5 py-2 text-left transition ${
                    isActive
                      ? "border-[#D8D3FA]/50 bg-[#D8D3FA]/20 dark:border-[#D8D3FA]/30 dark:bg-[#D8D3FA]/10"
                      : "border-slate-200/50 bg-white hover:border-slate-200 hover:bg-slate-50/50 dark:border-slate-700/50 dark:bg-slate-800 dark:hover:border-slate-600/50 dark:hover:bg-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {event.eventName}
                      </p>
                      {event.eventData.gallery?.name ? (
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          {event.eventData.gallery.name}
                        </p>
                      ) : null}
                      {event.eventData.startAt ? (
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          Starts {formatTimestamp(event.eventData.startAt)}
                        </p>
                      ) : null}
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      Saved {formatTimestamp(event.savedAt)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Events you save will live here.
          </p>
        )}
      </section>
    </div>
  );
  // Detect and update user language when needed
  const updateLanguageIfNeeded = useCallback(
    (text: string) => {
      if (agentState?.userLanguage || !agent || !agentState) return;
      const detectedLang = detectLanguage(text);
      if (detectedLang) {
        agent.setState({
          ...agentState,
          userLanguage: detectedLang
        });
      }
    },
    [agent, agentState]
  );

  // Detect language from messages
  useEffect(() => {
    const firstUserMessage = messages.find((msg) => msg.role === "user");
    if (firstUserMessage) {
      const textPart = firstUserMessage.parts?.find(
        (part): part is { type: "text"; text: string } => part.type === "text"
      );
      if (textPart?.text) {
        updateLanguageIfNeeded(textPart.text);
      }
    }
  }, [messages, updateLanguageIfNeeded]);

  // Reset saving state when status changes
  useEffect(() => {
    if (status !== "submitted" && status !== "streaming") {
      setIsSaving(false);
    }
  }, [status]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const content = inputValue.trim();
    if (!content || status === "submitted" || status === "streaming") {
      return;
    }
    setInputValue("");

    updateLanguageIfNeeded(content);

    await sendMessage({
      role: "user",
      parts: [{ type: "text", text: content }],
      metadata: { createdAt: new Date().toISOString() }
    });
  }

  async function handleSuggestionClick(suggestion: string) {
    if (status === "submitted" || status === "streaming") return;
    await sendMessage({
      role: "user",
      parts: [{ type: "text", text: suggestion }],
      metadata: { createdAt: new Date().toISOString() }
    });
  }

  return (
    <>
      <div className="flex h-screen w-full overflow-hidden bg-slate-50 dark:bg-slate-950">
        <aside
          className={`hidden lg:flex flex-shrink-0 flex-col overflow-hidden border-r bg-slate-50 transition-[width] duration-200 ease-in-out dark:bg-slate-900 ${
            isSidebarOpen
              ? "w-[300px] border-slate-200/50 dark:border-slate-800/50"
              : "w-14 border-slate-200/50 dark:border-slate-800/50"
          }`}
          aria-label="History and saved items"
        >
          <div className="flex h-full flex-1 flex-col">
            <div
              className={`flex items-center border-b border-slate-200/50 py-3 dark:border-slate-800/50 ${
                isSidebarOpen ? "px-3" : "px-2"
              }`}
            >
              <div
                className={`overflow-hidden transition-[max-width,opacity] duration-200 ease-in-out ${
                  isSidebarOpen ? "max-w-full opacity-100" : "max-w-0 opacity-0"
                }`}
              >
                <p className="whitespace-nowrap text-xs font-semibold text-slate-800 dark:text-slate-100">
                  History &amp; saved items
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="hidden h-8 w-8 items-center justify-center p-0 text-slate-600 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white lg:inline-flex"
                onClick={() => setIsSidebarOpen((prev) => !prev)}
                aria-label={
                  isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"
                }
              >
                {isSidebarOpen ? (
                  <PanelLeftClose className="h-3 w-3" />
                ) : (
                  <PanelLeftOpen className="h-3 w-3" />
                )}
              </Button>
            </div>
            <div
              className={`flex-1 overflow-y-auto px-3 py-4 transition-[opacity,visibility] duration-200 ${
                isSidebarOpen
                  ? "opacity-100 visibility-visible"
                  : "pointer-events-none opacity-0 visibility-hidden"
              }`}
            >
              {drawerContent}
            </div>
          </div>
        </aside>

        <main className="flex flex-1 justify-center overflow-hidden">
          <div className="flex h-full w-full max-w-5xl flex-col px-3 py-6 lg:px-6">
            <section className="flex flex-1 flex-col gap-4 min-h-0">
              <div
                ref={chatCardScrollRef}
                className="flex flex-1 flex-col min-h-0"
              >
                <Card className="relative flex flex-1 min-h-0 flex-col overflow-hidden border-slate-200/50 dark:border-slate-800/50">
                  {mainView.mode === "chat" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="absolute right-3 top-3 z-10 h-7 border-slate-200/50 px-2 text-xs dark:border-slate-700/50"
                      onClick={() => {
                        void handleClearConversation();
                      }}
                      disabled={!hasMessages}
                    >
                      Clear conversation
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="absolute right-3 top-3 z-10 h-7 border-slate-200/50 px-2 text-xs dark:border-slate-700/50"
                      onClick={handleConversationLink}
                    >
                      Back to chat
                    </Button>
                  )}
                  <CardHeader className="border-b border-slate-200/50 bg-slate-50/60 pr-20 dark:border-slate-800/50 dark:bg-slate-900/60">
                    <div className="flex items-center gap-1.5">
                      {!isDesktop ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-slate-600 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white lg:hidden"
                          onClick={() => setIsMobileSidebarOpen(true)}
                          aria-label="Open history panel"
                        >
                          <PanelLeftOpen className="h-3 w-3" />
                        </Button>
                      ) : null}
                      <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {headerTitle}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <div className="flex-1 min-h-0 overflow-y-auto bg-white px-4 py-4 dark:bg-slate-900">
                    {mainView.mode === "chat" ? (
                      <div className="space-y-3">
                        {hasMessages ? (
                          conversation
                        ) : (
                          <div className="grid h-full place-items-center text-center">
                            <div className="max-w-md space-y-4">
                              <div className="space-y-1.5">
                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  What do you feel like doing?
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  Tell the agent your mood, aesthetic, or how
                                  you'd like the day to unfold — and it will
                                  find art that fits.
                                </p>
                              </div>
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {[
                                  "Quiet exhibitions in Praga this weekend",
                                  "Calm galleries to visit on Sunday",
                                  "Playful art around Mokotów tonight",
                                  "Experimental installations near Old Town"
                                ].map((suggestion) => (
                                  <Button
                                    key={suggestion}
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleSuggestionClick(suggestion)
                                    }
                                    className="h-auto justify-start border-slate-200/50 px-3 py-2 text-left text-xs dark:border-slate-700/50"
                                    disabled={
                                      status === "submitted" ||
                                      status === "streaming"
                                    }
                                  >
                                    <span className="text-xs">
                                      {suggestion}
                                    </span>
                                  </Button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                        {status === "submitted" ? (
                          <div className="flex justify-start">
                            <div className="rounded-[16px] border border-slate-200/50 bg-slate-50/50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-200">
                              {isSaving ? "Saving…" : "Searching for events…"}
                            </div>
                          </div>
                        ) : null}
                        {status === "streaming" ? (
                          <div className="flex justify-start">
                            <div className="rounded-[16px] border border-[#D8D3FA]/50 bg-[#D8D3FA]/20 px-3 py-2 text-xs text-slate-700 dark:border-[#D8D3FA]/30 dark:bg-[#D8D3FA]/10 dark:text-slate-200">
                              {isSaving ? "Saving…" : "Searching for events…"}
                            </div>
                          </div>
                        ) : null}
                        {status === "error" ? (
                          <div className="flex justify-start">
                            <div className="rounded-[16px] border border-red-200/50 bg-red-50/50 px-3 py-2 text-xs text-red-700 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-200">
                              Something went wrong while contacting the
                              assistant. Please try again.
                            </div>
                          </div>
                        ) : null}
                        <div ref={messagesEndRef} />
                      </div>
                    ) : mainView.mode === "history" ? (
                      historySnapshot ? (
                        <div className="space-y-3">
                          <div className="rounded-xl border border-slate-200/50 bg-slate-50/50 px-3 py-2 dark:border-slate-700/50 dark:bg-slate-800/50">
                            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                              {historySnapshot.title}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                              Saved {formatTimestamp(historySnapshot.createdAt)}
                            </p>
                          </div>
                          <div className="space-y-3">
                            {historyConversation &&
                            historyConversation.length > 0 ? (
                              historyConversation
                            ) : (
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                This conversation has no messages.
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-500 dark:text-slate-400">
                          Conversation not found.
                        </div>
                      )
                    ) : selectedEvent ? (
                      <div className="space-y-4">
                        <div className="space-y-0.5">
                          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {selectedEvent.eventName}
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">
                            Saved {formatTimestamp(selectedEvent.savedAt)}
                          </p>
                        </div>
                        {selectedEvent.eventData.description ? (
                          <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                            {selectedEvent.eventData.description}
                          </p>
                        ) : null}
                        <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                          <p>
                            <span className="font-semibold text-slate-800 dark:text-slate-100">
                              When:
                            </span>{" "}
                            {formatDateRange(
                              selectedEvent.eventData.startAt,
                              selectedEvent.eventData.endAt
                            )}
                          </p>
                          {selectedEvent.eventData.gallery?.name ? (
                            <p>
                              <span className="font-semibold text-slate-800 dark:text-slate-100">
                                Gallery:
                              </span>{" "}
                              {selectedEvent.eventData.gallery.name}
                            </p>
                          ) : null}
                          {selectedEvent.eventData.gallery?.mainUrl ? (
                            <p>
                              <a
                                href={selectedEvent.eventData.gallery.mainUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-[#D8D3FA] hover:underline dark:text-[#D8D3FA]"
                              >
                                Visit gallery site →
                              </a>
                            </p>
                          ) : null}
                        </div>
                        <div className="space-y-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                          {selectedEvent.preferences.district ? (
                            <p>
                              Saved district:{" "}
                              {selectedEvent.preferences.district}
                            </p>
                          ) : null}
                          {selectedEvent.preferences.mood ? (
                            <p>Saved mood: {selectedEvent.preferences.mood}</p>
                          ) : null}
                          {selectedEvent.preferences.aesthetics.length > 0 ? (
                            <p>
                              Aesthetics:{" "}
                              {selectedEvent.preferences.aesthetics.join(", ")}
                            </p>
                          ) : null}
                          {selectedEvent.preferences.artists.length > 0 ? (
                            <p>
                              Artists:{" "}
                              {selectedEvent.preferences.artists.join(", ")}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-slate-500 dark:text-slate-400">
                        Select a saved event to view its details.
                      </div>
                    )}
                  </div>
                  {mainView.mode === "chat" ? (
                    <div className="border-t border-slate-200/50 bg-slate-50/80 px-4 py-3 dark:border-slate-800/50 dark:bg-slate-900/80">
                      <form
                        onSubmit={handleSubmit}
                        className="flex flex-col gap-2"
                      >
                        <Textarea
                          value={inputValue}
                          onChange={(event) =>
                            setInputValue(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              if (
                                inputValue.trim() &&
                                status !== "submitted" &&
                                status !== "streaming"
                              ) {
                                handleSubmit(
                                  event as unknown as React.FormEvent<HTMLFormElement>
                                );
                              }
                            }
                          }}
                          placeholder="What do you feel like finding today?"
                          rows={3}
                          disabled={
                            status === "submitted" || status === "streaming"
                          }
                          className="text-xs border-slate-200/50 dark:border-slate-700/50"
                        />
                        <div className="flex items-center justify-end gap-2">
                          {status === "streaming" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={stop}
                              type="button"
                              className="h-7 px-2 text-xs"
                            >
                              Stop
                            </Button>
                          ) : null}
                          <Button
                            type="submit"
                            size="sm"
                            className="h-7 px-3 text-xs bg-[#D8D3FA] text-slate-900 hover:bg-[#D8D3FA]/80 dark:bg-[#D8D3FA] dark:text-slate-900 dark:hover:bg-[#D8D3FA]/80"
                            disabled={
                              !inputValue.trim() ||
                              status === "submitted" ||
                              status === "streaming"
                            }
                          >
                            Send
                          </Button>
                        </div>
                      </form>
                    </div>
                  ) : (
                    <div className="border-t border-slate-200/50 bg-slate-50/80 px-4 py-3 text-xs text-slate-500 dark:border-slate-800/50 dark:bg-slate-900/80 dark:text-slate-400">
                      {mainView.mode === "history"
                        ? "Viewing a saved conversation. Return to chat to continue messaging."
                        : "Viewing a saved event. Return to chat when you're ready to talk again."}
                    </div>
                  )}
                </Card>
              </div>
            </section>
          </div>
        </main>
      </div>
      {!isDesktop ? (
        <LeftDrawer
          open={isMobileSidebarOpen}
          onClose={() => setIsMobileSidebarOpen(false)}
          title="History & saved items"
          className="max-w-full"
        >
          {drawerContent}
        </LeftDrawer>
      ) : null}
    </>
  );
}
