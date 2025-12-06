/**
 * WhatsApp Business API Service
 *
 * Provides functions for interacting with the WhatsApp Business Cloud API:
 * - sendTextMessage: Send a text message to a WhatsApp user
 * - markMessageAsRead: Send a read receipt for a message
 * - formatForWhatsApp: Format markdown text for WhatsApp (converts **bold** to *bold*, etc.)
 *
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 */


export function formatForWhatsApp(text: string): string {
  // First, replace all markdown bold **text** with a placeholder to avoid conflicts
  const boldPlaceholder = "___BOLD_PLACEHOLDER___";
  let formatted = text.replace(/\*\*(.+?)\*\*/g, (match, content) => {
    return `${boldPlaceholder}${content}${boldPlaceholder}`;
  });

  // Convert markdown italic *text* to WhatsApp _text_
  formatted = formatted.replace(/\*([^*\n]+?)\*/g, "_$1_");

  // Restore bold placeholders as WhatsApp *bold*
  formatted = formatted.replace(new RegExp(boldPlaceholder, "g"), "*");

  // Convert headers to bold
  formatted = formatted
    .replace(/^### (.+)$/gm, "*$1*")
    .replace(/^## (.+)$/gm, "*$1*")
    .replace(/^# (.+)$/gm, "*$1*");

  // Clean up excessive line breaks (more than 2 consecutive)
  formatted = formatted.replace(/\n{3,}/g, "\n\n");

  // Trim whitespace
  return formatted.trim();
}

/**
 * Send a text message via WhatsApp Business API
 *
 * @param env - Cloudflare Worker environment with FACEBOOK_AUTH_TOKEN and SENDER_PHONE
 * @param recipient - WhatsApp ID (wa_id) of the recipient
 * @param message - Text message to send (supports WhatsApp formatting: *bold*, _italic_, ~strikethrough~)
 */
export async function sendTextMessage(
  env: { FACEBOOK_AUTH_TOKEN: string; SENDER_PHONE: string },
  recipient: string,
  message: string
): Promise<void> {
  const url = `https://graph.facebook.com/v22.0/${env.SENDER_PHONE}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to: recipient,
    type: "text",
    text: { body: message }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.FACEBOOK_AUTH_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("[WhatsApp API] Failed to send message:", error);
    throw new Error(`Failed to send WhatsApp message: ${error}`);
  }

  console.log("[WhatsApp API] Message sent successfully to:", recipient);
}

/**
 * Mark a WhatsApp message as read
 *
 * @param env - Cloudflare Worker environment with FACEBOOK_AUTH_TOKEN and SENDER_PHONE
 * @param messageId - ID of the message to mark as read
 */
export async function markMessageAsRead(
  env: { FACEBOOK_AUTH_TOKEN: string; SENDER_PHONE: string },
  messageId: string
): Promise<void> {
  const url = `https://graph.facebook.com/v22.0/${env.SENDER_PHONE}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.FACEBOOK_AUTH_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    console.warn(
      "[WhatsApp API] Failed to mark message as read:",
      await response.text()
    );
    // Non-critical, don't throw
  }
}
