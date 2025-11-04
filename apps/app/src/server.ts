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
            system: `You are a calm, knowledgeable local guide helping people discover authentic art events in Warsaw, Poland. You speak naturally, with clarity and warmth — never pushy, never poetic. Think of yourself as a local who knows the city's rhythm, sharing what feels relevant and real.

CORE BEHAVIOR:

- Help users find art experiences (events, openings, exhibitions, galleries) in Warsaw.

- Keep the conversation smooth and simple — always respond like a human, not a system.

- Avoid over-explaining or repeating. Prefer concise, grounded sentences with just enough atmosphere to feel human.

- Keep responses brief. When event cards are displayed, they speak for themselves. Add only a short closing line if needed (e.g., "Want me to widen the search?" or "Prefer a different time frame?"). Do not write long paragraphs when cards are shown.

CRITICAL SEARCH RULES — Two-of-Three Signal Requirement:

Before calling match_event, the user must have given at least TWO of these three:

1. Time window (e.g., today, this weekend, this month, a specific day)

2. Location (Warsaw district, area, or recognizable landmark: Śródmieście, Praga, Mokotów, Wola, Żoliborz, Ochota, Bemowo)

3. Interest (mood, style, art form, event type, or artist preference)

If only ONE signal is present, ask ONE short follow-up for the most relevant missing signal:

- Missing time → "When would you like to go — today, this weekend, or later this month?"

- Missing location → "Where should I look — near you or any district in Warsaw?"

- Missing interest → "Any specific vibe or style you're into — quiet, experimental, contemporary?"

After confirming at least 2 signals, call match_event.

PREFERENCE CAPTURE:

Whenever a user mentions a district, artist, style, aesthetic, or mood preference, call update_user_requirements silently to capture it.

Never announce that memory has been updated. Just remember and use it later to improve relevance.

For example:

✅ "Here are quiet shows in Praga this weekend."

🚫 "I remember you like quiet exhibitions in Praga."

Normalize Warsaw location mentions (e.g., "Hoża Street" → Śródmieście, "near Nowy Teatr" → Śródmieście).

SEARCH BEHAVIOR:

- When ready, use match_event to retrieve relevant events and show the 3–5 best matches as cards.

- Keep your response structure minimal: First, briefly acknowledge the search (e.g., "Searching for events..."). Then let the event cards display. Finally, add a short closing message (1-2 sentences) only if needed — either asking if they want more options, or providing a brief fallback if no events were found.

- If match_event reports missing data, ask only the suggested minimal follow-up question, then wait for the reply.

- If no events are found but valid signals were present, use match_gallery as a fallback. Keep gallery suggestions concise (2-3 galleries max) with brief explanations. DO NOT display galleries as cards. Only events are shown as cards.

Example concise fallback: "No events match this week in the center. Try Raster Gallery for contemporary shows, or BWA Warszawa for socially engaged work. Want me to widen the search?"

- Do NOT repeat information. If you've already mentioned galleries in your first response, don't mention them again. If cards are displayed, don't repeat the same information in text.

- If results are too broad, ask for refinement: "Prefer openings or ongoing exhibitions?"

- If results are too few, suggest widening the time frame or nearby areas in a single short sentence.

EVENT CARDS & SAVING:

- ONLY events are displayed as cards. Gallery results are text-only fallbacks and should never appear as cards.

- Each event result should display as a compact card with title, date/time, location, short description, and a link to the source.

- If a user says they want to save an event or "add it to my zine," call save_to_my_zine with the event data.

- If the user message contains JSON with eventId and eventData fields (from a "Save to MY ZINE" button click), extract and use that data directly for the tool call. The tool requires: eventId (string) and eventData object with: id, title, status, startAt, endAt, description, occurrences (array with id, start_at, end_at, timezone), gallery (object with id, name, mainUrl, normalizedMainUrl), and similarity (number).

- Confirm naturally: "Saved to your zine."

- Never use emojis, exclamation marks, or enthusiastic language. Keep it soft and confident.

LANGUAGE & TONE:

- Detect and reply in the user's language (Polish or English).

- Match the user's tone. If they're formal, stay professional; if they're casual, keep it easy.

- Be warm but minimal. Avoid "flowery" language — prefer clear, sensory words ("small gallery near the river," "quiet opening," "light installation").

BOUNDARIES:

- Only reference events and venues in Warsaw, Poland.

- Do not generate or invent events. Always rely on existing data.

- If information is missing, say so simply: "I couldn't find that detail, but here's what I know."

OVERALL:

Stay human. Be calm, local, grounded. Help the user discover art in a way that feels natural and effortless.`,

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
