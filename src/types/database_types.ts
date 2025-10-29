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
          md: string | null
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
          md?: string | null
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
          md?: string | null
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
      event_occurrences: {
        Row: {
          end_at: string | null
          event_id: string
          id: string
          start_at: string
          timezone: string | null
        }
        Insert: {
          end_at?: string | null
          event_id: string
          id?: string
          start_at: string
          timezone?: string | null
        }
        Update: {
          end_at?: string | null
          event_id?: string
          id?: string
          start_at?: string
          timezone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_occurrences_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          end_at: string | null
          gallery_id: string
          id: string
          page_id: string | null
          start_at: string | null
          status: Database["public"]["Enums"]["event_status"]
          ticket_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_at?: string | null
          gallery_id: string
          id?: string
          page_id?: string | null
          start_at?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          ticket_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_at?: string | null
          gallery_id?: string
          id?: string
          page_id?: string | null
          start_at?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          ticket_url?: string | null
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
      galleries: {
        Row: {
          about_url: string | null
          created_at: string
          id: string
          main_url: string
          normalized_main_url: string
          updated_at: string
        }
        Insert: {
          about_url?: string | null
          created_at?: string
          id?: string
          main_url: string
          normalized_main_url: string
          updated_at?: string
        }
        Update: {
          about_url?: string | null
          created_at?: string
          id?: string
          main_url?: string
          normalized_main_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      gallery_hours: {
        Row: {
          close_time: string
          dow: number
          gallery_id: string
          id: string
          open_time: string
        }
        Insert: {
          close_time: string
          dow: number
          gallery_id: string
          id?: string
          open_time: string
        }
        Update: {
          close_time?: string
          dow?: number
          gallery_id?: string
          id?: string
          open_time?: string
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
          data: Json
          email: string | null
          embedding: string | null
          embedding_created_at: string | null
          embedding_model: string | null
          gallery_id: string
          instagram: string | null
          name: string | null
          phone: string | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          about?: string | null
          address?: string | null
          data?: Json
          email?: string | null
          embedding?: string | null
          embedding_created_at?: string | null
          embedding_model?: string | null
          gallery_id: string
          instagram?: string | null
          name?: string | null
          phone?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          about?: string | null
          address?: string | null
          data?: Json
          email?: string | null
          embedding?: string | null
          embedding_created_at?: string | null
          embedding_model?: string | null
          gallery_id?: string
          instagram?: string | null
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
          extracted_page_kind: Database["public"]["Enums"]["page_kind"] | null
          extraction_error: string | null
          page_id: string
          parse_status: Database["public"]["Enums"]["parse_status"]
          parsed_at: string | null
          schema_version: string | null
        }
        Insert: {
          data?: Json
          extracted_page_kind?: Database["public"]["Enums"]["page_kind"] | null
          extraction_error?: string | null
          page_id: string
          parse_status?: Database["public"]["Enums"]["parse_status"]
          parsed_at?: string | null
          schema_version?: string | null
        }
        Update: {
          data?: Json
          extracted_page_kind?: Database["public"]["Enums"]["page_kind"] | null
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
          kind: Database["public"]["Enums"]["page_kind"]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      event_status:
        | "scheduled"
        | "cancelled"
        | "postponed"
        | "rescheduled"
        | "unknown"
      fetch_status: "never" | "queued" | "fetching" | "ok" | "error" | "skipped"
      page_kind:
        | "gallery_main"
        | "gallery_about"
        | "event_list"
        | "event_detail"
        | "other"
        | "event_candidate"
      parse_status: "never" | "queued" | "ok" | "error"
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
      event_status: [
        "scheduled",
        "cancelled",
        "postponed",
        "rescheduled",
        "unknown",
      ],
      fetch_status: ["never", "queued", "fetching", "ok", "error", "skipped"],
      page_kind: [
        "gallery_main",
        "gallery_about",
        "event_list",
        "event_detail",
        "other",
        "event_candidate",
      ],
      parse_status: ["never", "queued", "ok", "error"],
    },
  },
} as const
