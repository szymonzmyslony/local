import type { Database } from "@shared";
import type { EventMatchItem, GalleryMatchItem, ToolResultPayload } from "./tool-results";

export type GalleryDistrict = Database["public"]["Enums"]["gallery_district"];

export interface UserRequirements {
  district: GalleryDistrict | null;
  artists: string[];
  aesthetics: string[];
  mood: string | null;
}

export type UserLanguage = "pl" | "en" | null;

export interface SignalCheckResult {
  hasTime: boolean;
  hasLocation: boolean;
  hasInterest: boolean;
  signalCount: number;
  missingSignals: string[];
  suggestedQuestion: string | null;
}

export type SavedEventCard = EventMatchItem;

export interface ZineChatState {
  userRequirements: UserRequirements;
  savedCards: SavedEventCard[];
  lastSearchResults: {
    events: EventMatchItem[];
    galleries: GalleryMatchItem[];
  } | null;
}

export function createInitialUserRequirements(): UserRequirements {
  return {
    district: null,
    artists: [],
    aesthetics: [],
    mood: null
  };
}

export function createInitialChatState(): ZineChatState {
  return {
    userRequirements: createInitialUserRequirements(),
    savedCards: [],
    lastSearchResults: null
  };
}
