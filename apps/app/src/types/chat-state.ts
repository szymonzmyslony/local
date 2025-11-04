import type { Database } from "@shared";
import type { ToolResultPayload } from "./tool-results";

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

export interface SavedEventCard {
  eventId: string;
  eventName: string;
  eventImage: string | null;
  savedAt: string; // ISO string
  eventData: {
    id: string;
    title: string;
    description: string | null;
    startAt: string | null;
    endAt: string | null;
    gallery: {
      id: string;
      name: string | null;
      mainUrl: string | null;
    } | null;
  };
  preferences: {
    district: GalleryDistrict | null;
    mood: string | null;
    aesthetics: string[];
    artists: string[];
    timeWindow: string | null;
  };
}

export interface ChatState {
  userNeeds: string | null;
  userRequirements: UserRequirements;
  recommendation: ToolResultPayload | null;
  userLanguage: UserLanguage;
  savedCards: SavedEventCard[];
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

export function createInitialChatState(): ChatState {
  return {
    userNeeds: null,
    userRequirements: createInitialUserRequirements(),
    recommendation: null,
    userLanguage: null,
    savedCards: []
  };
}
