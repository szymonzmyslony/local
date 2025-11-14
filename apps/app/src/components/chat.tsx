import { useEffect, useRef, useState, useCallback } from "react";
import type { UIMessage } from "@ai-sdk/react";
import { ArrowUp, Loader2 } from "lucide-react";
import { Messages } from "./messages";
import { JsonDisplay } from "./messages/json-display";
import type { SavedEventCard, ZineChatState } from "../types/chat-state";
import { ChatStatus } from "ai";

type MessageMeta = { createdAt: string; internal?: boolean };

interface ChatProps {
  title: string;
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
  title,
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
  const inputRef = useRef<HTMLDivElement>(null);
  const desktopInputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const hasMessages = messages.some((msg) => !msg.metadata?.internal);

  const handleInputChange = useCallback(
    (e: React.FormEvent<HTMLDivElement>) => {
      const text = e.currentTarget.textContent || "";
      setInputValue(text);
    },
    []
  );

  const handleKeyDown = useCallback(
    async (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const content = e.currentTarget.textContent?.trim() || "";
        if (content && status !== "submitted" && status !== "streaming") {
          setInputValue("");
          e.currentTarget.textContent = "";
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
    const desktopContent = desktopInputRef.current?.textContent?.trim() || "";
    const bottomContent = inputRef.current?.textContent?.trim() || "";
    const content = desktopContent || bottomContent || inputValue.trim();

    if (!content || status === "submitted" || status === "streaming") {
      return;
    }

    setInputValue("");
    // Clear both inputs
    if (inputRef.current) {
      inputRef.current.textContent = "";
    }
    if (desktopInputRef.current) {
      desktopInputRef.current.textContent = "";
    }

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
    <div className="flex h-screen w-full flex-col">
      {/* Debug State Display - Sticky at top */}
      {debugMode && (
        <div className="sticky top-0 z-40 px-6 pt-4 pb-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
          <div className="mx-auto w-full md:max-w-2xl xxl:max-w-3xl">
            <JsonDisplay
              data={{
                galleryRequirements: agentState?.userRequirements.gallery,
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
        className={`flex-1 bg-slate-50 dark:bg-slate-900 ${hasMessages ? "overflow-y-auto px-6 py-6" : "flex items-center justify-center px-6 py-6"}`}
      >
        <div
          className={`mx-auto w-full md:max-w-2xl xxl:max-w-3xl ${hasMessages ? "" : "h-full flex items-center justify-center"}`}
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
                  <div className="rounded-[16px] border border-red-200/50 bg-red-50/50 px-3 py-2 text-xs text-red-700 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-200">
                    Something went wrong while contacting the assistant. Please
                    try again.
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          ) : (
            <div className="w-full space-y-4 text-center">
              <div className="space-y-1.5">
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  What do you feel like doing?
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Describe your mood, aesthetic, or how you'd like the day to
                  unfold and Zine will find art that fits.
                </p>
              </div>
              <div className="prompt-cards grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4 w-full">
                {[
                  "Quiet exhibitions in Praga this weekend",
                  "Calm galleries to visit on Sunday",
                  "Playful art around Mokotów tonight",
                  "Experimental installations near Old Town"
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => handleSuggestionClick(suggestion)}
                    disabled={status === "submitted" || status === "streaming"}
                    className="h-auto w-full rounded-xl border border-slate-300/60 bg-slate-50/80 px-4 py-2.5 text-left text-xs font-normal text-slate-700 transition-all hover:border-slate-400/60 hover:bg-slate-100/90 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-600/50 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:border-slate-500/60 dark:hover:bg-slate-700/60"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              {/* Input form - shown on desktop when no messages */}
              <div className="hidden md:block mt-8">
                <form onSubmit={handleSubmit}>
                  <div className="relative flex items-center">
                    <div
                      ref={desktopInputRef}
                      contentEditable
                      onInput={handleInputChange}
                      onKeyDown={handleKeyDown}
                      className="min-h-[40px] max-h-[120px] text-start flex-1 overflow-y-auto rounded-[28px] border border-slate-200 bg-white px-4 pr-14 py-3 text-xs leading-normal text-slate-900 outline-none focus:border-slate-300 empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-600 dark:empty:before:text-slate-500"
                      role="textbox"
                      aria-label="Message"
                      data-placeholder="Add your mood, time and place, I will take care of the rest..."
                      suppressContentEditableWarning
                    />
                    <button
                      type="submit"
                      disabled={
                        !inputValue.trim() ||
                        status === "submitted" ||
                        status === "streaming"
                      }
                      className="absolute right-2 flex h-8 w-8 items-center justify-center rounded-full bg-[#D8D3FA] text-slate-900 transition hover:bg-[#C8C3EA] disabled:opacity-50 disabled:cursor-not-allowed dark:bg-[#D8D3FA] dark:text-slate-900 dark:hover:bg-[#C8C3EA]"
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
        className={`border-slate-200 bg-transparent px-6 py-4 dark:border-slate-800 dark:bg-slate-950 ${!hasMessages ? "md:hidden" : ""}`}
      >
        <div className="mx-auto w-full md:max-w-2xl xxl:max-w-3xl">
          <form ref={composerRef} onSubmit={handleSubmit}>
            <div className="relative flex items-center">
              <div
                ref={inputRef}
                contentEditable
                onInput={handleInputChange}
                onKeyDown={handleKeyDown}
                className="min-h-[40px] max-h-[120px] text-start flex-1 overflow-y-auto rounded-[28px] border border-slate-200 bg-white px-4 pr-14 py-3 text-xs leading-normal text-slate-900 outline-none focus:border-slate-300 empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-600 dark:empty:before:text-slate-500"
                role="textbox"
                aria-label="Message"
                data-placeholder="Add your mood, time and place, I will take care of the rest..."
                suppressContentEditableWarning
              />
              <button
                type="submit"
                disabled={
                  !inputValue.trim() ||
                  status === "submitted" ||
                  status === "streaming"
                }
                className="absolute right-2 flex h-8 w-8 items-center justify-center rounded-full bg-[#D8D3FA] text-slate-900 transition hover:bg-[#C8C3EA] disabled:opacity-50 disabled:cursor-not-allowed dark:bg-[#D8D3FA] dark:text-slate-900 dark:hover:bg-[#C8C3EA]"
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
