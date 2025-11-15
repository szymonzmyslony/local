/**
 * User Identity Mapping Service (Phase 2 - TODO)
 *
 * This service will enable linking WhatsApp users to web sessions,
 * allowing users to continue conversations across different channels.
 *
 * IMPLEMENTATION STATUS: NOT YET IMPLEMENTED
 *
 * Current Architecture (Phase 1):
 * - Each channel has separate Durable Objects:
 *   - Web:      env.Zine.idFromName(`web:${sessionId}`)
 *   - WhatsApp: env.Zine.idFromName(`whatsapp:${waId}`)
 * - Each channel maintains independent conversation state
 *
 * Future Architecture (Phase 2):
 * - Unified Durable Objects per user:
 *   - env.Zine.idFromName(`user:${agentId}`)
 * - Cloudflare KV for channel-to-user mapping:
 *   - KV: `whatsapp:${waId}` -> agentId
 *   - KV: `web:${sessionId}` -> agentId
 * - Users can seamlessly switch between web and WhatsApp
 *
 * TODO Implementation Steps:
 * 1. Add KV namespace binding to wrangler.jsonc
 * 2. Implement the functions below
 * 3. Add API endpoint for manual linking (e.g., QR code flow)
 * 4. Migrate existing Durable Objects to new naming scheme
 * 5. Update server.ts to use identity mapping
 */

export interface UserIdentity {
  agentId: string; // Primary identifier (Durable Object ID)
  channels: {
    web?: {
      sessionId: string;
      lastActive: string;
    };
    whatsapp?: {
      waId: string;
      phoneNumber: string;
      lastActive: string;
    };
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * TODO: Get agent ID for a WhatsApp user
 *
 * @param kv - Cloudflare KV namespace for user mappings
 * @param waId - WhatsApp user ID
 * @returns Agent ID or null if not found
 */
export async function getAgentIdForWhatsApp(
  kv: KVNamespace,
  waId: string
): Promise<string | null> {
  // TODO: Implement
  // return await kv.get(`whatsapp:${waId}`);
  throw new Error('Not implemented - Phase 2');
}

/**
 * TODO: Get agent ID for a web session
 *
 * @param kv - Cloudflare KV namespace for user mappings
 * @param sessionId - Web session ID
 * @returns Agent ID or null if not found
 */
export async function getAgentIdForWeb(
  kv: KVNamespace,
  sessionId: string
): Promise<string | null> {
  // TODO: Implement
  // return await kv.get(`web:${sessionId}`);
  throw new Error('Not implemented - Phase 2');
}

/**
 * TODO: Link a WhatsApp account to an agent ID
 *
 * @param kv - Cloudflare KV namespace for user mappings
 * @param waId - WhatsApp user ID
 * @param phoneNumber - User's phone number
 * @param agentId - Agent/user ID to link to
 */
export async function linkWhatsAppToAgent(
  kv: KVNamespace,
  waId: string,
  phoneNumber: string,
  agentId: string
): Promise<void> {
  // TODO: Implement
  // 1. Store mapping: whatsapp:${waId} -> agentId
  // 2. Update user identity record
  throw new Error('Not implemented - Phase 2');
}

/**
 * TODO: Link a web session to an agent ID
 *
 * @param kv - Cloudflare KV namespace for user mappings
 * @param sessionId - Web session ID
 * @param agentId - Agent/user ID to link to
 */
export async function linkWebToAgent(
  kv: KVNamespace,
  sessionId: string,
  agentId: string
): Promise<void> {
  // TODO: Implement
  // 1. Store mapping: web:${sessionId} -> agentId
  // 2. Update user identity record
  throw new Error('Not implemented - Phase 2');
}

/**
 * TODO: Get or create user identity
 *
 * @param kv - Cloudflare KV namespace for user mappings
 * @param agentId - Agent/user ID
 * @returns User identity
 */
export async function getUserIdentity(
  kv: KVNamespace,
  agentId: string
): Promise<UserIdentity | null> {
  // TODO: Implement
  // return await kv.get(`agent:${agentId}:identity`, 'json');
  throw new Error('Not implemented - Phase 2');
}

/**
 * TODO: Update user identity
 *
 * @param kv - Cloudflare KV namespace for user mappings
 * @param agentId - Agent/user ID
 * @param identity - Updated identity data
 */
export async function updateUserIdentity(
  kv: KVNamespace,
  agentId: string,
  identity: UserIdentity
): Promise<void> {
  // TODO: Implement
  // await kv.put(`agent:${agentId}:identity`, JSON.stringify(identity));
  throw new Error('Not implemented - Phase 2');
}

/**
 * Example usage (Phase 2):
 *
 * // In server.ts webhook handler:
 * async function handleWhatsAppMessage(request: Request, env: Env) {
 *   const message = extractWhatsAppMessage(payload);
 *
 *   // Check if user already has an agent ID
 *   let agentId = await getAgentIdForWhatsApp(env.USER_MAPPING, message.waId);
 *
 *   if (!agentId) {
 *     // New user - create agent ID
 *     agentId = crypto.randomUUID();
 *     await linkWhatsAppToAgent(env.USER_MAPPING, message.waId, message.phoneNumber, agentId);
 *   }
 *
 *   // Use unified Durable Object
 *   const id = env.Zine.idFromName(`user:${agentId}`);
 *   const stub = env.Zine.get(id);
 *
 *   // ... rest of processing
 * }
 */
