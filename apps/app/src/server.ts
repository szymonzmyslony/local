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
  type UIMessage,
} from "ai";
import { openai, type OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import { processToolCalls, cleanupMessages } from "./utils";
import { tools, executions } from "./tools";
import type { ZineChatState, GalleryRequirements, ChannelContext } from "./types/chat-state";
import { createInitialChatState } from "./types/chat-state";
import type { WhatsAppWebhookPayload, ExtractedWhatsAppMessage } from "./types/whatsapp";
import { markMessageAsRead, sendTextMessage, formatForWhatsApp } from "./services/whatsapp-api";

const model = openai("gpt-5");

export class Zine extends AIChatAgent<Env, ZineChatState> {
  override initialState = createInitialChatState();

  public getEnv(): Env {
    return this.env;
  }

  /**
   * Set channel context (called on first message from each channel)
   */
  public setChannelContext(context: import("./types/chat-state").ChannelContext): void {
    if (!this.state.channelContext) {
      this.setState({
        ...this.state,
        channelContext: context,
      });
    }
  }

  /**
   * Override saveMessages to add detailed logging
   */
  override async saveMessages(messages: UIMessage[]): Promise<void> {
    const context = this.state.channelContext;
    console.log(`[Zine] 📝 saveMessages() called with ${messages.length} message(s)`);
    console.log(`[Zine] 💬 Current conversation has ${this.messages.length} messages before save`);
    console.log(`[Zine] 🆔 Channel: ${context?.channel || 'unknown'}`);

    if (context?.channel === 'whatsapp') {
      console.log(`[Zine] 📱 WhatsApp user: ${context.waId}`);
    }

    // Log the incoming messages
    for (const msg of messages) {
      const text = msg.parts.find(p => p.type === 'text')?.text || '[no text]';
      console.log(`[Zine] 📨 Incoming message [${msg.role}]: ${text.substring(0, 100)}...`);
    }

    await super.saveMessages(messages);

    console.log(`[Zine] ✅ saveMessages() completed, now ${this.messages.length} total messages`);
  }

  // /**
  //  * Update gallery requirements - called by update_gallery_requirements tool
  //  */
  // updateGalleryRequirements(requirements: Partial<GalleryRequirements>): void {
  //   const currentState = this.state ?? createInitialChatState();

  //   this.setState({
  //     ...currentState,
  //     userRequirements: {
  //       ...currentState.userRequirements,
  //       gallery: {
  //         ...currentState.userRequirements.gallery,
  //         ...requirements,
  //       },
  //     },
  //   });
  // }

  /**
   * Handles incoming chat messages and manages the response stream
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    const context = this.state.channelContext;
    console.log('[AI] 🤖 onChatMessage() TRIGGERED');
    console.log(`[AI] 📊 Conversation stats: ${this.messages.length} messages in history`);
    console.log(`[AI] 🆔 User channel: ${context?.channel || 'unknown'}`);

    if (context?.channel === 'whatsapp') {
      console.log(`[AI] 📱 WhatsApp user: ${context.waId}`);
    }

    if (this.messages.length > 0) {
      const lastMsg = this.messages[this.messages.length - 1];
      const lastText = lastMsg.parts?.find(p => p.type === 'text')?.text || '[no text]';
      console.log(`[AI] 💬 Last message [${lastMsg.role}]: ${lastText.substring(0, 50)}...`);
    }

    console.log('[AI] 🚀 Starting AI processing...');

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        try {
          const cleanedMessages = cleanupMessages(this.messages);
          const processedMessages = await processToolCalls({
            messages: cleanedMessages,
            tools: tools,
            executions,
          });

          // Build channel-specific system prompt
          const channelContext = this.state.channelContext;
          const isWhatsApp = channelContext?.channel === 'whatsapp';

          const basePrompt = `You are Zine, an AI art discovery assistant helping people find galleries and art events in Warsaw.

Your purpose: Help people discover art that matches their taste, whether they're looking for contemporary galleries, exhibitions, or specific artists.

When users ask about galleries:
1. Capture their preferences silently (district, mood, aesthetics, time, artists)
2. Use search tools to find matches
3. Select 3-5 that truly match their needs
4. Present them with specific details from gallery descriptions

Format your gallery recommendations as:

🎨 **Gallery Name**
📍 District • Address
ℹ️ Brief about text
🔗 Website

When discussing events, include dates and ticket information if available.

Personality: Be enthusiastic about art, warm, and conversational. Match the user's language (Polish/English). Quote from actual gallery descriptions to add authenticity.`;

          const channelInstructions = isWhatsApp
            ? `\n\nChannel: WhatsApp - CRITICAL INSTRUCTIONS:

CORE BEHAVIOR:
- Detect the user's emotional tone, social energy level, and aesthetic preferences from their message
- Suggest 3-5 events that best match their mood
- Keep answers direct, concise, and immediately actionable
- No long conversations. Provide results instantly.

FOR EACH EVENT, ALWAYS INCLUDE:
- Event name (in *bold*)
- One-sentence vibe fit (why it matches their mood)
- Venue name
- Opening hours
- Street address
- A Google Maps link formatted as: https://maps.google.com/?q=VENUE_NAME+ADDRESS

TONE:
- Confident and perceptive
- No overexplaining
- No filler
- Feel like a friend with perfect taste who "just knows"

FORMATTING:
- Use *bold* for event names and important info
- Keep each event to 3-4 lines max
- Separate events with a blank line
- Maximum 150 words total per response
- Use emojis sparingly (1-2 total)`
            : `\n\nChannel: Web. You can provide richer details and context. Users can see visual gallery cards when you call show_recommendations. Use markdown formatting for better readability.`;

          const result = streamText({
            system: basePrompt + channelInstructions,
            messages: convertToModelMessages(processedMessages),
            model,
            tools: tools,
            maxTokens: isWhatsApp ? 300 : 500, // Limit tokens for WhatsApp to keep responses concise
            providerOptions: {
              openai: {
                reasoningEffort: "minimal",
              } satisfies OpenAIResponsesProviderOptions,
            },
            onFinish: (async (finishResult: any) => {
              console.log('[AI] ✅ AI processing finished');
              console.log(`[AI] 📊 Response length: ${finishResult.text?.length || 0} chars`);
              console.log(`[AI] 🔧 Tool calls made: ${finishResult.toolCalls?.length || 0}`);

              // Log tool calls
              if (finishResult.toolCalls && finishResult.toolCalls.length > 0) {
                for (const toolCall of finishResult.toolCalls) {
                  console.log(`[AI] 🔨 Tool: ${toolCall.toolName}`);
                }
              }

              // Call original onFinish
              await onFinish(finishResult);

              // If WhatsApp mode, send the full text response
              const context = this.state.channelContext;
              if (context?.channel === 'whatsapp') {
                console.log('[AI] 📤 Extracting text for WhatsApp...');

                // Extract all text content from assistant messages
                const textParts: string[] = [];
                for (const msg of finishResult.response.messages) {
                  if (msg.role === 'assistant') {
                    for (const content of msg.content) {
                      if (content.type === 'text') {
                        textParts.push(content.text);
                      }
                    }
                  }
                }

                if (textParts.length > 0) {
                  const fullText = textParts.join('\n\n');
                  const formattedText = formatForWhatsApp(fullText);
                  console.log(`[AI] 💬 Sending ${formattedText.length} chars to WhatsApp user ${context.waId}`);
                  console.log(`[AI] 📝 Preview: ${formattedText.substring(0, 100)}...`);

                  try {
                    await sendTextMessage(this.getEnv(), context.waId, formattedText);
                    console.log('[AI] ✅ Text response sent successfully via WhatsApp');
                  } catch (error) {
                    console.error('[AI] ❌ Failed to send WhatsApp message:', error);
                  }
                } else {
                  console.log('[AI] ⚠️ No text content to send');
                }
              } else {
                console.log('[AI] 🌐 Web mode - response handled by UI');
              }
            }) as unknown as StreamTextOnFinishCallback<typeof tools>,
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
 * Extract message data from WhatsApp webhook payload
 */
function extractWhatsAppMessage(payload: WhatsAppWebhookPayload): ExtractedWhatsAppMessage | null {
  const entry = payload.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;

  if (!value?.messages || !value?.contacts) {
    return null;
  }

  const contact = value.contacts[0];
  const message = value.messages[0];

  if (!contact || !message || message.type !== 'text' || !message.text?.body) {
    return null;
  }

  return {
    waId: contact.wa_id,
    messageId: message.id,
    phoneNumber: message.from,
    text: message.text.body,
    timestamp: message.timestamp,
  };
}

/**
 * Handle WhatsApp webhook verification (GET /webhook)
 */
function handleWhatsAppVerification(request: Request, env: Env): Response {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  console.log(`[WhatsApp Verification] Received: mode=${mode}, challenge=${challenge}`);

  if (mode === 'subscribe' && token === env.WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ WhatsApp webhook verified successfully!');
    return new Response(challenge || '', { status: 200 });
  } else {
    console.error('❌ WhatsApp webhook verification failed - token mismatch');
    return Response.json({ error: 'Verification failed' }, { status: 403 });
  }
}

/**
 * Handle incoming WhatsApp message (POST /webhook)
 */
async function handleWhatsAppMessage(request: Request, env: Env): Promise<Response> {
  try {
    console.log('[WhatsApp] 📥 Received POST webhook');
    const payload: WhatsAppWebhookPayload = await request.json();
    console.log('[WhatsApp] 📋 Parsed webhook payload');

    const message = extractWhatsAppMessage(payload);

    if (!message) {
      console.log('[WhatsApp] ⏭️  Skipping non-text message or status update');
      return Response.json({ message: 'Not a valid text message' });
    }

    console.log(`[WhatsApp] ✅ Message received from ${message.waId}: ${message.text}`);

    // Get or create Durable Object for this WhatsApp user
    const id = env.Zine.idFromName(`whatsapp:${message.waId}`);
    const stub = env.Zine.get(id);
    console.log(`[WhatsApp] 🔗 Got Durable Object stub for: whatsapp:${message.waId}`);

    // Mark message as read
    await markMessageAsRead(env, message.messageId);
    console.log(`[WhatsApp] ✓ Marked message as read: ${message.messageId}`);

    // Set channel context
    const channelContext: ChannelContext = {
      channel: 'whatsapp',
      waId: message.waId,
      messageId: message.messageId,
      phoneNumber: message.phoneNumber,
    };

    // Set the context on the agent (this will be persisted in the Durable Object state)
    await stub.setChannelContext(channelContext);
    console.log(`[WhatsApp] 📱 Channel context set for WhatsApp user`);

    // Create a UIMessage for the user's text
    const userMessage: UIMessage = {
      id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      role: 'user',
      parts: [
        {
          type: 'text',
          text: message.text,
        }
      ],
    };

    console.log(`[WhatsApp] 💬 Created UIMessage with ID: ${userMessage.id}`);

    // Use built-in saveMessages method (triggers onChatMessage automatically)
    console.log(`[WhatsApp] ⏳ Calling saveMessages()...`);
    await stub.saveMessages([userMessage]);
    console.log(`[WhatsApp] ✨ saveMessages() returned successfully`);
    console.log(`[WhatsApp] 🎯 Agent should now be processing the message`);
    console.log(`[WhatsApp] ✅ Webhook handler completing`);

    return Response.json({ success: true });
  } catch (error) {
    console.error('[WhatsApp] Error processing webhook:', error);
    return Response.json(
      { error: 'Failed to process message' },
      { status: 500 }
    );
  }
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    // WhatsApp webhook routes (handle BEFORE other routing)
    if (url.pathname === "/webhook") {
      if (request.method === "GET") {
        return handleWhatsAppVerification(request, env);
      } else if (request.method === "POST") {
        return handleWhatsAppMessage(request, env);
      }
    }

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
