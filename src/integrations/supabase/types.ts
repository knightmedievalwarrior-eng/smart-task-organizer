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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_user_connections: {
        Row: {
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          reconnect_required: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          reconnect_required?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          reconnect_required?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credits_ledger: {
        Row: {
          bucket: string
          created_at: string
          credit_delta: number
          entry_type: string
          id: number
          reference_id: string | null
          request_id: string | null
          task_kind: string | null
          user_id: string
        }
        Insert: {
          bucket: string
          created_at?: string
          credit_delta: number
          entry_type: string
          id?: never
          reference_id?: string | null
          request_id?: string | null
          task_kind?: string | null
          user_id: string
        }
        Update: {
          bucket?: string
          created_at?: string
          credit_delta?: number
          entry_type?: string
          id?: never
          reference_id?: string | null
          request_id?: string | null
          task_kind?: string | null
          user_id?: string
        }
        Relationships: []
      }
      github_backup_tombstones: {
        Row: {
          deleted_at: string
          record_id: string
          user_id: string
        }
        Insert: {
          deleted_at?: string
          record_id: string
          user_id: string
        }
        Update: {
          deleted_at?: string
          record_id?: string
          user_id?: string
        }
        Relationships: []
      }
      github_vaults: {
        Row: {
          created_at: string
          repository_default_branch: string
          repository_full_name: string | null
          repository_id: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          repository_default_branch?: string
          repository_full_name?: string | null
          repository_id?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          repository_default_branch?: string
          repository_full_name?: string | null
          repository_id?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scheduled_jobs: {
        Row: {
          attempts: number
          charged_at: string | null
          completed_at: string | null
          created_at: string
          credits_charged: number
          id: string
          last_error: string | null
          locked_at: string | null
          scheduled_for: string
          status: string
          task_data: Json | null
          task_id: string
          task_type: string
          updated_at: string
          user_id: string
          webhook_auth_header: string | null
          webhook_auth_value_ciphertext: string | null
          webhook_url: string
        }
        Insert: {
          attempts?: number
          charged_at?: string | null
          completed_at?: string | null
          created_at?: string
          credits_charged?: number
          id?: string
          last_error?: string | null
          locked_at?: string | null
          scheduled_for: string
          status?: string
          task_data?: Json | null
          task_id: string
          task_type: string
          updated_at?: string
          user_id: string
          webhook_auth_header?: string | null
          webhook_auth_value_ciphertext?: string | null
          webhook_url: string
        }
        Update: {
          attempts?: number
          charged_at?: string | null
          completed_at?: string | null
          created_at?: string
          credits_charged?: number
          id?: string
          last_error?: string | null
          locked_at?: string | null
          scheduled_for?: string
          status?: string
          task_data?: Json | null
          task_id?: string
          task_type?: string
          updated_at?: string
          user_id?: string
          webhook_auth_header?: string | null
          webhook_auth_value_ciphertext?: string | null
          webhook_url?: string
        }
        Relationships: []
      }
      trash_metadata: {
        Row: {
          deleted_at: string
          expires_at: string
          task_id: string
          user_id: string
        }
        Insert: {
          deleted_at?: string
          expires_at?: string
          task_id: string
          user_id: string
        }
        Update: {
          deleted_at?: string
          expires_at?: string
          task_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string
          email: string | null
          free_day: string
          free_used: number
          id: string
          is_pro: boolean
          pack_credits: number
          pro_month: string
          pro_used: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          free_day?: string
          free_used?: number
          id: string
          is_pro?: boolean
          pack_credits?: number
          pro_month?: string
          pro_used?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          free_day?: string
          free_used?: number
          id?: string
          is_pro?: boolean
          pack_credits?: number
          pro_month?: string
          pro_used?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      charge_credits: {
        Args: {
          _kind: string
          _request_id: string
          _units: number
          _user_id: string
        }
        Returns: {
          cost: number
          free: number
          is_pro: boolean
          monthly: number
          pack: number
          total: number
        }[]
      }
      claim_scheduled_jobs: {
        Args: { _limit?: number }
        Returns: {
          attempts: number
          charged_at: string | null
          completed_at: string | null
          created_at: string
          credits_charged: number
          id: string
          last_error: string | null
          locked_at: string | null
          scheduled_for: string
          status: string
          task_data: Json | null
          task_id: string
          task_type: string
          updated_at: string
          user_id: string
          webhook_auth_header: string | null
          webhook_auth_value_ciphertext: string | null
          webhook_url: string
        }[]
        SetofOptions: {
          from: "*"
          to: "scheduled_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_scheduled_job: {
        Args: { _error?: string; _job_id: string; _status: string }
        Returns: undefined
      }
      my_credits: {
        Args: never
        Returns: {
          free: number
          is_pro: boolean
          monthly: number
          pack: number
          total: number
        }[]
      }
      spend_credits:
        | {
            Args: { _kind: string; _units?: number }
            Returns: {
              cost: number
              free: number
              is_pro: boolean
              monthly: number
              pack: number
              total: number
            }[]
          }
        | {
            Args: { _kind: string; _request_id?: string; _units?: number }
            Returns: {
              cost: number
              free: number
              is_pro: boolean
              monthly: number
              pack: number
              total: number
            }[]
          }
      spend_scheduled_job_credits: {
        Args: { _job_id: string }
        Returns: {
          cost: number
          free: number
          is_pro: boolean
          monthly: number
          pack: number
          total: number
        }[]
      }
      task_credit_cost: {
        Args: { _kind: string; _units: number }
        Returns: number
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
