
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "admin_audit_log": {
                  Row: {
                    "action": string,"admin_id": string,"created_at": string,"details": NonNullable<Json>,"id": number,"ip": string | null,"target_user_id": string | null,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"admin_id": string,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: number,"ip"?: string | null,"target_user_id"?: string | null,"user_agent"?: string | null
                  }
                  Update: {
                    "action"?: string,"admin_id"?: string,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: number,"ip"?: string | null,"target_user_id"?: string | null,"user_agent"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "admin_audit_log_admin_id_fkey"
      columns: ["admin_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "admin_audit_log_target_user_id_fkey"
      columns: ["target_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"businesses": {
                  Row: {
                    "brand_colors": (string)[],"created_at": string,"default_hashtags": (string)[],"description": string | null,"id": string,"industry": string | null,"instagram": string | null,"language": string,"logo_path": string | null,"name": string,"target_audience": string | null,"tone_of_voice": string | null,"updated_at": string,"user_id": string,"website": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_colors"?: (string)[],"created_at"?: string,"default_hashtags"?: (string)[],"description"?: string | null,"id"?: string,"industry"?: string | null,"instagram"?: string | null,"language"?: string,"logo_path"?: string | null,"name": string,"target_audience"?: string | null,"tone_of_voice"?: string | null,"updated_at"?: string,"user_id": string,"website"?: string | null
                  }
                  Update: {
                    "brand_colors"?: (string)[],"created_at"?: string,"default_hashtags"?: (string)[],"description"?: string | null,"id"?: string,"industry"?: string | null,"instagram"?: string | null,"language"?: string,"logo_path"?: string | null,"name"?: string,"target_audience"?: string | null,"tone_of_voice"?: string | null,"updated_at"?: string,"user_id"?: string,"website"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "businesses_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"generations": {
                  Row: {
                    "attempts": number,"completed_at": string | null,"created_at": string,"duration_ms": number | null,"error_code": string | null,"error_message": string | null,"id": string,"idempotency_key": string | null,"input_image_path": string | null,"metadata": NonNullable<Json>,"model": string | null,"output_image_path": string | null,"output_text": string | null,"platform": string | null,"prompt": string,"provider": string | null,"status": string,"tokens_cost": number,"tone": string | null,"type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"completed_at"?: string | null,"created_at"?: string,"duration_ms"?: number | null,"error_code"?: string | null,"error_message"?: string | null,"id"?: string,"idempotency_key"?: string | null,"input_image_path"?: string | null,"metadata"?: NonNullable<Json>,"model"?: string | null,"output_image_path"?: string | null,"output_text"?: string | null,"platform"?: string | null,"prompt": string,"provider"?: string | null,"status"?: string,"tokens_cost": number,"tone"?: string | null,"type": string,"user_id": string
                  }
                  Update: {
                    "attempts"?: number,"completed_at"?: string | null,"created_at"?: string,"duration_ms"?: number | null,"error_code"?: string | null,"error_message"?: string | null,"id"?: string,"idempotency_key"?: string | null,"input_image_path"?: string | null,"metadata"?: NonNullable<Json>,"model"?: string | null,"output_image_path"?: string | null,"output_text"?: string | null,"platform"?: string | null,"prompt"?: string,"provider"?: string | null,"status"?: string,"tokens_cost"?: number,"tone"?: string | null,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "generations_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_paid": number,"billing_reason": string | null,"created_at": string,"currency": string | null,"id": string,"paid_at": string | null,"status": string,"stripe_invoice_id": string,"stripe_subscription_id": string | null,"tokens_granted": number,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paid"?: number,"billing_reason"?: string | null,"created_at"?: string,"currency"?: string | null,"id"?: string,"paid_at"?: string | null,"status": string,"stripe_invoice_id": string,"stripe_subscription_id"?: string | null,"tokens_granted"?: number,"user_id"?: string | null
                  }
                  Update: {
                    "amount_paid"?: number,"billing_reason"?: string | null,"created_at"?: string,"currency"?: string | null,"id"?: string,"paid_at"?: string | null,"status"?: string,"stripe_invoice_id"?: string,"stripe_subscription_id"?: string | null,"tokens_granted"?: number,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string,"full_name": string | null,"id": string,"is_blocked": boolean,"onboarding_completed": boolean,"role": string,"token_balance": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"full_name"?: string | null,"id": string,"is_blocked"?: boolean,"onboarding_completed"?: boolean,"role"?: string,"token_balance"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"full_name"?: string | null,"id"?: string,"is_blocked"?: boolean,"onboarding_completed"?: boolean,"role"?: string,"token_balance"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rate_limits": {
                  Row: {
                    "count": number,"key": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count"?: number,"key": string,"window_start": string
                  }
                  Update: {
                    "count"?: number,"key"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"stripe_customers": {
                  Row: {
                    "created_at": string,"stripe_customer_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"stripe_customer_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"stripe_customer_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stripe_customers_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"stripe_events": {
                  Row: {
                    "error": string | null,"id": string,"payload": NonNullable<Json>,"processed_at": string | null,"received_at": string,"status": string,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "error"?: string | null,"id": string,"payload": NonNullable<Json>,"processed_at"?: string | null,"received_at"?: string,"status"?: string,"type": string
                  }
                  Update: {
                    "error"?: string | null,"id"?: string,"payload"?: NonNullable<Json>,"processed_at"?: string | null,"received_at"?: string,"status"?: string,"type"?: string
                  }
                  Relationships: [
                    
                  ]
                },"subscriptions": {
                  Row: {
                    "cancel_at_period_end": boolean,"canceled_at": string | null,"created_at": string,"current_period_end": string | null,"current_period_start": string | null,"id": string,"plan": string,"status": string,"stripe_price_id": string,"stripe_subscription_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancel_at_period_end"?: boolean,"canceled_at"?: string | null,"created_at"?: string,"current_period_end"?: string | null,"current_period_start"?: string | null,"id"?: string,"plan": string,"status": string,"stripe_price_id": string,"stripe_subscription_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "cancel_at_period_end"?: boolean,"canceled_at"?: string | null,"created_at"?: string,"current_period_end"?: string | null,"current_period_start"?: string | null,"id"?: string,"plan"?: string,"status"?: string,"stripe_price_id"?: string,"stripe_subscription_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"token_transactions": {
                  Row: {
                    "admin_id": string | null,"amount": number,"balance_after": number,"created_at": string,"generation_id": string | null,"id": string,"note": string | null,"status": string,"stripe_invoice_id": string | null,"type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_id"?: string | null,"amount": number,"balance_after": number,"created_at"?: string,"generation_id"?: string | null,"id"?: string,"note"?: string | null,"status"?: string,"stripe_invoice_id"?: string | null,"type": string,"user_id": string
                  }
                  Update: {
                    "admin_id"?: string | null,"amount"?: number,"balance_after"?: number,"created_at"?: string,"generation_id"?: string | null,"id"?: string,"note"?: string | null,"status"?: string,"stripe_invoice_id"?: string | null,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "token_transactions_admin_id_fkey"
      columns: ["admin_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "token_transactions_generation_id_fkey"
      columns: ["generation_id"]
isOneToOne: false
      referencedRelation: "generations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "token_transactions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "admin_adjust_tokens":
{ Args: { "p_admin_id": string,"p_amount": number,"p_ip"?: string,"p_note": string,"p_target_id": string,"p_user_agent"?: string }; Returns: number
                           },
"check_rate_limit":
{ Args: { "p_key": string,"p_limit": number,"p_window_seconds": number }; Returns: boolean
                           },
"commit_tokens":
{ Args: { "p_tx_id": string }; Returns: undefined
                           },
"get_admin_stats":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_user_stats":
{ Args: { "p_user_id": string }; Returns: Json
                           },
"grant_tokens":
{ Args: { "p_amount": number,"p_note"?: string,"p_stripe_invoice_id"?: string,"p_type": string,"p_user_id": string }; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"log_admin_action":
{ Args: { "p_action": string,"p_admin_id": string,"p_details"?: Json,"p_ip"?: string,"p_target_id": string,"p_user_agent"?: string }; Returns: number
                           },
"release_tokens":
{ Args: { "p_tx_id": string }; Returns: number
                           },
"reserve_tokens":
{ Args: { "p_amount": number,"p_generation_id": string,"p_user_id": string }; Returns: string
                           },
"revoke_tokens":
{ Args: { "p_amount": number,"p_note"?: string,"p_stripe_invoice_id"?: string,"p_user_id": string }; Returns: number
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
