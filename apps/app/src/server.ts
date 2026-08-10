import { createWhatsAppAdapter } from "@chat-adapter/whatsapp";
import { Think, type StepContext, type TurnConfig } from "@cloudflare/think";
import {
  createZineLanguageModel,
  getMarketConfig,
  marketFromAgentName
} from "@shared";
import {
  chatSdkMessenger,
  ThinkMessengerStateAgent,
  type ThinkMessengers
} from "@cloudflare/think/messengers";
import { getAgentByName, routeAgentRequest } from "agents";
import { getZineSystemPrompt } from "./prompts";
import { createZineTools, ZINE_TOOL_NAMES } from "./tools";
import type { ZineChatState } from "./types/chat-state";
import { createInitialChatState } from "./types/chat-state";

export { ThinkMessengerStateAgent };

/**
 * Zine's durable conversational agent.
 *
 * Think owns the inference loop, durable message history, stream recovery,
 * tool execution, and Chat SDK conversation sub-agents.
 */
export class Zine extends Think<Env, ZineChatState> {
  override initialState = createInitialChatState();
  override includeMcpTools = false;
  override workspaceBash = false;
  override maxSteps = 4;
  override chatStreamStallTimeoutMs = 120_000;

  override getModel() {
    return createZineLanguageModel(this.env.OPENROUTER_API_KEY);
  }

  private getMarket() {
    return getMarketConfig(marketFromAgentName(this.name));
  }

  private ensureConfiguredState(channel: "web" | "whatsapp") {
    const market = this.getMarket().market;
    if (
      this.state.kind !== "ready" ||
      this.state.market !== market ||
      this.state.channel.kind !== channel
    ) {
      this.setState({
        kind: "ready",
        market,
        savedCards: this.state.kind === "ready" ? this.state.savedCards : [],
        channel: { kind: channel }
      });
    }
  }

  override async onStart() {
    this.ensureConfiguredState(
      this.name.includes("whatsapp") ? "whatsapp" : "web"
    );
  }

  override getSystemPrompt(): string {
    return getZineSystemPrompt("web", this.getMarket());
  }

  override getTools() {
    return createZineTools(this.env, this.getMarket());
  }

  override beforeTurn(): TurnConfig {
    const channel =
      this.getMessengerContext()?.provider === "whatsapp" ? "whatsapp" : "web";
    this.ensureConfiguredState(channel);

    return {
      instructions: getZineSystemPrompt(channel, this.getMarket()),
      activeTools: [...ZINE_TOOL_NAMES],
      maxSteps: this.maxSteps,
      maxOutputTokens: 4096,
      sendReasoning: false,
      providerOptions: {
        openrouter: {
          reasoning: { effort: "none", exclude: true }
        }
      }
    };
  }

  override onStepFinish(ctx: StepContext) {
    console.log(
      JSON.stringify({
        event: "zine_step_finished",
        market: this.getMarket().market,
        step: ctx.stepNumber,
        finishReason: ctx.finishReason,
        rawFinishReason: ctx.rawFinishReason,
        textLength: ctx.text.length,
        toolCalls: ctx.toolCalls.length,
        usage: ctx.usage
      })
    );
  }

  override getMessengers(): ThinkMessengers {
    if (
      !this.env.WHATSAPP_ACCESS_TOKEN ||
      !this.env.WHATSAPP_APP_SECRET ||
      !this.env.WHATSAPP_PHONE_NUMBER_ID ||
      !this.env.WHATSAPP_VERIFY_TOKEN
    ) {
      console.warn(
        JSON.stringify({
          event: "whatsapp_disabled",
          reason: "missing_first_party_chat_sdk_credentials"
        })
      );
      return {};
    }
    return {
      whatsapp: chatSdkMessenger({
        adapter: createWhatsAppAdapter({
          accessToken: this.env.WHATSAPP_ACCESS_TOKEN,
          appSecret: this.env.WHATSAPP_APP_SECRET,
          phoneNumberId: this.env.WHATSAPP_PHONE_NUMBER_ID,
          verifyToken: this.env.WHATSAPP_VERIFY_TOKEN,
          userName: "zine"
        }),
        path: "/webhook",
        provider: "whatsapp",
        respondTo: ["direct-message", "action"],
        userName: "zine",
        // The WhatsApp adapter performs GET challenge verification and POST
        // X-Hub-Signature-256 validation itself.
        verifyWebhook: false
      })
    };
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/webhook") {
      const ingress = await getAgentByName<Env, Zine>(env.Zine, "ldn-whatsapp-v2");
      return ingress.fetch(request);
    }

    if (url.pathname === "/health") {
      return Response.json({
        ok: Boolean(env.OPENROUTER_API_KEY && env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
        model: "openai/gpt-5.6-luna",
        whatsappConfigured: Boolean(
          env.WHATSAPP_ACCESS_TOKEN &&
            env.WHATSAPP_APP_SECRET &&
            env.WHATSAPP_PHONE_NUMBER_ID &&
            env.WHATSAPP_VERIFY_TOKEN
        )
      });
    }

    if (!env.OPENROUTER_API_KEY) {
      console.error(
        JSON.stringify({
          event: "configuration_error",
          missingBinding: "OPENROUTER_API_KEY"
        })
      );
    }

    const routed = await routeAgentRequest(request, env);
    if (routed) return routed;

    return new Response("Not found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;
