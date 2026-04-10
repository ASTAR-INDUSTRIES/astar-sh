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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      agent_inbox: {
        Row: {
          agent_slug: string
          author_email: string
          author_name: string | null
          content: string
          created_at: string
          delivery_channel: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          processed_at: string | null
          processed_by: string | null
          response: string | null
          status: string
          type: string
        }
        Insert: {
          agent_slug: string
          author_email: string
          author_name?: string | null
          content: string
          created_at?: string
          delivery_channel?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          processed_at?: string | null
          processed_by?: string | null
          response?: string | null
          status?: string
          type?: string
        }
        Update: {
          agent_slug?: string
          author_email?: string
          author_name?: string | null
          content?: string
          created_at?: string
          delivery_channel?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          processed_at?: string | null
          processed_by?: string | null
          response?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_inbox_agent_slug_fkey"
            columns: ["agent_slug"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["slug"]
          },
        ]
      }
      agents: {
        Row: {
          config: Json | null
          created_at: string
          email: string | null
          id: string
          last_seen: string | null
          machine: string | null
          name: string
          owner: string
          project_id: string | null
          role: string | null
          scopes: string[] | null
          skill_slug: string | null
          slug: string
          status: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          email?: string | null
          id?: string
          last_seen?: string | null
          machine?: string | null
          name: string
          owner: string
          project_id?: string | null
          role?: string | null
          scopes?: string[] | null
          skill_slug?: string | null
          slug: string
          status?: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          email?: string | null
          id?: string
          last_seen?: string | null
          machine?: string | null
          name?: string
          owner?: string
          project_id?: string | null
          role?: string | null
          scopes?: string[] | null
          skill_slug?: string | null
          slug?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_agent_id: string | null
          actor_email: string | null
          actor_name: string | null
          actor_type: string
          channel: string | null
          context: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          project_id: string | null
          state_after: Json | null
          state_before: Json | null
          timestamp: string
        }
        Insert: {
          action: string
          actor_agent_id?: string | null
          actor_email?: string | null
          actor_name?: string | null
          actor_type?: string
          channel?: string | null
          context?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          project_id?: string | null
          state_after?: Json | null
          state_before?: Json | null
          timestamp?: string
        }
        Update: {
          action?: string
          actor_agent_id?: string | null
          actor_email?: string | null
          actor_name?: string | null
          actor_type?: string
          channel?: string | null
          context?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          project_id?: string | null
          state_after?: Json | null
          state_before?: Json | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cli_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          skill_slug: string | null
          skill_title: string | null
          user_email: string | null
          user_name: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          skill_slug?: string | null
          skill_title?: string | null
          user_email?: string | null
          user_name?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          skill_slug?: string | null
          skill_title?: string | null
          user_email?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      etf_funds: {
        Row: {
          base_nav: number | null
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          inception_date: string
          name: string
          status: string | null
          strategy: string | null
          ticker: string
          updated_at: string | null
        }
        Insert: {
          base_nav?: number | null
          created_at?: string | null
          created_by: string
          description?: string | null
          id?: string
          inception_date?: string
          name: string
          status?: string | null
          strategy?: string | null
          ticker: string
          updated_at?: string | null
        }
        Update: {
          base_nav?: number | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          inception_date?: string
          name?: string
          status?: string | null
          strategy?: string | null
          ticker?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      etf_holdings: {
        Row: {
          added_at: string | null
          domain: string | null
          entry_price: number | null
          fund_id: string
          id: string
          name: string
          sector: string | null
          symbol: string
          weight: number
        }
        Insert: {
          added_at?: string | null
          domain?: string | null
          entry_price?: number | null
          fund_id: string
          id?: string
          name: string
          sector?: string | null
          symbol: string
          weight: number
        }
        Update: {
          added_at?: string | null
          domain?: string | null
          entry_price?: number | null
          fund_id?: string
          id?: string
          name?: string
          sector?: string | null
          symbol?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "etf_holdings_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "etf_funds"
            referencedColumns: ["id"]
          },
        ]
      }
      etf_performance: {
        Row: {
          calculated_at: string | null
          cumulative_return: number | null
          daily_return: number | null
          date: string
          fund_id: string
          holdings_snapshot: Json | null
          id: string
          nav: number
        }
        Insert: {
          calculated_at?: string | null
          cumulative_return?: number | null
          daily_return?: number | null
          date: string
          fund_id: string
          holdings_snapshot?: Json | null
          id?: string
          nav: number
        }
        Update: {
          calculated_at?: string | null
          cumulative_return?: number | null
          daily_return?: number | null
          date?: string
          fund_id?: string
          holdings_snapshot?: Json | null
          id?: string
          nav?: number
        }
        Relationships: [
          {
            foreignKeyName: "etf_performance_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "etf_funds"
            referencedColumns: ["id"]
          },
        ]
      }
      etf_prices: {
        Row: {
          change_pct: number | null
          close_price: number
          date: string
          fetched_at: string | null
          id: string
          symbol: string
        }
        Insert: {
          change_pct?: number | null
          close_price: number
          date: string
          fetched_at?: string | null
          id?: string
          symbol: string
        }
        Update: {
          change_pct?: number | null
          close_price?: number
          date?: string
          fetched_at?: string | null
          id?: string
          symbol?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          attendees: Json
          created_at: string
          created_by: string
          date: string | null
          date_tentative: boolean
          goal: string
          id: string
          location: string | null
          project_id: string | null
          slug: string
          status: string
          title: string
          type: string
          updated_at: string
          visibility: string
        }
        Insert: {
          attendees?: Json
          created_at?: string
          created_by: string
          date?: string | null
          date_tentative?: boolean
          goal: string
          id?: string
          location?: string | null
          project_id?: string | null
          slug: string
          status?: string
          title: string
          type?: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          attendees?: Json
          created_at?: string
          created_by?: string
          date?: string | null
          date_tentative?: boolean
          goal?: string
          id?: string
          location?: string | null
          project_id?: string | null
          slug?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          author_email: string
          author_name: string | null
          content: string
          context: Json | null
          created_at: string | null
          id: string
          linked_news: string | null
          linked_skill: string | null
          source: string | null
          status: string | null
          type: string | null
        }
        Insert: {
          author_email: string
          author_name?: string | null
          content: string
          context?: Json | null
          created_at?: string | null
          id?: string
          linked_news?: string | null
          linked_skill?: string | null
          source?: string | null
          status?: string | null
          type?: string | null
        }
        Update: {
          author_email?: string
          author_name?: string | null
          content?: string
          context?: Json | null
          created_at?: string | null
          id?: string
          linked_news?: string | null
          linked_skill?: string | null
          source?: string | null
          status?: string | null
          type?: string | null
        }
        Relationships: []
      }
      financial_inquiries: {
        Row: {
          author_email: string
          author_name: string | null
          content: string
          created_at: string
          delivery_channel: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          processed_at: string | null
          processed_by: string | null
          response: string | null
          status: string
          type: string
        }
        Insert: {
          author_email: string
          author_name?: string | null
          content: string
          created_at?: string
          delivery_channel?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          processed_at?: string | null
          processed_by?: string | null
          response?: string | null
          status?: string
          type?: string
        }
        Update: {
          author_email?: string
          author_name?: string | null
          content?: string
          created_at?: string
          delivery_channel?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          processed_at?: string | null
          processed_by?: string | null
          response?: string | null
          status?: string
          type?: string
        }
        Relationships: []
      }
      mcp_sessions: {
        Row: {
          access_token: string | null
          auth_code: string | null
          client_redirect_uri: string | null
          code_challenge: string | null
          code_challenge_method: string | null
          created_at: string
          expires_at: string
          id: string
          state: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          access_token?: string | null
          auth_code?: string | null
          client_redirect_uri?: string | null
          code_challenge?: string | null
          code_challenge_method?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          state?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          access_token?: string | null
          auth_code?: string | null
          client_redirect_uri?: string | null
          code_challenge?: string | null
          code_challenge_method?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          state?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      milestones: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          date: string
          id: string
          project_id: string | null
          title: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          project_id?: string | null
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          project_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_avatar: string | null
          author_name: string | null
          category: string
          content: string
          created_at: string
          excerpt: string | null
          id: string
          published: boolean
          published_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_avatar?: string | null
          author_name?: string | null
          category?: string
          content: string
          created_at?: string
          excerpt?: string | null
          id?: string
          published?: boolean
          published_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_avatar?: string | null
          author_name?: string | null
          category?: string
          content?: string
          created_at?: string
          excerpt?: string | null
          id?: string
          published?: boolean
          published_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          members: string[]
          name: string
          owner: string
          slug: string
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          members?: string[]
          name: string
          owner: string
          slug: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          members?: string[]
          name?: string
          owner?: string
          slug?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      research_articles: {
        Row: {
          abstract: string | null
          authors: string[]
          content: string | null
          created_at: string
          id: string
          pdf_url: string | null
          published: boolean
          published_at: string | null
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          abstract?: string | null
          authors?: string[]
          content?: string | null
          created_at?: string
          id?: string
          pdf_url?: string | null
          published?: boolean
          published_at?: string | null
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          abstract?: string | null
          authors?: string[]
          content?: string | null
          created_at?: string
          id?: string
          pdf_url?: string | null
          published?: boolean
          published_at?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      task_activity: {
        Row: {
          action: string
          actor: string
          actor_type: string
          created_at: string
          details: Json
          id: string
          task_id: string
        }
        Insert: {
          action: string
          actor: string
          actor_type?: string
          created_at?: string
          details?: Json
          id?: string
          task_id: string
        }
        Update: {
          action?: string
          actor?: string
          actor_type?: string
          created_at?: string
          details?: Json
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_links: {
        Row: {
          created_at: string
          id: string
          link_ref: string
          link_type: string
          task_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link_ref: string
          link_type: string
          task_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link_ref?: string
          link_type?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_links_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          archived_at: string | null
          assigned_to: string | null
          completed_at: string | null
          completed_by: string | null
          confidence: number | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          event_id: string | null
          id: string
          parent_task_id: string | null
          priority: string
          project_id: string | null
          recurring: Json | null
          requires_triage: boolean
          search_vector: unknown
          source: string
          status: string
          tags: string[]
          task_number: number
          title: string
          updated_at: string
          visibility: string | null
        }
        Insert: {
          archived_at?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          confidence?: number | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          event_id?: string | null
          id?: string
          parent_task_id?: string | null
          priority?: string
          project_id?: string | null
          recurring?: Json | null
          requires_triage?: boolean
          search_vector?: unknown
          source?: string
          status?: string
          tags?: string[]
          task_number?: number
          title: string
          updated_at?: string
          visibility?: string | null
        }
        Update: {
          archived_at?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          event_id?: string | null
          id?: string
          parent_task_id?: string | null
          priority?: string
          project_id?: string | null
          recurring?: Json | null
          requires_triage?: boolean
          search_vector?: unknown
          source?: string
          status?: string
          tags?: string[]
          task_number?: number
          title?: string
          updated_at?: string
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tweet_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          tweet_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          tweet_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          tweet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tweet_reactions_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "tweets"
            referencedColumns: ["id"]
          },
        ]
      }
      tweets: {
        Row: {
          author_email: string | null
          author_name: string | null
          content: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          author_email?: string | null
          author_name?: string | null
          content: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          author_email?: string | null
          author_name?: string | null
          content?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_view_event_record: {
        Args: {
          event_created_by: string
          event_project_id: string
          event_visibility: string
        }
        Returns: boolean
      }
      can_view_project: {
        Args: {
          project_members: string[]
          project_owner: string
          project_visibility: string
        }
        Returns: boolean
      }
      can_view_project_by_id: {
        Args: { project_ref: string }
        Returns: boolean
      }
      can_view_task_record: {
        Args: {
          task_assigned_to: string
          task_created_by: string
          task_project_id: string
          task_visibility: string
        }
        Returns: boolean
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
