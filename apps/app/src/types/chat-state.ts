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

export interface ChatState {
  userNeeds: string | null;
  userRequirements: UserRequirements;
  recommendation: ToolResultPayload | null;
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
    recommendation: null
  };
}
