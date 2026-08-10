import { useEffect, useRef, useState, useCallback } from "react";
import type { ChatStatus, UIMessage } from "ai";
import { ArrowUp, Loader2 } from "lucide-react";
import { Messages } from "./messages";
import { JsonDisplay } from "./messages/json-display";
import type { SavedEventCard, ZineChatState } from "../types/chat-state";

type MessageMeta = { createdAt: string; internal?: boolean };

interface ChatProps {
  messages: UIMessage<MessageMeta>[];
  sendMessage: (message: {
    role: "user";
    parts: Array<{ type: "text"; text: string }>;
    metadata: MessageMeta;
  }) => Promise<void>;
  status: ChatStatus;
  onSaveToZine: (event: SavedEventCard) => Promise<void>;
  debugMode: boolean;
  agentState: ZineChatState | null;
}

export function Chat({
  messages,
  sendMessage,
  status,
  onSaveToZine,
  debugMode,
  agentState
}: ChatProps) {
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const desktopInputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll after the transcript changes, including streamed message updates.
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages is the transcript update signal.
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const hasMessages = messages.some((msg) => !msg.metadata?.internal);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInputValue(e.currentTarget.value);
    },
    []
  );

  const handleKeyDown = useCallback(
    async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const content = e.currentTarget.value.trim();
        if (content && status !== "submitted" && status !== "streaming") {
          setInputValue("");
          await sendMessage({
            role: "user",
            parts: [{ type: "text", text: content }],
            metadata: { createdAt: new Date().toISOString() }
          });
        }
      }
    },
    [status, sendMessage]
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Get content from the active input refs or fallback to state
    const desktopContent = desktopInputRef.current?.value.trim() || "";
    const bottomContent = inputRef.current?.value.trim() || "";
    const content = desktopContent || bottomContent || inputValue.trim();

    if (!content || status === "submitted" || status === "streaming") {
      return;
    }

    setInputValue("");
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
    <div className="flex h-screen w-full flex-col bg-white">
      <header className="flex min-h-16 items-center justify-between border-b border-[#0140B6]/20 px-5 md:px-8">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-bold tracking-[-0.02em] text-[#0140B6] md:hidden">
            ZINE LOCAL
          </span>
          <span className="hidden text-[10px] uppercase tracking-[0.2em] text-[#0140B6] md:inline">
            London / art / now
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-[#0140B6]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#0140B6]" />
          Live guide
        </div>
      </header>

      {/* Debug State Display - Sticky at top */}
      {debugMode && (
        <div className="sticky top-0 z-40 border-b border-[#0140B6]/20 bg-[#F1F5FF] px-6 pt-4 pb-2">
          <div className="mx-auto w-full md:max-w-2xl xxl:max-w-3xl">
            <JsonDisplay
              data={{
                savedCardsCount: agentState?.savedCards?.length || 0
              }}
              title="Agent State"
              defaultExpanded={false}
            />
          </div>
        </div>
      )}

      {/* Messages area */}
      <div
        className={`zine-scrollbar flex-1 bg-white ${hasMessages ? "overflow-y-auto px-5 py-6 md:px-8" : "flex items-center justify-center px-5 py-8 md:px-8"}`}
      >
        <div
          className={`mx-auto w-full max-w-4xl ${hasMessages ? "" : "flex h-full items-center justify-center"}`}
        >
          {hasMessages ? (
            <>
              <Messages
                messages={messages}
                status={status}
                onSaveToZine={onSaveToZine}
                debugMode={debugMode}
              />
              {status === "error" && (
                <div className="flex justify-start mt-3">
                  <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                    Something went wrong while contacting the assistant. Please
                    try again.
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          ) : (
            <div className="w-full space-y-7">
              <div className="max-w-3xl space-y-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#0140B6]">
                  Mood + location + time
                </p>
                <h1 className="max-w-2xl text-4xl font-bold leading-[1.02] tracking-[-0.045em] text-[#0140B6] sm:text-5xl md:text-6xl">
                  What feels alive today?
                </h1>
                <p className="max-w-xl text-sm leading-relaxed text-[#0140B6]">
                  Tell Zine how you want the day to feel, where you want to wander and when you are free.
                </p>
              </div>
              <div className="prompt-cards grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  "Something calm in Peckham tonight",
                  "Photography in Soho this weekend",
                  "Experimental art in the East End",
                  "A gallery open Sunday afternoon"
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => handleSuggestionClick(suggestion)}
                    disabled={status === "submitted" || status === "streaming"}
                    className="h-auto min-h-20 w-full rounded-lg border border-[#0140B6]/35 bg-white px-4 py-3 text-left text-xs leading-relaxed text-[#0140B6] transition-all hover:border-[#0140B6] hover:bg-[#F1F5FF] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              {/* Input form - shown on desktop when no messages */}
              <div className="mt-2 hidden md:block">
                <form onSubmit={handleSubmit}>
                  <div className="relative flex items-end">
                    <textarea
                      ref={desktopInputRef}
                      value={inputValue}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      rows={1}
                      className="min-h-[58px] max-h-[140px] flex-1 resize-none overflow-y-auto rounded-lg border-2 border-[#0140B6] bg-white px-4 py-[18px] pr-16 text-start text-sm leading-normal text-[#161A23] outline-none placeholder:text-[#0140B6]/45 focus:ring-2 focus:ring-[#0140B6]/15"
                      aria-label="Message"
                      placeholder="Add your mood, time and place, I will take care of the rest..."
                    />
                    <button
                      type="submit"
                      disabled={
                        !inputValue.trim() ||
                        status === "submitted" ||
                        status === "streaming"
                      }
                      className="absolute right-2 bottom-2 flex h-[42px] w-[42px] items-center justify-center rounded-md bg-[#161A23] text-white transition hover:bg-[#0140B6] disabled:cursor-not-allowed disabled:opacity-35"
                      aria-label="Send message"
                    >
                      {status === "submitted" || status === "streaming" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowUp className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input area - always shown on mobile, hidden on desktop when no messages */}
      <div
        className={`border-t border-[#0140B6]/20 bg-white px-5 py-4 md:px-8 ${!hasMessages ? "md:hidden" : ""}`}
      >
        <div className="mx-auto w-full max-w-4xl">
          <form ref={composerRef} onSubmit={handleSubmit}>
            <div className="relative flex items-end">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                rows={1}
                className="min-h-[52px] max-h-[140px] flex-1 resize-none overflow-y-auto rounded-lg border-2 border-[#0140B6] bg-white px-4 py-4 pr-16 text-start text-sm leading-normal text-[#161A23] outline-none placeholder:text-[#0140B6]/45 focus:ring-2 focus:ring-[#0140B6]/15"
                aria-label="Message"
                placeholder="Add your mood, time and place, I will take care of the rest..."
              />
              <button
                type="submit"
                disabled={
                  !inputValue.trim() ||
                  status === "submitted" ||
                  status === "streaming"
                }
                className="absolute right-2 bottom-2 flex h-9 w-9 items-center justify-center rounded-md bg-[#161A23] text-white transition hover:bg-[#0140B6] disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="Send message"
              >
                {status === "submitted" || status === "streaming" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
