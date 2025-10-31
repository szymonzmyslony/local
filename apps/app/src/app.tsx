import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "agents/ai-react";
import type { UIMessage } from "@ai-sdk/react";
import { isToolUIPart } from "ai";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Markdown, Textarea } from "@shared/ui";
import { renderToolResult } from "./tool-results";
import type { EventToolResult, GalleryToolResult, ToolResultPayload } from "./types/tool-results";

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
                      <Markdown>{part.text}</Markdown>
                      <p className={`mt-2 text-xs ${isUser ? "text-blue-50/80" : "text-slate-500"}`}>{timestamp}</p>
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

  const latestUserNeed = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role !== "user") continue;
      const textPart = message.parts?.find(part => part.type === "text");
      if (textPart && "text" in textPart && typeof textPart.text === "string") {
        return textPart.text.trim();
      }
    }
    return "";
  }, [messages]);

  const latestGalleryAndEvent = useMemo(() => {
    const summary: { gallery?: GalleryToolResult; event?: EventToolResult } = {};

    function updateSummary(payload: ToolResultPayload) {
      if (payload.type === "gallery-results") {
        summary.gallery = payload;
      } else if (payload.type === "event-results") {
        summary.event = payload;
      }
    }

    messages.forEach(message => {
      message.parts?.forEach(part => {
        if (isToolUIPart(part) && part.state === "output-available") {
          const payload = part.output;
          if (payload && typeof payload === "object" && "type" in (payload as Record<string, unknown>)) {
            updateSummary(payload as ToolResultPayload);
          }
        }
      });
    });

    return summary;
  }, [messages]);

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
    <div className="min-h-screen bg-slate-50">
      <div className="grid min-h-screen gap-6 px-4 py-10 lg:grid-cols-3 lg:px-10">
        <section className="flex h-[calc(100vh-5rem)] flex-col gap-6 lg:col-span-2">
          <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/80 px-6 py-5 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Gallery &amp; Event Discovery</h1>
                <p className="text-sm text-slate-500">Chat with the agent and explore semantic matches as they appear.</p>
              </div>
              <Button variant="outline" onClick={() => clearHistory()} disabled={!hasMessages}>
                Clear conversation
              </Button>
            </div>
          </header>

          <Card className="flex flex-1 flex-col overflow-hidden">
            <CardHeader className="border-b border-slate-100 bg-white/60">
              <CardTitle className="text-lg font-semibold text-slate-800">Assistant</CardTitle>
            </CardHeader>
            <div className="flex-1 space-y-4 overflow-y-auto bg-white px-6 py-5">
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
            <div className="border-t border-slate-100 bg-slate-50/80 px-6 py-4">
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
        </section>

        <aside className="flex h-[calc(100vh-5rem)] flex-col gap-6 overflow-hidden lg:border-l lg:border-slate-200 lg:pl-6">
          <Card className="bg-white/90">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-base font-semibold text-slate-800">Current focus</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              {latestUserNeed ? (
                <div className="space-y-1">
                  <span className="text-xs uppercase tracking-wide text-slate-500">User needs</span>
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {latestUserNeed}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Ask a question to capture your current goal.</p>
              )}
            </CardBody>
          </Card>

          <Card className="flex-1 overflow-hidden bg-white/90">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-base font-semibold text-slate-800">Latest matches</CardTitle>
            </CardHeader>
            <CardBody className="flex h-full flex-col overflow-hidden">
              {latestGalleryAndEvent.gallery || latestGalleryAndEvent.event ? (
                <div className="space-y-4 overflow-y-auto pr-2">
                  {latestGalleryAndEvent.gallery ? (
                    <section className="space-y-2">
                      <Badge variant="secondary" className="bg-slate-100 text-slate-700">Galleries</Badge>
                      {renderToolResult(latestGalleryAndEvent.gallery)}
                    </section>
                  ) : null}
                  {latestGalleryAndEvent.event ? (
                    <section className="space-y-2">
                      <Badge variant="secondary" className="bg-blue-100 text-blue-700">Events</Badge>
                      {renderToolResult(latestGalleryAndEvent.event)}
                    </section>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Run a vector search to see matches here.</p>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
