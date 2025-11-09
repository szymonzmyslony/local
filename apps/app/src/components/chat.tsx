import { useEffect, useRef, useState, useCallback } from "react";
import type { UIMessage } from "@ai-sdk/react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@shared/ui";
import { Messages } from "./messages";
import type { EventMatchItem } from "../types/tool-results";
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
  onSaveToZine: (event: EventMatchItem) => Promise<void>;
}

export function Chat({ title, messages, sendMessage, status, onSaveToZine }: ChatProps) {
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const hasMessages = messages.some((msg) => !msg.metadata?.internal);

  const handleInputChange = useCallback(() => {
    if (inputRef.current) {
      const text = inputRef.current.textContent || "";
      setInputValue(text);
    }
  }, []);

  const handleKeyDown = useCallback(
    async (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const content = inputValue.trim();
        if (content && status !== "submitted" && status !== "streaming") {
          setInputValue("");
          if (inputRef.current) {
            inputRef.current.textContent = "";
          }
          await sendMessage({
            role: "user",
            parts: [{ type: "text", text: content }],
            metadata: { createdAt: new Date().toISOString() },
          });
        }
      }
    },
    [inputValue, status, sendMessage]
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const content = inputValue.trim();
    if (!content || status === "submitted" || status === "streaming") {
      return;
    }
    setInputValue("");
    if (inputRef.current) {
      inputRef.current.textContent = "";
    }

    await sendMessage({
      role: "user",
      parts: [{ type: "text", text: content }],
      metadata: { createdAt: new Date().toISOString() },
    });
  }

  async function handleSuggestionClick(suggestion: string) {
    if (status === "submitted" || status === "streaming") return;
    await sendMessage({
      role: "user",
      parts: [{ type: "text", text: suggestion }],
      metadata: { createdAt: new Date().toISOString() },
    });
  }

  return (
    <div className="flex h-screen w-full flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-950">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h1>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto bg-slate-50 px-6 py-6 dark:bg-slate-900">
        {hasMessages ? (
          <>
            <Messages
              messages={messages}
              status={status}
              onSaveToZine={onSaveToZine}
            />
            {status === "error" && (
              <div className="flex justify-start mt-3">
                <div className="rounded-[16px] border border-red-200/50 bg-red-50/50 px-3 py-2 text-xs text-red-700 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-200">
                  Something went wrong while contacting the assistant.
                  Please try again.
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        ) : (
          <div className="grid h-full place-items-center text-center">
            <div className="max-w-md space-y-4">
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  What do you feel like doing?
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tell the agent your mood, aesthetic, or how you'd like
                  the day to unfold — and it will find art that fits.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  "Quiet exhibitions in Praga this weekend",
                  "Calm galleries to visit on Sunday",
                  "Playful art around Mokotów tonight",
                  "Experimental installations near Old Town",
                ].map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="h-auto justify-start border-slate-200/50 px-3 py-2 text-left text-xs dark:border-slate-700/50"
                    disabled={
                      status === "submitted" || status === "streaming"
                    }
                  >
                    <span className="text-xs">{suggestion}</span>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-950">
        <form ref={composerRef} onSubmit={handleSubmit}>
          <div className="flex items-center gap-2">
            <div
              ref={inputRef}
              contentEditable
              onInput={handleInputChange}
              onKeyDown={handleKeyDown}
              className="min-h-[40px] max-h-[120px] flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-600"
              role="textbox"
              aria-label="Message"
              data-placeholder="Message..."
            />
            <button
              type="submit"
              disabled={
                !inputValue.trim() ||
                status === "submitted" ||
                status === "streaming"
              }
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#D8D3FA] text-slate-900 transition hover:bg-[#C8C3EA] disabled:opacity-50 disabled:cursor-not-allowed dark:bg-[#D8D3FA] dark:text-slate-900 dark:hover:bg-[#C8C3EA]"
              aria-label="Send message"
            >
              {status === "submitted" || status === "streaming" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
