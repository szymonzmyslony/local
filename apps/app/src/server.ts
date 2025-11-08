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
import type { SavedEventCard } from "./types/chat-state";

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
        try {
          // Clean up incomplete tool calls to prevent API errors
          const cleanedMessages = cleanupMessages(this.messages);

          // Process any pending tool calls from previous messages
          // This handles human-in-the-loop confirmations for tools
          const processedMessages = await processToolCalls({
            messages: cleanedMessages,
            dataStream: writer,
            tools: allTools,
            executions,
            onToolResult: (result) => this.handleToolResult(result)
          });

          this.updateUserNeedsFromMessages(processedMessages);

          const result = streamText({
            system: `You are a calm, knowledgeable local guide helping people discover authentic art events in Warsaw, Poland. Speak naturally, with warmth and confidence — never salesy, never poetic. Think of yourself as a local who knows the city’s rhythm and recommends what genuinely fits.

CONVERSATION RHYTHM

- Collect at least two signals (time window, location, interest) before searching. If only one signal is present, ask one short follow-up for the missing detail.
- When you are ready to search, call match_event immediately (once per assistant turn) and write “Searching for events…” while the tool runs. Wait for the tool result before adding anything else.
- Let the event cards display. Then add one short check-in question about the results (e.g., “Anything here catch your eye?” “Want me to tweak the vibe or district?”). Skip any extra narration.
- If match_event returns no events, or the user asks for additional ideas without changing their request, you may call match_gallery for 1–3 gallery suggestions. Mention galleries in text only — never as cards — and explain briefly why each fits the vibe.
- If the user changes their signals (new mood, district, or timing), run match_event again with the new details before suggesting galleries.
- Do not call match_event or match_gallery multiple times in the same turn unless the user provides new information.

PREFERENCE CAPTURE

- Whenever the user mentions a district, artist, aesthetic, mood, or time preference, call update_user_requirements silently. Never announce that you updated their preferences.
- Normalize Warsaw locations (e.g., “Hoża” → Śródmieście).

FOLLOW-UPS

- Ask for missing signals only when needed. If the user seems chatty or open-ended, you can ask a light follow-up to clarify preferences.
- If match_event returns guidance, relay the suggested question and wait for the reply.

EVENT CARDS & SAVING

- Only events appear as cards. Each card should stand on its own (title, timing, location, brief description, source link).
- If the user asks to save an event (or triggers the button), call save_to_my_zine with the provided data and confirm naturally (“Saved to your zine.”).

LANGUAGE, TONE & BOUNDARIES

- Detect the user’s language (Polish or English) and match their tone.
- Be concise, sensory, and grounded (e.g., “quiet opening in Praga,” “light installation near the river”).
- Only reference real places and events in Warsaw. If information is missing, say so plainly.

Stay human, calm, and helpful. Your goal is to guide people to art experiences that match their mood, time, and part of the city.`,

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
        } catch (error) {
          console.error("[onChatMessage] Error in stream execution:", error);
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          writer.write({
            type: "text-delta",
            delta: `Error: ${errorMessage}`,
            id: generateId()
          });
        }
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
    // Handle guidance responses from match_event (they're not ToolResultPayload)
    if (
      result &&
      typeof result === "object" &&
      "type" in result &&
      result.type === "guidance"
    ) {
      // Guidance responses are handled by the assistant in its response text
      // No need to store them as recommendations
      return;
    }

    // Handle save_to_my_zine results - they update savedCards but aren't ToolResultPayload
    if (
      result &&
      typeof result === "object" &&
      "success" in result &&
      (result as { success?: boolean }).success === true &&
      "message" in result
    ) {
      // save_to_my_zine returns { success: true, message: string }
      // The card is already saved via agent.saveEventToMyZine in the tool execute
      // State is already updated, so we just return
      return;
    }

    // Handle regular tool results (event or gallery results)
    if (!isToolResultPayload(result)) {
      return;
    }

    // Only store event results in state - galleries are text-only fallbacks
    if (result.type === "gallery-results") {
      // Gallery results should not be stored in state or displayed as cards
      // They are only mentioned in the agent's text response
      return;
    }

    const currentState = this.state ?? createInitialChatState();

    // Store event results
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
      const textPart = message.parts?.find(
        (part): part is { type: "text"; text: string } => part.type === "text"
      );
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

  /**
   * Save an event card to MY ZINE (stored in ChatState)
   */
  async saveEventToMyZine(eventData: SavedEventCard): Promise<void> {
    const currentState = this.state ?? createInitialChatState();
    const existingIndex = currentState.savedCards.findIndex(
      (card) => card.eventId === eventData.eventId
    );

    let updatedCards: SavedEventCard[];
    if (existingIndex >= 0) {
      // Update existing card
      updatedCards = [...currentState.savedCards];
      updatedCards[existingIndex] = eventData;
    } else {
      // Add new card
      updatedCards = [...currentState.savedCards, eventData];
    }

    // Sort by savedAt (most recent first)
    updatedCards.sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
    );

    this.setState({
      ...currentState,
      savedCards: updatedCards
    });
  }

  /**
   * Remove an event card from MY ZINE
   */
  async removeEventFromMyZine(eventId: string): Promise<void> {
    const currentState = this.state ?? createInitialChatState();
    this.setState({
      ...currentState,
      savedCards: currentState.savedCards.filter(
        (card) => card.eventId !== eventId
      )
    });
  }

  /**
   * Get all saved events from MY ZINE
   */
  async getMyZineEvents(): Promise<SavedEventCard[]> {
    const currentState = this.state ?? createInitialChatState();
    return currentState.savedCards;
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
    const assets = (env as unknown as { ASSETS?: { fetch: typeof fetch } })
      .ASSETS;
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
