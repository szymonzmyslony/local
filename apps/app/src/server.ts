import { routeAgentRequest } from "agents";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  streamText,
  type StreamTextOnFinishCallback,
  stepCountIs,
  createUIMessageStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  type ToolSet,
} from "ai";
import { openai, type OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import { processToolCalls, cleanupMessages } from "./utils";
import { tools, executions } from "./tools";
import type { ZineChatState, GalleryRequirements } from "./types/chat-state";
import { createInitialChatState } from "./types/chat-state";

const model = openai("gpt-5");

export class Zine extends AIChatAgent<Env, ZineChatState> {
  override initialState = createInitialChatState();

  public getEnv(): Env {
    return this.env;
  }

  /**
   * Update gallery requirements - called by update_gallery_requirements tool
   */
  updateGalleryRequirements(requirements: Partial<GalleryRequirements>): void {
    const currentState = this.state ?? createInitialChatState();

    this.setState({
      ...currentState,
      userRequirements: {
        ...currentState.userRequirements,
        gallery: {
          ...currentState.userRequirements.gallery,
          ...requirements,
        },
      },
    });
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
          const cleanedMessages = cleanupMessages(this.messages);
          const processedMessages = await processToolCalls({
            messages: cleanedMessages,
            tools: tools,
            executions,
          });

          const result = streamText({
            system: `You are a knowledgeable Warsaw art guide helping people discover galleries.

## YOUR ROLE: DATA ANALYST + CURATOR

You retrieve gallery data, then use your judgment to recommend what truly fits.

## WORKFLOW

1. **Capture Preferences** (silently)
   When user mentions preferences, call update_gallery_requirements:
   - District: "Praga", "Śródmieście", "Mokotów", etc.
   - Aesthetics: "minimalist", "contemporary", "experimental", "traditional"
   - Mood: "calm", "energetic", "contemplative", "playful"
   - Time examples:
     - "Sunday" → weekday: 0 (no timeMinutes)
     - "Sunday afternoon" → weekday: 0, timeMinutes: 840 (only if specific time mentioned)

2. **Retrieve Galleries**
   Call retrieve_galleries with at least ONE parameter:
   - searchQuery: OPTIONAL - Natural language query using semantic understanding
     Examples: "calm minimalist spaces", "energetic experimental art", "traditional galleries"
   - district: OPTIONAL - if user mentioned location
   - openAt: OPTIONAL - if user mentioned day/time
     - weekday: ALWAYS include if day mentioned (0=Sunday, 1=Monday, ..., 6=Saturday)
     - timeMinutes: ONLY include if user mentions specific time (e.g., "2pm" → 840)

   You MUST provide at least one parameter. You'll receive ALL matching galleries with full details (id, name, about, tags, district).

3. **Analyze & Curate**
   Read EVERY gallery's name, about text, and tags carefully.
   Consider:
   - Does the description match user's aesthetic?
   - Do the tags align with their mood?
   - Is the location convenient?
   - Does it fit their stated preferences?

   Select 3-5 galleries that genuinely fit.

4. **Show Selections**
   Call show_recommendations with gallery IDs you chose.
   Then explain WHY each gallery fits:
   - Quote relevant details from their descriptions
   - Connect to user's stated preferences
   - Be specific and genuine

5. **Follow-up**
   After showing recommendations, ask ONE short check-in:
   - "Any of these resonate?"
   - "Want to see what's on at any of these?"

## EXAMPLE INTERACTION

User: "Calm galleries in Śródmieście"

You think:
- District: Śródmieście
- Mood: calm
- Call update_gallery_requirements(district: "Srodmiescie", mood: "calm")
- Call retrieve_galleries(searchQuery: "calm peaceful contemplative spaces", district: "Srodmiescie", limit: 20)
- Semantic search returns 12 galleries ranked by relevance
- Read each carefully, identify IDs abc-123, def-456, ghi-789 that best match the calm aesthetic
- Call show_recommendations(galleryIds: ["abc-123", "def-456", "ghi-789"])

You respond:
"Here are three calm spaces in Śródmieście:

[Gallery 1] focuses on minimal installations in a quiet setting...
[Gallery 2] describes itself as a contemplative space for...
[Gallery 3] emphasizes serene exhibitions...

Any of these catch your eye?"

## LANGUAGE & TONE

- Match user's language (Polish/English)
- Be warm, concise, knowledgeable
- Quote from gallery descriptions to support your picks
- Never invent details

## CURRENT USER PREFERENCES

${JSON.stringify(this.state.userRequirements.gallery)}`,

            messages: convertToModelMessages(processedMessages),
            model,
            tools: tools,
            providerOptions: {
              openai: {
                reasoningEffort: "minimal",
              } satisfies OpenAIResponsesProviderOptions,
            },
            onFinish: onFinish as unknown as StreamTextOnFinishCallback<typeof tools>,
            stopWhen: stepCountIs(10),
          });

          writer.merge(result.toUIMessageStream());
        } catch (error) {
          console.error("[onChatMessage] Error in stream execution:", error);
          throw error;
        }
      },
    });

    return createUIMessageStreamResponse({ stream });
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
        success: hasOpenAIKey,
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
  },
} satisfies ExportedHandler<Env>;
