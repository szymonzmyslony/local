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
              <div className="max-w-[85%] space-y-2">
                {message.parts?.map((part, index) => {
                  if (part.type === "text") {
                    return (
                      <div
                        key={`${message.id}-text-${index}`}
                        className={`rounded-xl px-4 py-3 shadow-sm ${isUser ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-900"}`}
                      >
                        <Markdown>{part.text}</Markdown>
                        <p
                          className={`mt-2 text-xs ${isUser ? "text-blue-50/80" : "text-slate-500"}`}
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
                            className="space-y-2"
                          >
                            {renderToolResult(
                              output as ToolResultPayload,
                              handleSaveToMyZine
                            )}
                            <p className="text-xs text-slate-400">
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
                          className="space-y-2"
                        >
                          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            Error: {part.errorText}
                          </div>
                          <p className="text-xs text-slate-400">{timestamp}</p>
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
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <MessageSquare className="h-4 w-4" />
            <h2 className="text-xs font-semibold uppercase tracking-wide">
              Chat history
            </h2>
          </div>
          <button
            type="button"
            onClick={handleNewChat}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            title="New chat"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New</span>
          </button>
        </div>
        {conversationSummary || conversationHistory.length > 0 ? (
          <div className="space-y-2">
            {conversationSummary ? (
              <button
                type="button"
                onClick={handleConversationLink}
                className={`flex w-full flex-col gap-1 rounded-lg border px-3 py-3 text-left shadow-sm transition ${
                  mainView.mode === "chat"
                    ? "border-blue-200 bg-blue-50/80 dark:border-blue-500/50 dark:bg-blue-500/20"
                    : "border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/70 dark:hover:border-slate-600 dark:hover:bg-slate-800"
                }`}
              >
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-300">
                  Current conversation
                </span>
                <span className="line-clamp-2 text-sm text-slate-700 dark:text-slate-200">
                  {conversationSummary.title}
                </span>
                {conversationSummary.createdAt ? (
                  <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-400">
                    <Clock className="h-3 w-3" />
                    {formatTimestamp(conversationSummary.createdAt)}
                  </span>
                ) : null}
              </button>
            ) : null}
            {conversationHistory.length > 0 ? (
              <div className="space-y-2">
                {conversationHistory.map((item) => {
                  const isActive =
                    mainView.mode === "history" &&
                    mainView.conversationId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleHistorySelect(item.id)}
                      className={`flex w-full flex-col gap-1 rounded-lg border px-3 py-3 text-left shadow-sm transition ${
                        isActive
                          ? "border-blue-200 bg-blue-50/80 dark:border-blue-500/50 dark:bg-blue-500/20"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-700"
                      }`}
                    >
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {item.title}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-400">
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
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Finish a chat and clear it to save the conversation here.
          </p>
        )}
      </section>
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <Bookmark className="h-4 w-4" />
          <h2 className="text-xs font-semibold uppercase tracking-wide">
            Saved events
          </h2>
        </div>
        {savedEvents.length > 0 ? (
          <div className="space-y-3">
            {savedEvents.map((event) => {
              const isActive =
                mainView.mode === "event" &&
                mainView.event.eventId === event.eventId;
              return (
                <button
                  key={event.eventId}
                  type="button"
                  onClick={() => handleSavedEventSelect(event)}
                  className={`w-full rounded-lg border px-3 py-3 text-left shadow-sm transition ${
                    isActive
                      ? "border-blue-200 bg-blue-50/80 dark:border-blue-500/50 dark:bg-blue-500/20"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {event.eventName}
                      </p>
                      {event.eventData.gallery?.name ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {event.eventData.gallery.name}
                        </p>
                      ) : null}
                      {event.eventData.startAt ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Starts {formatTimestamp(event.eventData.startAt)}
                        </p>
                      ) : null}
                    </div>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      Saved {formatTimestamp(event.savedAt)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
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
          className={`hidden lg:flex flex-shrink-0 flex-col overflow-hidden border-r bg-white transition-[width] duration-200 ease-in-out dark:bg-slate-900 ${
            isSidebarOpen
              ? "w-[260px] sm:w-[280px] md:w-[300px] border-slate-200 dark:border-slate-800"
              : "w-14 border-slate-200 dark:border-slate-800"
          }`}
          aria-label="History and saved items"
        >
          <div className="flex h-full flex-1 flex-col">
            <div
              className={`flex items-center border-b border-slate-200 py-4 dark:border-slate-800 ${
                isSidebarOpen ? "px-4" : "px-2"
              }`}
            >
              <div
                className={`overflow-hidden transition-[max-width,opacity] duration-200 ease-in-out ${
                  isSidebarOpen ? "max-w-full opacity-100" : "max-w-0 opacity-0"
                }`}
              >
                <p className="whitespace-nowrap text-sm font-semibold text-slate-800 dark:text-slate-100">
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
                  <PanelLeftClose className="h-4 w-4" />
                ) : (
                  <PanelLeftOpen className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div
              className={`flex-1 overflow-y-auto px-4 py-6 transition-[opacity,visibility] duration-200 ${
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
          <div className="flex h-full w-full max-w-5xl flex-col px-4 py-10 lg:px-10">
            <section className="flex flex-1 flex-col gap-6 min-h-0">
              <div
                ref={chatCardScrollRef}
                className="flex flex-1 flex-col min-h-0"
              >
                <Card className="relative flex flex-1 min-h-0 flex-col overflow-hidden">
                  {mainView.mode === "chat" ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="absolute right-5 top-5 z-10"
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
                      className="absolute right-5 top-5 z-10"
                      onClick={handleConversationLink}
                    >
                      Back to chat
                    </Button>
                  )}
                  <CardHeader className="border-b border-slate-100 bg-white/60 pr-28 dark:border-slate-800 dark:bg-slate-900/60">
                    <div className="flex items-center gap-2">
                      {!isDesktop ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-slate-600 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white lg:hidden"
                          onClick={() => setIsMobileSidebarOpen(true)}
                          aria-label="Open history panel"
                        >
                          <PanelLeftOpen className="h-4 w-4" />
                        </Button>
                      ) : null}
                      <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                        {headerTitle}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <div className="flex-1 min-h-0 overflow-y-auto bg-white px-6 py-5 dark:bg-slate-900">
                    {mainView.mode === "chat" ? (
                      <div className="space-y-4">
                        {hasMessages ? (
                          conversation
                        ) : (
                          <div className="grid h-full place-items-center text-center">
                            <div className="max-w-md space-y-6">
                              <div className="space-y-2">
                                <p className="text-lg font-medium text-slate-900 dark:text-slate-100">
                                  What do you feel like doing?
                                </p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                  Tell the agent your mood, aesthetic, or how
                                  you’d like the day to unfold — and it will
                                  find art that fits.
                                </p>
                              </div>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {[
                                  "Quiet exhibitions in Praga this weekend",
                                  "Calm galleries to visit on Sunday",
                                  "Playful art around Mokotów tonight",
                                  "Experimental installations near Old Town"
                                ].map((suggestion) => (
                                  <Button
                                    key={suggestion}
                                    variant="outline"
                                    onClick={() =>
                                      handleSuggestionClick(suggestion)
                                    }
                                    className="h-auto justify-start px-4 py-3 text-left"
                                    disabled={
                                      status === "submitted" ||
                                      status === "streaming"
                                    }
                                  >
                                    <span className="text-sm">
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
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                              {isSaving ? "Saving…" : "Searching for events…"}
                            </div>
                          </div>
                        ) : null}
                        {status === "streaming" ? (
                          <div className="flex justify-start">
                            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
                              {isSaving ? "Saving…" : "Searching for events…"}
                            </div>
                          </div>
                        ) : null}
                        {status === "error" ? (
                          <div className="flex justify-start">
                            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-500/10 dark:text-red-200">
                              Something went wrong while contacting the
                              assistant. Please try again.
                            </div>
                          </div>
                        ) : null}
                        <div ref={messagesEndRef} />
                      </div>
                    ) : mainView.mode === "history" ? (
                      historySnapshot ? (
                        <div className="space-y-4">
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {historySnapshot.title}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Saved {formatTimestamp(historySnapshot.createdAt)}
                            </p>
                          </div>
                          <div className="space-y-4">
                            {historyConversation &&
                            historyConversation.length > 0 ? (
                              historyConversation
                            ) : (
                              <p className="text-sm text-slate-500 dark:text-slate-400">
                                This conversation has no messages.
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                          Conversation not found.
                        </div>
                      )
                    ) : selectedEvent ? (
                      <div className="space-y-5">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {selectedEvent.eventName}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Saved {formatTimestamp(selectedEvent.savedAt)}
                          </p>
                        </div>
                        {selectedEvent.eventData.description ? (
                          <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                            {selectedEvent.eventData.description}
                          </p>
                        ) : null}
                        <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
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
                                className="font-medium text-blue-600 hover:underline dark:text-blue-300"
                              >
                                Visit gallery site →
                              </a>
                            </p>
                          ) : null}
                        </div>
                        <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
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
                      <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                        Select a saved event to view its details.
                      </div>
                    )}
                  </div>
                  {mainView.mode === "chat" ? (
                    <div className="border-t border-slate-100 bg-slate-50/80 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/80">
                      <form
                        onSubmit={handleSubmit}
                        className="flex flex-col gap-3"
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
                        />
                        <div className="flex items-center justify-end gap-3">
                          {status === "streaming" ? (
                            <Button
                              variant="ghost"
                              onClick={stop}
                              type="button"
                            >
                              Stop
                            </Button>
                          ) : null}
                          <Button
                            type="submit"
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
                    <div className="border-t border-slate-100 bg-slate-50/80 px-6 py-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
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
