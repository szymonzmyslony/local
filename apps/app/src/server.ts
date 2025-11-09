import { callable, routeAgentRequest, type Schedule } from "agents";

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
} from "ai";
import { openai, OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import { processToolCalls, cleanupMessages } from "./utils";
import { tools, executions } from "./tools";
import type { ZineChatState, UserRequirements } from "./types/chat-state";
import { createInitialChatState } from "./types/chat-state";
import type { EventMatchItem } from "./types/tool-results";

const model = openai("gpt-5");



export class Zine extends AIChatAgent<Env, ZineChatState> {
  override initialState = createInitialChatState();


  public getEnv(): Env {
    return this.env;
  }

  /**
   * Handles incoming chat messages and manages the response stream
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {


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
            tools: tools,
            executions,
          });


          const result = streamText({
            system: `You are a calm, knowledgeable local guide helping people discover authentic art events in Warsaw, Poland. Speak naturally, with warmth and confidence — never salesy, never poetic. Think of yourself as a local who knows the city’s rhythm and recommends what genuinely fits.

CONVERSATION RHYTHM

- Collect at least two signals (time window, location, interest) before searching. If only one signal is present, ask one short follow-up for the missing detail.
- When you are ready to search, call match_event immediately (once per assistant turn). The UI will show the tool execution automatically.
- After event cards display, add one short check-in question about the results (e.g., "Anything here catch your eye?" "Want me to tweak the vibe or district?"). Skip any extra narration.
- If match_event returns no events, or the user asks for additional ideas without changing their request, you may call match_gallery for 1–3 gallery suggestions. Mention galleries in text only — never as cards — and explain briefly why each fits the vibe.
- If the user changes their signals (new mood, district, or timing), run match_event again with the new details before suggesting galleries.
- Do not call match_event or match_gallery multiple times in the same turn unless the user provides new information.

PREFERENCE CAPTURE

- Whenever the user mentions a district, artist, aesthetic, mood, or time preference, call update_user_requirements silently. Never announce that you updated their preferences.
- Normalize Warsaw locations (e.g., “Hoża” → Śródmieście).

FOLLOW-UPS

- Ask for missing signals only when needed. If the user seems chatty or open-ended, you can ask a light follow-up to clarify preferences.
- If match_event returns guidance, relay the suggested question and wait for the reply.


LANGUAGE, TONE & BOUNDARIES

- Detect the user’s language (Polish or English) and match their tone.
- Be concise, sensory, and grounded (e.g., “quiet opening in Praga,” “light installation near the river”).
- Only reference real places and events in Warsaw. If information is missing, say so plainly.

Stay human, calm, and helpful. Your goal is to guide people to art experiences that match their mood, time, and part of the city.

USER CURRENT PREFERENCES:

${JSON.stringify(this.state.userRequirements)}
`
            
            
            
            
            
            
            ,

            messages: convertToModelMessages(processedMessages),
            model,
            tools: tools,
            providerOptions: {
              openai: {
                reasoningEffort: "minimal"
              } satisfies OpenAIResponsesProviderOptions
            },
            // Type boundary: streamText expects specific tool types, but base class uses ToolSet
            // This is safe because our tools satisfy ToolSet interface (verified by 'satisfies' in tools.ts)
            onFinish: onFinish as unknown as StreamTextOnFinishCallback<
              typeof tools
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




  /**
   * Save an EventMatchItem to MY ZINE (stored in ChatState)
   */
  @callable({ description: "Save an event to MY ZINE" })
  saveToZine(event: EventMatchItem): void {
    const currentState = this.state ?? createInitialChatState();
    const savedCards = currentState.savedCards ?? [];

    // Check if event already exists
    const existingIndex = savedCards.findIndex((card) => card.event_id === event.event_id);

    if (existingIndex >= 0) {
      // Update existing event
      savedCards[existingIndex] = event;
    } else {
      // Add new event to the array
      savedCards.push(event);
    }

    this.setState({
      ...currentState,
      savedCards
    });
  }

  /**
   * Update user requirements
   */
  @callable({ description: "Update the user's requirements" })
  updateUserRequirements(requirements: Partial<UserRequirements>): void {
    const currentState = this.state ?? createInitialChatState();
    const currentRequirements = currentState.userRequirements;

    this.setState({
      ...currentState,
      userRequirements: {
        ...currentRequirements,
        ...requirements
      }
    });
  }

  /**
   * Remove an event card from MY ZINE
   */
  @callable({ description: "Remove an event from MY ZINE" })
  async removeEventFromMyZine(eventId: string): Promise<void> {
    this.setState({
      ...this.state,
      savedCards: (this.state.savedCards ?? []).filter(
        (card) => card.event_id !== eventId
      )
    });
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
