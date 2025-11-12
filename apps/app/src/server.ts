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
} from "ai";
import { openai, OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import { processToolCalls, cleanupMessages } from "./utils";
import { tools, executions } from "./tools";
import type { ZineChatState, UserRequirements } from "./types/chat-state";
import { createInitialChatState } from "./types/chat-state";
import type { EventMatchItem, GalleryMatchItem } from "./types/tool-results";

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
    // Clear previous search results at the start of a new query
    this.clearSearchResults();

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        try {
          // Clean up incomplete tool calls to prevent API errors
          const cleanedMessages = cleanupMessages(this.messages);

          // Process any pending tool calls from previous messages
          // This handles human-in-the-loop confirmations for tools
          const processedMessages = await processToolCalls({
            messages: cleanedMessages,
            tools: tools,
            executions,
          });

          const result = streamText({
            system: `You are a calm, knowledgeable local guide helping people discover authentic art events in Warsaw, Poland. Speak naturally, with warmth and confidence — never salesy, never poetic. Think of yourself as a local who knows the city's rhythm and recommends what genuinely fits.

SEARCH STRATEGY (CRITICAL)

1. **Multi-Source Search**: For EVERY user query, run AT LEAST 2 different search tools to gather comprehensive results:
   - match_event (semantic search for events matching mood/vibe)
   - search_events_by_text (exact search by artist name or event title)
   - match_gallery (semantic search for galleries matching aesthetic)
   - search_galleries_by_text (search by gallery name or filter by district)

2. **Analyze Full Context**: Search tools return complete details (descriptions, artists, dates, tags, locations). Read EVERYTHING carefully before making recommendations.

3. **Curate Intelligently**: After gathering results from multiple sources:
   - Analyze which items best match the user's stated preferences
   - Consider timing, location, mood, and aesthetic fit
   - Call show_recommendations with indices of 3-5 best matches
   - Provide personalized commentary explaining WHY each recommendation fits

4. **Example Flow**:
   User: "Abstract art this weekend in Śródmieście"
   → Call match_event("abstract art weekend")
   → Call search_galleries_by_text(filterDistrict: "Srodmiescie")
   → Review all results with full details
   → Call show_recommendations(eventIndices: [0, 2, 5]) for best 3 matches
   → Explain: "These three caught my eye because..."

PREFERENCE CAPTURE

- Whenever the user mentions a district, artist, aesthetic, mood, or time preference, call update_user_requirements silently. Never announce that you updated their preferences.
- Normalize Warsaw locations (e.g., "Hoża" → Śródmieście).

CONVERSATION RHYTHM

- Collect at least two signals (time window, location, interest) before searching. If only one signal is present, ask one short follow-up for the missing detail.
- After showing recommendations, add one short check-in question about the results (e.g., "Anything here catch your eye?" "Want different vibes or districts?").
- If the user changes their signals (new mood, district, or timing), run searches again with the new details.

LANGUAGE, TONE & BOUNDARIES

- Detect the user's language (Polish or English) and match their tone.
- Be concise, sensory, and grounded (e.g., "quiet opening in Praga," "light installation near the river").
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
          // Don't write to the stream after an error - just throw to let the stream handle it
          throw error;
        }
      }
    });

    return createUIMessageStreamResponse({ stream });
  }
  /**
   * Update user requirements - called by the update_user_requirements tool
   */
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
   * Store search results in state - MERGES with existing results instead of overwriting
   */
  storeSearchResults(events: EventMatchItem[], galleries: GalleryMatchItem[]): void {
    const currentState = this.state ?? createInitialChatState();
    const existing = currentState.lastSearchResults || { events: [], galleries: [] };

    this.setState({
      ...currentState,
      lastSearchResults: {
        events: [...existing.events, ...events],
        galleries: [...existing.galleries, ...galleries]
      }
    });
  }

  /**
   * Clear search results - call at the start of a new search query
   */
  clearSearchResults(): void {
    const currentState = this.state ?? createInitialChatState();
    this.setState({
      ...currentState,
      lastSearchResults: {
        events: [],
        galleries: []
      }
    });
  }

  /**
   * Get stored search results from state
   */
  getSearchResults(): { events: EventMatchItem[]; galleries: GalleryMatchItem[] } | null {
    return this.state?.lastSearchResults ?? null;
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
