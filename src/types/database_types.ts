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
      cluster_event_participants: {
        Row: {
          artist_cluster_id: string
          event_cluster_id: string
          role: string | null
        }
        Insert: {
          artist_cluster_id: string
          event_cluster_id: string
          role?: string | null
        }
        Update: {
          artist_cluster_id?: string
          event_cluster_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cluster_event_participants_artist_fkey"
            columns: ["artist_cluster_id"]
            isOneToOne: false
            referencedRelation: "golden_artists"
            referencedColumns: ["cluster_id"]
          },
          {
            foreignKeyName: "cluster_event_participants_event_fkey"
            columns: ["event_cluster_id"]
            isOneToOne: false
            referencedRelation: "golden_events"
            referencedColumns: ["cluster_id"]
          },
        ]
      }
      crawl_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          force: boolean | null
          id: string
          include_subdomains: boolean | null
          max_pages: number | null
          search_term: string | null
          seed_url: string
          status: Database["public"]["Enums"]["crawl_status"]
          updated_at: string
          urls_discovered: number
          urls_fetched: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          force?: boolean | null
          id?: string
          include_subdomains?: boolean | null
          max_pages?: number | null
          search_term?: string | null
          seed_url: string
          status?: Database["public"]["Enums"]["crawl_status"]
          updated_at?: string
          urls_discovered?: number
          urls_fetched?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          force?: boolean | null
          id?: string
          include_subdomains?: boolean | null
          max_pages?: number | null
          search_term?: string | null
          seed_url?: string
          status?: Database["public"]["Enums"]["crawl_status"]
          updated_at?: string
          urls_discovered?: number
          urls_fetched?: number
        }
        Relationships: []
      }
      discovered_urls: {
        Row: {
          discovered_at: string
          error_message: string | null
          fetch_attempts: number
          job_id: string
          last_attempt_at: string | null
          status: Database["public"]["Enums"]["url_fetch_status"]
          url: string
        }
        Insert: {
          discovered_at?: string
          error_message?: string | null
          fetch_attempts?: number
          job_id: string
          last_attempt_at?: string | null
          status?: Database["public"]["Enums"]["url_fetch_status"]
          url: string
        }
        Update: {
          discovered_at?: string
          error_message?: string | null
          fetch_attempts?: number
          job_id?: string
          last_attempt_at?: string | null
          status?: Database["public"]["Enums"]["url_fetch_status"]
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "discovered_urls_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "crawl_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      extracted_artist_links: {
        Row: {
          created_at: string | null
          curator_decided_at: string | null
          curator_decision:
            | Database["public"]["Enums"]["similarity_decision"]
            | null
          curator_notes: string | null
          similarity_score: number
          source_a_id: string
          source_b_id: string
        }
        Insert: {
          created_at?: string | null
          curator_decided_at?: string | null
          curator_decision?:
            | Database["public"]["Enums"]["similarity_decision"]
            | null
          curator_notes?: string | null
          similarity_score: number
          source_a_id: string
          source_b_id: string
        }
        Update: {
          created_at?: string | null
          curator_decided_at?: string | null
          curator_decision?:
            | Database["public"]["Enums"]["similarity_decision"]
            | null
          curator_notes?: string | null
          similarity_score?: number
          source_a_id?: string
          source_b_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extracted_artist_links_source_a_id_fkey"
            columns: ["source_a_id"]
            isOneToOne: false
            referencedRelation: "extracted_artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracted_artist_links_source_b_id_fkey"
            columns: ["source_b_id"]
            isOneToOne: false
            referencedRelation: "extracted_artists"
            referencedColumns: ["id"]
          },
        ]
      }
      extracted_artists: {
        Row: {
          bio: string | null
          cluster_id: string | null
          created_at: string
          embedding: string | null
          id: string
          name: string
          page_url: string
          review_status: Database["public"]["Enums"]["review_status"] | null
          reviewed_at: string | null
          reviewed_by: string | null
          socials: string[]
          website: string | null
        }
        Insert: {
          bio?: string | null
          cluster_id?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          name: string
          page_url: string
          review_status?: Database["public"]["Enums"]["review_status"] | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          socials?: string[]
          website?: string | null
        }
        Update: {
          bio?: string | null
          cluster_id?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          name?: string
          page_url?: string
          review_status?: Database["public"]["Enums"]["review_status"] | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          socials?: string[]
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extracted_artists_page_url_fkey"
            columns: ["page_url"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["url"]
          },
        ]
      }
      extracted_event_links: {
        Row: {
          created_at: string | null
          curator_decided_at: string | null
          curator_decision:
            | Database["public"]["Enums"]["similarity_decision"]
            | null
          curator_notes: string | null
          similarity_score: number
          source_a_id: string
          source_b_id: string
        }
        Insert: {
          created_at?: string | null
          curator_decided_at?: string | null
          curator_decision?:
            | Database["public"]["Enums"]["similarity_decision"]
            | null
          curator_notes?: string | null
          similarity_score: number
          source_a_id: string
          source_b_id: string
        }
        Update: {
          created_at?: string | null
          curator_decided_at?: string | null
          curator_decision?:
            | Database["public"]["Enums"]["similarity_decision"]
            | null
          curator_notes?: string | null
          similarity_score?: number
          source_a_id?: string
          source_b_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extracted_event_links_source_a_id_fkey"
            columns: ["source_a_id"]
            isOneToOne: false
            referencedRelation: "extracted_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracted_event_links_source_b_id_fkey"
            columns: ["source_b_id"]
            isOneToOne: false
            referencedRelation: "extracted_events"
            referencedColumns: ["id"]
          },
        ]
      }
      extracted_events: {
        Row: {
          cluster_id: string | null
          created_at: string
          description: string | null
          embedding: string | null
          end_ts: string | null
          id: string
          page_url: string
          participants: string[]
          review_status: Database["public"]["Enums"]["review_status"] | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_ts: string | null
          title: string
          url: string | null
          venue_name: string | null
        }
        Insert: {
          cluster_id?: string | null
          created_at?: string
          description?: string | null
          embedding?: string | null
          end_ts?: string | null
          id?: string
          page_url: string
          participants?: string[]
          review_status?: Database["public"]["Enums"]["review_status"] | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_ts?: string | null
          title: string
          url?: string | null
          venue_name?: string | null
        }
        Update: {
          cluster_id?: string | null
          created_at?: string
          description?: string | null
          embedding?: string | null
          end_ts?: string | null
          id?: string
          page_url?: string
          participants?: string[]
          review_status?: Database["public"]["Enums"]["review_status"] | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_ts?: string | null
          title?: string
          url?: string | null
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extracted_events_page_url_fkey"
            columns: ["page_url"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["url"]
          },
        ]
      }
      extracted_galleries: {
        Row: {
          address: string | null
          cluster_id: string | null
          created_at: string
          description: string | null
          embedding: string | null
          id: string
          name: string
          page_url: string
          review_status: Database["public"]["Enums"]["review_status"] | null
          reviewed_at: string | null
          reviewed_by: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          cluster_id?: string | null
          created_at?: string
          description?: string | null
          embedding?: string | null
          id?: string
          name: string
          page_url: string
          review_status?: Database["public"]["Enums"]["review_status"] | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          cluster_id?: string | null
          created_at?: string
          description?: string | null
          embedding?: string | null
          id?: string
          name?: string
          page_url?: string
          review_status?: Database["public"]["Enums"]["review_status"] | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extracted_galleries_page_url_fkey"
            columns: ["page_url"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["url"]
          },
        ]
      }
      extracted_gallery_links: {
        Row: {
          created_at: string | null
          curator_decided_at: string | null
          curator_decision:
            | Database["public"]["Enums"]["similarity_decision"]
            | null
          curator_notes: string | null
          similarity_score: number
          source_a_id: string
          source_b_id: string
        }
        Insert: {
          created_at?: string | null
          curator_decided_at?: string | null
          curator_decision?:
            | Database["public"]["Enums"]["similarity_decision"]
            | null
          curator_notes?: string | null
          similarity_score: number
          source_a_id: string
          source_b_id: string
        }
        Update: {
          created_at?: string | null
          curator_decided_at?: string | null
          curator_decision?:
            | Database["public"]["Enums"]["similarity_decision"]
            | null
          curator_notes?: string | null
          similarity_score?: number
          source_a_id?: string
          source_b_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extracted_gallery_links_source_a_id_fkey"
            columns: ["source_a_id"]
            isOneToOne: false
            referencedRelation: "extracted_galleries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracted_gallery_links_source_b_id_fkey"
            columns: ["source_b_id"]
            isOneToOne: false
            referencedRelation: "extracted_galleries"
            referencedColumns: ["id"]
          },
        ]
      }
      golden_artists: {
        Row: {
          bio: string | null
          cluster_id: string
          name: string
          socials: string[]
          updated_at: string
          website: string | null
        }
        Insert: {
          bio?: string | null
          cluster_id: string
          name: string
          socials?: string[]
          updated_at?: string
          website?: string | null
        }
        Update: {
          bio?: string | null
          cluster_id?: string
          name?: string
          socials?: string[]
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      golden_events: {
        Row: {
          cluster_id: string
          description: string | null
          end_ts: string | null
          start_ts: string | null
          title: string
          updated_at: string
          url: string | null
          venue_text: string | null
        }
        Insert: {
          cluster_id: string
          description?: string | null
          end_ts?: string | null
          start_ts?: string | null
          title: string
          updated_at?: string
          url?: string | null
          venue_text?: string | null
        }
        Update: {
          cluster_id?: string
          description?: string | null
          end_ts?: string | null
          start_ts?: string | null
          title?: string
          updated_at?: string
          url?: string | null
          venue_text?: string | null
        }
        Relationships: []
      }
      golden_galleries: {
        Row: {
          address: string | null
          cluster_id: string
          description: string | null
          name: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          cluster_id: string
          description?: string | null
          name: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          cluster_id?: string
          description?: string | null
          name?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      merge_history: {
        Row: {
          cluster_id: string
          created_at: string | null
          created_by: string | null
          entity_type: Database["public"]["Enums"]["entity_type"]
          field_selections: Json | null
          id: string
          merge_type: Database["public"]["Enums"]["merge_type"]
          merged_source_ids: string[]
        }
        Insert: {
          cluster_id: string
          created_at?: string | null
          created_by?: string | null
          entity_type: Database["public"]["Enums"]["entity_type"]
          field_selections?: Json | null
          id?: string
          merge_type: Database["public"]["Enums"]["merge_type"]
          merged_source_ids: string[]
        }
        Update: {
          cluster_id?: string
          created_at?: string | null
          created_by?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"]
          field_selections?: Json | null
          id?: string
          merge_type?: Database["public"]["Enums"]["merge_type"]
          merged_source_ids?: string[]
        }
        Relationships: []
      }
      pages: {
        Row: {
          created_at: string
          extraction_status: Database["public"]["Enums"]["extraction_status"]
          fetched_at: string | null
          md: string | null
          site_id: string | null
          status: number | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          extraction_status?: Database["public"]["Enums"]["extraction_status"]
          fetched_at?: string | null
          md?: string | null
          site_id?: string | null
          status?: number | null
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          extraction_status?: Database["public"]["Enums"]["extraction_status"]
          fetched_at?: string | null
          md?: string | null
          site_id?: string | null
          status?: number | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      find_similar_artists: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          id: string
          name: string
          similarity: number
        }[]
      }
      find_similar_events: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          id: string
          similarity: number
          title: string
        }[]
      }
      find_similar_galleries: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          id: string
          name: string
          similarity: number
        }[]
      }
      get_artist_pairs_for_review: {
        Args: {
          max_similarity?: number
          min_similarity?: number
          review_limit?: number
        }
        Returns: {
          created_at: string
          similarity_score: number
          source_a_id: string
          source_a_name: string
          source_b_id: string
          source_b_name: string
        }[]
      }
      get_crawl_progress: { Args: { job_uuid: string }; Returns: Json }
      get_event_pairs_for_review: {
        Args: {
          max_similarity?: number
          min_similarity?: number
          review_limit?: number
        }
        Returns: {
          created_at: string
          similarity_score: number
          source_a_id: string
          source_a_title: string
          source_b_id: string
          source_b_title: string
        }[]
      }
      get_gallery_pairs_for_review: {
        Args: {
          max_similarity?: number
          min_similarity?: number
          review_limit?: number
        }
        Returns: {
          created_at: string
          similarity_score: number
          source_a_id: string
          source_a_name: string
          source_b_id: string
          source_b_name: string
        }[]
      }
    }
    Enums: {
      crawl_status:
        | "discovering"
        | "fetching"
        | "extracting"
        | "complete"
        | "failed"
      entity_type: "artist" | "gallery" | "event"
      extraction_status: "pending" | "processing" | "complete" | "failed"
      merge_type: "auto_similarity" | "manual_cluster"
      review_status: "pending_review" | "approved" | "rejected" | "modified"
      similarity_decision: "pending" | "merged" | "dismissed"
      url_fetch_status: "pending" | "fetching" | "fetched" | "failed"
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
      crawl_status: [
        "discovering",
        "fetching",
        "extracting",
        "complete",
        "failed",
      ],
      entity_type: ["artist", "gallery", "event"],
      extraction_status: ["pending", "processing", "complete", "failed"],
      merge_type: ["auto_similarity", "manual_cluster"],
      review_status: ["pending_review", "approved", "rejected", "modified"],
      similarity_decision: ["pending", "merged", "dismissed"],
      url_fetch_status: ["pending", "fetching", "fetched", "failed"],
    },
  },
} as const
