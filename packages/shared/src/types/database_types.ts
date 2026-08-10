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
      event_candidates: {
        Row: {
          canonical_event_id: string | null
          confidence: number
          decision: string
          gallery_id: string
          id: string
          observed_at: string
          payload: Json
          rejection_reasons: string[]
          run_id: string
          source_fingerprint: string
          source_url: string
        }
        Insert: {
          canonical_event_id?: string | null
          confidence: number
          decision: string
          gallery_id: string
          id?: string
          observed_at?: string
          payload: Json
          rejection_reasons?: string[]
          run_id: string
          source_fingerprint: string
          source_url: string
        }
        Update: {
          canonical_event_id?: string | null
          confidence?: number
          decision?: string
          gallery_id?: string
          id?: string
          observed_at?: string
          payload?: Json
          rejection_reasons?: string[]
          run_id?: string
          source_fingerprint?: string
          source_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_candidates_canonical_event_id_fkey"
            columns: ["canonical_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_candidates_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_candidates_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "observation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      event_info: {
        Row: {
          artists: string[] | null
          data: Json
          description: string | null
          embedding: string | null
          embedding_created_at: string | null
          embedding_model: string | null
          event_id: string
          images: string[] | null
          prices: Json | null
          source_page_id: string | null
          tags: string[] | null
        }
        Insert: {
          artists?: string[] | null
          data?: Json
          description?: string | null
          embedding?: string | null
          embedding_created_at?: string | null
          embedding_model?: string | null
          event_id: string
          images?: string[] | null
          prices?: Json | null
          source_page_id?: string | null
          tags?: string[] | null
        }
        Update: {
          artists?: string[] | null
          data?: Json
          description?: string | null
          embedding?: string | null
          embedding_created_at?: string | null
          embedding_model?: string | null
          event_id?: string
          images?: string[] | null
          prices?: Json | null
          source_page_id?: string | null
          tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "event_info_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_info_source_page_id_fkey"
            columns: ["source_page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          confidence: number | null
          created_at: string
          end_at: string | null
          gallery_id: string
          id: string
          page_id: string | null
          published: boolean
          source_fingerprint: string | null
          source_url: string | null
          start_at: string
          status: Database["public"]["Enums"]["event_status"]
          ticket_url: string | null
          timezone: string | null
          title: string
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          end_at?: string | null
          gallery_id: string
          id?: string
          page_id?: string | null
          published?: boolean
          source_fingerprint?: string | null
          source_url?: string | null
          start_at: string
          status?: Database["public"]["Enums"]["event_status"]
          ticket_url?: string | null
          timezone?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          end_at?: string | null
          gallery_id?: string
          id?: string
          page_id?: string | null
          published?: boolean
          source_fingerprint?: string | null
          source_url?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          ticket_url?: string | null
          timezone?: string | null
          title?: string
          updated_at?: string
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
            foreignKeyName: "events_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: true
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      extraction_evaluations: {
        Row: {
          created_at: string
          duration_ms: number
          error: string | null
          field_accuracy: number | null
          fixture_id: string
          id: string
          model: string
          precision_score: number | null
          recall_score: number | null
          result: Json
          source_url: string
          success: boolean
          technique: string
          token_usage: Json
        }
        Insert: {
          created_at?: string
          duration_ms: number
          error?: string | null
          field_accuracy?: number | null
          fixture_id: string
          id?: string
          model: string
          precision_score?: number | null
          recall_score?: number | null
          result?: Json
          source_url: string
          success: boolean
          technique: string
          token_usage?: Json
        }
        Update: {
          created_at?: string
          duration_ms?: number
          error?: string | null
          field_accuracy?: number | null
          fixture_id?: string
          id?: string
          model?: string
          precision_score?: number | null
          recall_score?: number | null
          result?: Json
          source_url?: string
          success?: boolean
          technique?: string
          token_usage?: Json
        }
        Relationships: []
      }
      galleries: {
        Row: {
          about_url: string | null
          city: string
          country_code: string
          created_at: string
          events_page: string | null
          id: string
          last_observed_at: string | null
          main_url: string
          market: string
          next_observation_at: string | null
          normalized_main_url: string
          observation_interval_hours: number
          observation_status: string
          source_config: Json
          timezone: string
          updated_at: string
        }
        Insert: {
          about_url?: string | null
          city?: string
          country_code?: string
          created_at?: string
          events_page?: string | null
          id?: string
          last_observed_at?: string | null
          main_url: string
          market?: string
          next_observation_at?: string | null
          normalized_main_url: string
          observation_interval_hours?: number
          observation_status?: string
          source_config?: Json
          timezone?: string
          updated_at?: string
        }
        Update: {
          about_url?: string | null
          city?: string
          country_code?: string
          created_at?: string
          events_page?: string | null
          id?: string
          last_observed_at?: string | null
          main_url?: string
          market?: string
          next_observation_at?: string | null
          normalized_main_url?: string
          observation_interval_hours?: number
          observation_status?: string
          source_config?: Json
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      gallery_hours: {
        Row: {
          gallery_id: string
          id: string
          open_minutes: Json
          weekday: number
        }
        Insert: {
          gallery_id: string
          id?: string
          open_minutes?: Json
          weekday: number
        }
        Update: {
          gallery_id?: string
          id?: string
          open_minutes?: Json
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "gallery_hours_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_info: {
        Row: {
          about: string | null
          address: string | null
          area: string | null
          data: Json
          district: Database["public"]["Enums"]["gallery_district"] | null
          email: string | null
          embedding: string | null
          embedding_created_at: string | null
          embedding_model: string | null
          gallery_id: string
          google_maps_url: string | null
          instagram: string | null
          latitude: number | null
          longitude: number | null
          name: string | null
          phone: string | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          about?: string | null
          address?: string | null
          area?: string | null
          data?: Json
          district?: Database["public"]["Enums"]["gallery_district"] | null
          email?: string | null
          embedding?: string | null
          embedding_created_at?: string | null
          embedding_model?: string | null
          gallery_id: string
          google_maps_url?: string | null
          instagram?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          phone?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          about?: string | null
          address?: string | null
          area?: string | null
          data?: Json
          district?: Database["public"]["Enums"]["gallery_district"] | null
          email?: string | null
          embedding?: string | null
          embedding_created_at?: string | null
          embedding_model?: string | null
          gallery_id?: string
          google_maps_url?: string | null
          instagram?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          phone?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gallery_info_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: true
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_sources: {
        Row: {
          consecutive_failures: number
          created_at: string
          enabled: boolean
          fetch_strategy: string
          gallery_id: string
          id: string
          kind: string
          last_changed_at: string | null
          last_checked_at: string | null
          last_content_hash: string | null
          last_etag: string | null
          last_modified: string | null
          normalized_url: string
          updated_at: string
          url: string
        }
        Insert: {
          consecutive_failures?: number
          created_at?: string
          enabled?: boolean
          fetch_strategy?: string
          gallery_id: string
          id?: string
          kind?: string
          last_changed_at?: string | null
          last_checked_at?: string | null
          last_content_hash?: string | null
          last_etag?: string | null
          last_modified?: string | null
          normalized_url: string
          updated_at?: string
          url: string
        }
        Update: {
          consecutive_failures?: number
          created_at?: string
          enabled?: boolean
          fetch_strategy?: string
          gallery_id?: string
          id?: string
          kind?: string
          last_changed_at?: string | null
          last_checked_at?: string | null
          last_content_hash?: string | null
          last_etag?: string | null
          last_modified?: string | null
          normalized_url?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "gallery_sources_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
        ]
      }
      observation_runs: {
        Row: {
          candidates_found: number
          completed_at: string | null
          error: string | null
          events_published: number
          gallery_id: string
          id: string
          idempotency_key: string
          metadata: Json
          model: string
          scheduled_for: string
          sources_attempted: number
          sources_changed: number
          started_at: string
          status: string
          workflow_id: string | null
        }
        Insert: {
          candidates_found?: number
          completed_at?: string | null
          error?: string | null
          events_published?: number
          gallery_id: string
          id?: string
          idempotency_key: string
          metadata?: Json
          model: string
          scheduled_for: string
          sources_attempted?: number
          sources_changed?: number
          started_at?: string
          status?: string
          workflow_id?: string | null
        }
        Update: {
          candidates_found?: number
          completed_at?: string | null
          error?: string | null
          events_published?: number
          gallery_id?: string
          id?: string
          idempotency_key?: string
          metadata?: Json
          model?: string
          scheduled_for?: string
          sources_attempted?: number
          sources_changed?: number
          started_at?: string
          status?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "observation_runs_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
        ]
      }
      page_content: {
        Row: {
          markdown: string | null
          page_id: string
          parsed_at: string | null
        }
        Insert: {
          markdown?: string | null
          page_id: string
          parsed_at?: string | null
        }
        Update: {
          markdown?: string | null
          page_id?: string
          parsed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "page_content_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: true
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      page_structured: {
        Row: {
          data: Json
          extraction_error: string | null
          page_id: string
          parse_status: Database["public"]["Enums"]["parse_status"]
          parsed_at: string | null
          schema_version: string | null
        }
        Insert: {
          data?: Json
          extraction_error?: string | null
          page_id: string
          parse_status?: Database["public"]["Enums"]["parse_status"]
          parsed_at?: string | null
          schema_version?: string | null
        }
        Update: {
          data?: Json
          extraction_error?: string | null
          page_id?: string
          parse_status?: Database["public"]["Enums"]["parse_status"]
          parsed_at?: string | null
          schema_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "page_structured_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: true
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          created_at: string
          fetch_status: Database["public"]["Enums"]["fetch_status"]
          fetched_at: string | null
          gallery_id: string | null
          http_status: number | null
          id: string
          kind: Database["public"]["Enums"]["page_kind"]
          normalized_url: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          fetch_status?: Database["public"]["Enums"]["fetch_status"]
          fetched_at?: string | null
          gallery_id?: string | null
          http_status?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["page_kind"]
          normalized_url: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          fetch_status?: Database["public"]["Enums"]["fetch_status"]
          fetched_at?: string | null
          gallery_id?: string | null
          http_status?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["page_kind"]
          normalized_url?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "pages_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
        ]
      }
      source_snapshots: {
        Row: {
          browser_ms: number | null
          byte_length: number
          changed: boolean
          content_hash: string
          content_type: string | null
          fetched_at: string
          http_status: number | null
          id: string
          metadata: Json
          r2_key: string
          run_id: string
          source_id: string | null
          source_url: string
          strategy: string
        }
        Insert: {
          browser_ms?: number | null
          byte_length: number
          changed: boolean
          content_hash: string
          content_type?: string | null
          fetched_at?: string
          http_status?: number | null
          id?: string
          metadata?: Json
          r2_key: string
          run_id: string
          source_id?: string | null
          source_url: string
          strategy: string
        }
        Update: {
          browser_ms?: number | null
          byte_length?: number
          changed?: boolean
          content_hash?: string
          content_type?: string | null
          fetched_at?: string
          http_status?: number | null
          id?: string
          metadata?: Json
          r2_key?: string
          run_id?: string
          source_id?: string | null
          source_url?: string
          strategy?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_snapshots_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "observation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_snapshots_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "gallery_sources"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_gallery_events: {
        Args: { event_limit?: number; gallery_uuid: string }
        Returns: {
          artists: string[]
          description: string
          end_at: string
          event_id: string
          gallery: Json
          images: string[]
          start_at: string
          status: string
          tags: string[]
          ticket_url: string
          title: string
        }[]
      }
      match_events: {
        Args: {
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          description: string
          id: string
          similarity: number
        }[]
      }
      match_galeries: {
        Args: {
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          about: string
          id: string
          name: string
          similarity: number
        }[]
      }
      match_gallery_with_data: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          about: string
          about_url: string
          address: string
          district: string
          email: string
          events_page: string
          id: string
          instagram: string
          main_url: string
          name: string
          normalized_main_url: string
          phone: string
          similarity: number
          tags: string[]
        }[]
      }
      search_events_filtered: {
        Args: {
          filter_artists?: string[]
          filter_start_after?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          artists: string[]
          description: string
          end_at: string
          event_id: string
          gallery_address: string
          gallery_district: string
          gallery_id: string
          gallery_main_url: string
          gallery_name: string
          images: string[]
          start_at: string
          status: string
          tags: string[]
          ticket_url: string
          timezone: string
          title: string
        }[]
      }
      search_galleries_filtered: {
        Args: {
          filter_district?: string
          filter_time_minutes?: number
          filter_weekday?: number
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          about: string
          about_url: string
          address: string
          district: string
          email: string
          events_page: string
          google_maps_url: string
          id: string
          instagram: string
          main_url: string
          name: string
          phone: string
          tags: string[]
        }[]
      }
      set_event_info_embedding: {
        Args: {
          p_embedding: string
          p_embedding_created_at: string
          p_embedding_model: string
          p_event_id: string
        }
        Returns: undefined
      }
      set_gallery_info_embedding: {
        Args: {
          p_embedding: string
          p_embedding_created_at: string
          p_embedding_model: string
          p_gallery_id: string
        }
        Returns: undefined
      }
      upsert_observed_event_info: {
        Args: {
          p_artists: string[]
          p_data: Json
          p_description: string | null
          p_embedding: string
          p_embedding_created_at: string
          p_embedding_model: string
          p_event_id: string
          p_images: string[]
          p_tags: string[]
        }
        Returns: undefined
      }
    }
    Enums: {
      event_status:
        | "scheduled"
        | "cancelled"
        | "postponed"
        | "rescheduled"
        | "unknown"
      fetch_status: "never" | "queued" | "fetching" | "ok" | "error" | "skipped"
      gallery_district:
        | "Ochota"
        | "Srodmiescie"
        | "Wola"
        | "Bemowo"
        | "Mokotow"
        | "Praga"
        | "Zoliborz"
      page_kind:
        | "init"
        | "gallery_main"
        | "gallery_about"
        | "event"
        | "event_list"
        | "other"
      parse_status: "never" | "queued" | "ok" | "error"
    }
    CompositeTypes: {
      gallery_result: {
        id: string | null
        name: string | null
        main_url: string | null
        normalized_main_url: string | null
      }
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
      event_status: [
        "scheduled",
        "cancelled",
        "postponed",
        "rescheduled",
        "unknown",
      ],
      fetch_status: ["never", "queued", "fetching", "ok", "error", "skipped"],
      gallery_district: [
        "Ochota",
        "Srodmiescie",
        "Wola",
        "Bemowo",
        "Mokotow",
        "Praga",
        "Zoliborz",
      ],
      page_kind: [
        "init",
        "gallery_main",
        "gallery_about",
        "event",
        "event_list",
        "other",
      ],
      parse_status: ["never", "queued", "ok", "error"],
    },
  },
} as const
