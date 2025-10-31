import { useEffect, useMemo, useRef, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "agents/ai-react";
import type { UIMessage } from "@ai-sdk/react";
import { isToolUIPart } from "ai";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Markdown, Textarea } from "@shared/ui";
import { renderToolResult } from "./tool-results";
import { ToolResultCard } from "./tool-result-card";
import type { ChatState } from "./types/chat-state";
import { createInitialUserRequirements } from "./types/chat-state";

type MessageMeta = { createdAt: string };

function formatTimestamp(value: string | Date | undefined): string {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Chat() {
  const [agentState, setAgentState] = useState<ChatState | null>(null);

  const agent = useAgent<ChatState>({
    agent: "chat",
    onStateUpdate: setAgentState
  });
  const {
    messages,
    sendMessage,
    status,
    stop,
    clearHistory
  } = useAgentChat<ChatState, UIMessage<MessageMeta>>({ agent });

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

                if (isToolUIPart(part)) {
                  return (
                    <div key={`${message.id}-tool-${index}`} className="space-y-2">
                      <ToolResultCard part={part} />
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

  const userNeeds = agentState?.userNeeds?.trim() ?? "";
  const userRequirements = agentState?.userRequirements ?? createInitialUserRequirements();
  const requirementsTime = userRequirements.time ?? createInitialTimePreferences();
  const recommendation = agentState?.recommendation ?? null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const content = inputValue.trim();
    if (!content || status === "submitted" || status === "streaming") {
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
              {status === "submitted" ? (
                <div className="flex justify-start">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    The assistant is reviewing your request…
                  </div>
                </div>
              ) : null}
              {status === "streaming" ? (
                <div className="flex justify-start">
                  <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                    Generating a response…
                  </div>
                </div>
              ) : null}
              {status === "error" ? (
                <div className="flex justify-start">
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    Something went wrong while contacting the assistant. Please try again.
                  </div>
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>
            <div className="border-t border-slate-100 bg-slate-50/80 px-6 py-4">
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <Textarea
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  placeholder="Ask about galleries or events…"
                  rows={3}
                  disabled={status === "submitted" || status === "streaming"}
                />
                <div className="flex items-center justify-end gap-3">
                  {status === "streaming" ? (
                    <Button variant="ghost" onClick={stop} type="button">
                      Stop
                    </Button>
                  ) : null}
                  <Button type="submit" disabled={!inputValue.trim() || status === "submitted" || status === "streaming"}>
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
            <CardBody className="space-y-4">
              <div className="space-y-1">
                <span className="text-xs uppercase tracking-wide text-slate-500">User needs</span>
                {userNeeds ? (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {userNeeds}
                  </p>
                ) : (
                  <p className="text-sm text-slate-500">Ask a question to capture your current goal.</p>
                )}
              </div>

              <div className="space-y-2">
                <span className="text-xs uppercase tracking-wide text-slate-500">Preferences</span>
                <div className="space-y-3 rounded-lg border border-slate-200 bg-white/70 px-3 py-3">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span className="font-medium text-slate-700">District</span>
                    <span>{userRequirements.district ?? "Not specified"}</span>
                  </div>
                  {userRequirements.aesthetics.length > 0 ? (
                    <div className="space-y-1 text-xs">
                      <span className="font-medium text-slate-700">Style & aesthetics</span>
                      <div className="flex flex-wrap gap-2">
                        {userRequirements.aesthetics.map((tag) => (
                          <Badge key={tag} variant="secondary" className="bg-purple-100 text-purple-700">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {userRequirements.artists.length > 0 ? (
                    <div className="space-y-1 text-xs">
                      <span className="font-medium text-slate-700">Artists</span>
                      <div className="flex flex-wrap gap-2">
                        {userRequirements.artists.map((artist) => (
                          <Badge key={artist} variant="secondary" className="bg-slate-100 text-slate-700">
                            {artist}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="flex justify-between text-xs text-slate-600">
                    <span className="font-medium text-slate-700">Mood</span>
                    <span>{userRequirements.mood ?? "Not specified"}</span>
                  </div>
                  <div className="space-y-2 text-xs text-slate-600">
                    <span className="font-medium text-slate-700">Time preferences</span>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span>Months</span>
                        <span>{userRequirements.time.months.length ? userRequirements.time.months.join(", ") : "Any"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Weeks</span>
                        <span>{userRequirements.time.weeks.length ? userRequirements.time.weeks.join(", ") : "Any"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Day periods</span>
                        <span>{userRequirements.time.dayPeriods.length ? userRequirements.time.dayPeriods.join(", ") : "Any"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Specific hours</span>
                        <span>{userRequirements.time.specificHours.length ? userRequirements.time.specificHours.join(", ") : "Any"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card className="flex-1 overflow-hidden bg-white/90">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-base font-semibold text-slate-800">Latest matches</CardTitle>
            </CardHeader>
            <CardBody className="flex h-full flex-col overflow-hidden">
              {recommendation ? (
                <div className="space-y-4 overflow-y-auto pr-2">
                  <section className="space-y-2">
                    <Badge
                      variant="secondary"
                      className={recommendation.type === "gallery-results" ? "bg-slate-100 text-slate-700" : "bg-blue-100 text-blue-700"}
                    >
                      {recommendation.type === "gallery-results" ? "Galleries" : "Events"}
                    </Badge>
                    {renderToolResult(recommendation)}
                  </section>
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
