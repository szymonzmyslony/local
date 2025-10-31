import { useEffect, useMemo, useRef, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "agents/ai-react";
import type { UIMessage } from "@ai-sdk/react";
import { isToolUIPart } from "ai";
import { Button, Card, CardHeader, CardTitle, Textarea } from "@shared/ui";
import { MemoizedMarkdown } from "./components/memoized-markdown";
import { renderToolResult } from "./components/tool-results";

type MessageMeta = { createdAt: string };

function formatTimestamp(value: string | Date | undefined): string {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Chat() {
  const agent = useAgent({ agent: "chat" });
  const {
    messages,
    sendMessage,
    status,
    stop,
    clearHistory
  } = useAgentChat<unknown, UIMessage<MessageMeta>>({ agent });

  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const hasMessages = messages.length > 0;

  const conversation = useMemo(
    () =>
      messages.map((message) => {
        const isUser = message.role === "user";
        const timestamp = formatTimestamp(message.metadata?.createdAt);

        return (
          <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[85%] space-y-2">
              {message.parts?.map((part, index) => {
                if (part.type === "text") {
                  return (
                    <div key={`${message.id}-text-${index}`} className={`rounded-xl px-4 py-3 shadow-sm ${isUser ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-900"}`}>
                      <MemoizedMarkdown id={`${message.id}-${index}`} content={part.text} />
                      <p className={`mt-2 text-xs ${isUser ? "text-blue-50/80" : "text-slate-500"}`}>{timestamp}</p>
                    </div>
                  );
                }

                if (isToolUIPart(part) && part.state === "output-available") {
                  const rendered = renderToolResult(part.output);
                  if (!rendered) {
                    return null;
                  }
                  return (
                    <div key={`${message.id}-tool-${index}`} className="space-y-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                      {rendered}
                      <p className="text-xs text-slate-400">{timestamp}</p>
                    </div>
                  );
                }

                return null;
              })}
            </div>
          </div>
        );
      }),
    [messages]
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const content = inputValue.trim();
    if (!content) {
      return;
    }
    setInputValue("");
    await sendMessage({
      role: "user",
      parts: [{ type: "text", text: content }]
    });
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Gallery &amp; Event Discovery</h1>
            <p className="text-sm text-slate-500">Ask anything to explore galleries and events powered by embeddings.</p>
          </div>
          <Button variant="outline" onClick={() => clearHistory()} disabled={!hasMessages}>
            Clear conversation
          </Button>
        </header>

        <Card className="flex h-[70vh] flex-col">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-lg font-semibold text-slate-800">Assistant</CardTitle>
          </CardHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {hasMessages ? (
              conversation
            ) : (
              <div className="grid h-full place-items-center text-center text-slate-500">
                <div className="space-y-2">
                  <p className="text-sm">Ask for gallery recommendations or upcoming events to get started.</p>
                  <p className="text-xs">Example: “Which galleries focus on contemporary photography?”</p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="border-t border-slate-100 px-6 py-4">
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <Textarea
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                placeholder="Ask about galleries or events…"
                rows={3}
              />
              <div className="flex items-center justify-end gap-3">
                {status === "streaming" ? (
                  <Button variant="ghost" onClick={stop} type="button">
                    Stop
                  </Button>
                ) : null}
                <Button type="submit" disabled={!inputValue.trim()}>
                  Send
                </Button>
              </div>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
}
