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
      golden_artists: {
        Row: {
          bio: string | null
          entity_id: string
          name: string
          socials: string[]
          updated_at: string
          website: string | null
        }
        Insert: {
          bio?: string | null
          entity_id: string
          name: string
          socials?: string[]
          updated_at?: string
          website?: string | null
        }
        Update: {
          bio?: string | null
          entity_id?: string
          name?: string
          socials?: string[]
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golden_artists_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: true
            referencedRelation: "identity_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      golden_event_artists: {
        Row: {
          artist_entity_id: string
          event_entity_id: string
          role: string | null
        }
        Insert: {
          artist_entity_id: string
          event_entity_id: string
          role?: string | null
        }
        Update: {
          artist_entity_id?: string
          event_entity_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golden_event_artists_artist_entity_id_fkey"
            columns: ["artist_entity_id"]
            isOneToOne: false
            referencedRelation: "golden_artists"
            referencedColumns: ["entity_id"]
          },
          {
            foreignKeyName: "golden_event_artists_event_entity_id_fkey"
            columns: ["event_entity_id"]
            isOneToOne: false
            referencedRelation: "golden_events"
            referencedColumns: ["entity_id"]
          },
        ]
      }
      golden_events: {
        Row: {
          description: string | null
          end_ts: string | null
          entity_id: string
          start_ts: string | null
          title: string
          updated_at: string
          url: string | null
          venue_text: string | null
        }
        Insert: {
          description?: string | null
          end_ts?: string | null
          entity_id: string
          start_ts?: string | null
          title: string
          updated_at?: string
          url?: string | null
          venue_text?: string | null
        }
        Update: {
          description?: string | null
          end_ts?: string | null
          entity_id?: string
          start_ts?: string | null
          title?: string
          updated_at?: string
          url?: string | null
          venue_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golden_events_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: true
            referencedRelation: "identity_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      golden_galleries: {
        Row: {
          address: string | null
          description: string | null
          entity_id: string
          name: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          description?: string | null
          entity_id: string
          name: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          description?: string | null
          entity_id?: string
          name?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golden_galleries_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: true
            referencedRelation: "identity_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_entities: {
        Row: {
          alias_of: string | null
          created_at: string
          display_name: string
          embedding: string | null
          entity_type: Database["public"]["Enums"]["entity_type"]
          id: string
          updated_at: string
        }
        Insert: {
          alias_of?: string | null
          created_at?: string
          display_name: string
          embedding?: string | null
          entity_type: Database["public"]["Enums"]["entity_type"]
          id?: string
          updated_at?: string
        }
        Update: {
          alias_of?: string | null
          created_at?: string
          display_name?: string
          embedding?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"]
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "identity_entities_alias_of_fkey"
            columns: ["alias_of"]
            isOneToOne: false
            referencedRelation: "identity_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_event_artists: {
        Row: {
          artist_entity_id: string
          event_entity_id: string
        }
        Insert: {
          artist_entity_id: string
          event_entity_id: string
        }
        Update: {
          artist_entity_id?: string
          event_entity_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "identity_event_artists_artist_entity_id_fkey"
            columns: ["artist_entity_id"]
            isOneToOne: false
            referencedRelation: "identity_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_event_artists_event_entity_id_fkey"
            columns: ["event_entity_id"]
            isOneToOne: false
            referencedRelation: "identity_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_links: {
        Row: {
          a_id: string
          b_id: string
          created_at: string
          created_by: Database["public"]["Enums"]["link_created_by"]
          entity_type: Database["public"]["Enums"]["entity_type"]
          id: string
          relation: Database["public"]["Enums"]["link_relation"]
          score: number | null
        }
        Insert: {
          a_id: string
          b_id: string
          created_at?: string
          created_by?: Database["public"]["Enums"]["link_created_by"]
          entity_type: Database["public"]["Enums"]["entity_type"]
          id?: string
          relation: Database["public"]["Enums"]["link_relation"]
          score?: number | null
        }
        Update: {
          a_id?: string
          b_id?: string
          created_at?: string
          created_by?: Database["public"]["Enums"]["link_created_by"]
          entity_type?: Database["public"]["Enums"]["entity_type"]
          id?: string
          relation?: Database["public"]["Enums"]["link_relation"]
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "identity_links_a_id_fkey"
            columns: ["a_id"]
            isOneToOne: false
            referencedRelation: "identity_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_links_b_id_fkey"
            columns: ["b_id"]
            isOneToOne: false
            referencedRelation: "identity_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          created_at: string
          fetched_at: string | null
          md: string | null
          site_id: string | null
          status: number | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          fetched_at?: string | null
          md?: string | null
          site_id?: string | null
          status?: number | null
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          fetched_at?: string | null
          md?: string | null
          site_id?: string | null
          status?: number | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      sites: {
        Row: {
          created_at: string
          domain: string
          id: string
          notes: string | null
          seeds: string[]
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          notes?: string | null
          seeds?: string[]
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          notes?: string | null
          seeds?: string[]
        }
        Relationships: []
      }
      source_artists: {
        Row: {
          bio: string | null
          created_at: string
          id: string
          identity_entity_id: string | null
          name: string
          page_url: string
          socials: string[]
          website: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          id?: string
          identity_entity_id?: string | null
          name: string
          page_url: string
          socials?: string[]
          website?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          id?: string
          identity_entity_id?: string | null
          name?: string
          page_url?: string
          socials?: string[]
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "source_artists_identity_entity_id_fkey"
            columns: ["identity_entity_id"]
            isOneToOne: false
            referencedRelation: "identity_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_artists_page_url_fkey"
            columns: ["page_url"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["url"]
          },
        ]
      }
      source_events: {
        Row: {
          created_at: string
          description: string | null
          end_ts: string | null
          id: string
          identity_entity_id: string | null
          page_url: string
          participants: string[]
          start_ts: string | null
          title: string
          url: string | null
          venue_name: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_ts?: string | null
          id?: string
          identity_entity_id?: string | null
          page_url: string
          participants?: string[]
          start_ts?: string | null
          title: string
          url?: string | null
          venue_name?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          end_ts?: string | null
          id?: string
          identity_entity_id?: string | null
          page_url?: string
          participants?: string[]
          start_ts?: string | null
          title?: string
          url?: string | null
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "source_events_identity_entity_id_fkey"
            columns: ["identity_entity_id"]
            isOneToOne: false
            referencedRelation: "identity_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_events_page_url_fkey"
            columns: ["page_url"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["url"]
          },
        ]
      }
      source_galleries: {
        Row: {
          address: string | null
          created_at: string
          description: string | null
          id: string
          identity_entity_id: string | null
          name: string
          page_url: string
          website: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          description?: string | null
          id?: string
          identity_entity_id?: string | null
          name: string
          page_url: string
          website?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          description?: string | null
          id?: string
          identity_entity_id?: string | null
          name?: string
          page_url?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "source_galleries_identity_entity_id_fkey"
            columns: ["identity_entity_id"]
            isOneToOne: false
            referencedRelation: "identity_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_galleries_page_url_fkey"
            columns: ["page_url"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["url"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      identity_family: {
        Args: { canon: string }
        Returns: {
          id: string
        }[]
      }
      match_identity_entities: {
        Args: {
          k: number
          q: string
          t: Database["public"]["Enums"]["entity_type"]
        }
        Returns: {
          distance: number
          id: string
        }[]
      }
      merge_identity_entities: {
        Args: {
          loser: string
          t: Database["public"]["Enums"]["entity_type"]
          winner: string
        }
        Returns: undefined
      }
      resolve_canonical: { Args: { e: string }; Returns: string }
    }
    Enums: {
      entity_type: "artist" | "gallery" | "event"
      link_created_by: "system" | "human"
      link_relation: "similar" | "same"
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
      entity_type: ["artist", "gallery", "event"],
      link_created_by: ["system", "human"],
      link_relation: ["similar", "same"],
    },
  },
} as const
