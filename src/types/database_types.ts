export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      artists: {
        Row: {
          bio: string | null
          created_at: number
          embedding: string | null
          id: string
          name: string
          updated_at: number
          website: string | null
        }
        Insert: {
          bio?: string | null
          created_at: number
          embedding?: string | null
          id: string
          name: string
          updated_at: number
          website?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: number
          embedding?: string | null
          id?: string
          name?: string
          updated_at?: number
          website?: string | null
        }
        Relationships: []
      }
      event_artists: {
        Row: {
          artist_id: string
          event_id: string
        }
        Insert: {
          artist_id: string
          event_id: string
        }
        Update: {
          artist_id?: string
          event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_artists_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_artists_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          category: Database["public"]["Enums"]["event_category"]
          created_at: number
          description: string
          embedding: string | null
          end: number | null
          event_type: Database["public"]["Enums"]["event_type"]
          gallery_id: string
          id: string
          price: number
          scraped_page_id: string
          start: number | null
          tags: Json
          title: string
          updated_at: number
          url: string
        }
        Insert: {
          category: Database["public"]["Enums"]["event_category"]
          created_at: number
          description: string
          embedding?: string | null
          end?: number | null
          event_type: Database["public"]["Enums"]["event_type"]
          gallery_id: string
          id: string
          price: number
          scraped_page_id: string
          start?: number | null
          tags: Json
          title: string
          updated_at: number
          url: string
        }
        Update: {
          category?: Database["public"]["Enums"]["event_category"]
          created_at?: number
          description?: string
          embedding?: string | null
          end?: number | null
          event_type?: Database["public"]["Enums"]["event_type"]
          gallery_id?: string
          id?: string
          price?: number
          scraped_page_id?: string
          start?: number | null
          tags?: Json
          title?: string
          updated_at?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_scraped_page_id_fkey"
            columns: ["scraped_page_id"]
            isOneToOne: false
            referencedRelation: "scraped_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      galleries: {
        Row: {
          city: string
          created_at: number
          embedding: string | null
          gallery_type: Database["public"]["Enums"]["gallery_type"] | null
          id: string
          name: string
          tz: string
          updated_at: number
          website: string
        }
        Insert: {
          city: string
          created_at: number
          embedding?: string | null
          gallery_type?: Database["public"]["Enums"]["gallery_type"] | null
          id: string
          name: string
          tz?: string
          updated_at: number
          website: string
        }
        Update: {
          city?: string
          created_at?: number
          embedding?: string | null
          gallery_type?: Database["public"]["Enums"]["gallery_type"] | null
          id?: string
          name?: string
          tz?: string
          updated_at?: number
          website?: string
        }
        Relationships: []
      }
      scraped_pages: {
        Row: {
          classification:
            | Database["public"]["Enums"]["page_classification"]
            | null
          gallery_id: string
          id: string
          markdown: string
          metadata: Json
          scraped_at: number
          url: string
        }
        Insert: {
          classification?:
            | Database["public"]["Enums"]["page_classification"]
            | null
          gallery_id: string
          id: string
          markdown: string
          metadata: Json
          scraped_at: number
          url: string
        }
        Update: {
          classification?:
            | Database["public"]["Enums"]["page_classification"]
            | null
          gallery_id?: string
          id?: string
          markdown?: string
          metadata?: Json
          scraped_at?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "scraped_pages_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      event_category:
        | "contemporary"
        | "modern"
        | "photography"
        | "design_architecture"
        | "digital_new_media"
        | "performance_live_art"
        | "social_critical_art"
        | "emerging_artists"
      event_type: "opening" | "reception" | "talk" | "workshop" | "exhibition"
      gallery_type:
        | "commercial"
        | "non-profit"
        | "museum"
        | "artist-run"
        | "project-space"
      page_classification:
        | "event"
        | "historical_event"
        | "creator_info"
        | "artists"
        | "other"
        | "multiple_events"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      event_category: [
        "contemporary",
        "modern",
        "photography",
        "design_architecture",
        "digital_new_media",
        "performance_live_art",
        "social_critical_art",
        "emerging_artists",
      ],
      event_type: ["opening", "reception", "talk", "workshop", "exhibition"],
      gallery_type: [
        "commercial",
        "non-profit",
        "museum",
        "artist-run",
        "project-space",
      ],
      page_classification: [
        "event",
        "historical_event",
        "creator_info",
        "artists",
        "other",
        "multiple_events",
      ],
    },
  },
} as const
