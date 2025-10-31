import { routeAgentRequest, type Schedule } from "agents";

import { AIChatAgent } from "agents/ai-chat-agent";
import {
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  stepCountIs,
  createUIMessageStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  type ToolSet,
  type UIMessage
} from "ai";
import { openai } from "@ai-sdk/openai";
import { processToolCalls, cleanupMessages } from "./utils";
import { tools, executions } from "./tools";
import type { ToolResultPayload } from "./types/tool-results";
import type { ChatState } from "./types/chat-state";
import { createInitialChatState } from "./types/chat-state";
// import { AI_CONFIG } from "../../config/ai";
// import { env } from "cloudflare:workers";

const model = openai("gpt-5");

function isToolResultPayload(value: unknown): value is ToolResultPayload {
  if (!value || typeof value !== "object" || !("type" in value)) {
    return false;
  }
  const type = (value as { type: unknown }).type;
  return type === "gallery-results" || type === "event-results";
}

export class Chat extends AIChatAgent<Env, ChatState> {
  override initialState: ChatState = createInitialChatState();

  /**
   * Handles incoming chat messages and manages the response stream
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    // const mcpConnection = await this.mcp.connect(
    //   "https://path-to-mcp-server/sse"
    // );

    // Collect all tools, including MCP tools
    const allTools = {
      ...tools,
      ...this.mcp.getAITools()
    };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Clean up incomplete tool calls to prevent API errors
        const cleanedMessages = cleanupMessages(this.messages);

        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools
        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions,
          onToolResult: result => this.handleToolResult(result)
        });

        this.updateUserNeedsFromMessages(processedMessages);

          const result = streamText({
            system: `You are an art discovery assistant working strictly with venues and events in Warsaw, Poland. 

- Whenever the user states or implies a preferred district (Ochota, Srodmiescie, Wola, Bemowo, Mokotow, Praga, or Zoliborz), specific artists, style/aesthetic descriptors, desired mood, or time preferences (month, week, day periods like morning/evening, or exact hours), call the update_user_requirements tool immediately to capture it.
- Always interpret location references as Warsaw districts; never suggest places outside Warsaw.
- When recommending options, prefer match_gallery or match_event to retrieve embeddings-based matches, then summarise the most relevant ones, referencing any stored preferences.
- Keep replies concise, grounded in Warsaw, and acknowledge the stored preferences when applicable.`,

          messages: convertToModelMessages(processedMessages),
          model,
          tools: allTools,
          // Type boundary: streamText expects specific tool types, but base class uses ToolSet
          // This is safe because our tools satisfy ToolSet interface (verified by 'satisfies' in tools.ts)
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<
            typeof allTools
          >,
          stopWhen: stepCountIs(10)
        });

        writer.merge(result.toUIMessageStream());
      }
    });

    return createUIMessageStreamResponse({ stream });
  }
  async executeTask(description: string, _task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        parts: [
          {
            type: "text",
            text: `Running scheduled task: ${description}`
          }
        ],
        metadata: {
          createdAt: new Date()
        }
      }
    ]);
  }

  private handleToolResult(result: unknown) {
    if (!isToolResultPayload(result)) {
      return;
    }
    const currentState = this.state ?? createInitialChatState();
    this.setState({
      ...currentState,
      recommendation: result
    });
  }

  private updateUserNeedsFromMessages(messages: UIMessage[]) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role !== "user") {
        continue;
      }
      const textPart = message.parts?.find((part): part is { type: "text"; text: string } => part.type === "text");
      if (textPart) {
        const currentState = this.state ?? createInitialChatState();
        this.setState({
          ...currentState,
          userNeeds: textPart.text.trim() || null
        });
        break;
      }
    }
  }
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/check-open-ai-key") {
      const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
      return Response.json({
        success: hasOpenAIKey
      });
    }
    if (!process.env.OPENAI_API_KEY) {
      console.error(
        "OPENAI_API_KEY is not set, don't forget to set it locally in .dev.vars, and use `wrangler secret bulk .dev.vars` to upload it to production"
      );
    }
    // Route to agent first
    const routed = await routeAgentRequest(request, env);
    if (routed) return routed;

    // Minimal SPA fallback: serve index.html at "/" and delegate other assets to ASSETS
    const assets = (env as unknown as { ASSETS?: { fetch: typeof fetch } }).ASSETS;
    if (assets) {
      const urlPath = url.pathname;
      if (request.method === "GET" && (urlPath === "/" || urlPath === "")) {
        const indexResponse = await assets.fetch(
          new Request(new URL("/index.html", url.origin), request)
        );
        if (indexResponse.status !== 404) return indexResponse;
      }
      const response = await assets.fetch(request);
      if (response.status !== 404) return response;
    }

    return new Response("Not found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;
