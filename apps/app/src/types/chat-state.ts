import type { Database } from "@shared";
import type { EventMatchItem, GalleryMatchItem, ToolResultPayload } from "./tool-results";

export type GalleryDistrict = Database["public"]["Enums"]["gallery_district"];

export type DayPeriod = "morning" | "noon" | "afternoon" | "evening" | "night";

export interface TimePreferences {
  months: string[];
  weeks: string[];
  dayPeriods: DayPeriod[];
  specificHours: string[];
}

export interface UserRequirements {
  district: GalleryDistrict | null;
  artists: string[];
  aesthetics: string[];
  mood: string | null;
  time: TimePreferences;
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

export function createInitialTimePreferences(): TimePreferences {
  return {
    months: [],
    weeks: [],
    dayPeriods: [],
    specificHours: []
  };
}

export function createInitialUserRequirements(): UserRequirements {
  return {
    district: null,
    artists: [],
    aesthetics: [],
    mood: null,
    time: createInitialTimePreferences()
  };
}

export function createInitialChatState(): ZineChatState {
  return {
    userRequirements: createInitialUserRequirements(),
    savedCards: [],
    lastSearchResults: null
  };
}
