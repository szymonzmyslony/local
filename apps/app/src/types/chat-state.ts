import type { Database } from "@shared";

export type GalleryDistrict = Database["public"]["Enums"]["gallery_district"];

/**
 * Gallery-specific user requirements
 */
export interface GalleryRequirements {
  district: GalleryDistrict | null;
  aesthetics: string[];
  mood: string | null;
  preferredTime: {
    weekday: number;        // 0-6 (0=Sunday)
    timeMinutes: number;    // 0-1439 (minutes since midnight)
  } | null;
}

/**
 * Event-specific requirements (empty for now - implement later)
 */
export interface EventRequirements {
  // TODO: Implement when adding event search
}

/**
 * Complete user requirements separated by domain
 */
export interface UserRequirements {
  gallery: GalleryRequirements;
  event: EventRequirements;
}

/**
 * Saved event card type (from get_gallery_events)
 */
export type SavedEventCard = Database["public"]["Functions"]["get_gallery_events"]["Returns"][number];

/**
 * Channel Context - Discriminated union for different conversation channels
 *
 * This allows the same agent to work across multiple platforms (web, WhatsApp, etc.)
 * while adapting its behavior based on the channel.
 *
 * Future: Can be extended with telegram, sms, etc.
 */
export type ChannelContext =
  | {
    channel: 'web';
    sessionId: string;
  }
  | {
    channel: 'whatsapp';
    waId: string;           // WhatsApp user ID
    messageId: string;      // Current message ID (for read receipts)
    phoneNumber: string;    // User's phone number
  };

/**
 * Chat state - no search result storage (stateless retrieval)
 */
export interface ZineChatState {
  // userRequirements: UserRequirements;
  savedCards: SavedEventCard[];
  channelContext?: ChannelContext; // Optional to support initialState, set on first message
}

export function createInitialGalleryRequirements(): GalleryRequirements {
  return {
    district: null,
    aesthetics: [],
    mood: null,
    preferredTime: null
  };
}

export function createInitialUserRequirements(): UserRequirements {
  return {
    gallery: createInitialGalleryRequirements(),
    event: {}
  };
}

export function createInitialChatState(channelContext?: ChannelContext): ZineChatState {
  return {
    // userRequirements: createInitialUserRequirements(),
    savedCards: [],
    channelContext,
  };
}
