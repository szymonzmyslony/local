import type { MarketCode } from "@shared";

export type GalleryDistrict = string;

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
export type EventRequirements = Record<string, never>;

/**
 * Complete user requirements separated by domain
 */
export interface UserRequirements {
  gallery: GalleryRequirements;
  event: EventRequirements;
}

export type EventOccurrence = {
  event_id: string;
  start_at: string;
  end_at: string | null;
  ticket_url: string | null;
  source_url: string | null;
};

export type EventSchedule =
  | { kind: "single"; occurrence: EventOccurrence }
  | { kind: "multiple"; occurrences: EventOccurrence[] };

export type EventCardData = {
  event_id: string;
  title: string;
  description: string | null;
  timezone: string;
  status: string;
  schedule: EventSchedule;
  artists: string[];
  tags: string[];
  images: string[];
  gallery: {
    id: string;
    name: string | null;
    main_url: string;
    area: string | null;
    address: string | null;
  };
};

export type SavedEventCard = EventCardData;

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
export type ZineChatState =
  | { kind: "unconfigured" }
  | {
      kind: "ready";
      market: MarketCode;
      savedCards: SavedEventCard[];
      channel: { kind: "web" } | { kind: "whatsapp" };
    };

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

export function createInitialChatState(): ZineChatState {
  return { kind: "unconfigured" };
}
