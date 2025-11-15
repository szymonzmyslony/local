/**
 * WhatsApp Webhook Types
 *
 * Types for incoming WhatsApp webhook payloads from Meta's Graph API
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */

export interface WhatsAppContact {
  wa_id: string;
  profile: {
    name: string;
  };
}

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  text?: {
    body: string;
  };
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'contacts';
}

export interface WhatsAppValue {
  messaging_product: 'whatsapp';
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: unknown[];
}

export interface WhatsAppChange {
  value: WhatsAppValue;
  field: string;
}

export interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppWebhookPayload {
  object: 'whatsapp_business_account';
  entry: WhatsAppEntry[];
}

/**
 * Extracted message data for internal processing
 */
export interface ExtractedWhatsAppMessage {
  waId: string;
  messageId: string;
  phoneNumber: string;
  text: string;
  timestamp: string;
}
