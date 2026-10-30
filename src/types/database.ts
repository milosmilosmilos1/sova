
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
            "account_deletion_requests": {
                  Row: {
                    "completed_at": string | null,"confirmation_code": string,"email": string | null,"external_user_id": string | null,"id": string,"requested_at": string,"source": string,"status": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"confirmation_code": string,"email"?: string | null,"external_user_id"?: string | null,"id"?: string,"requested_at"?: string,"source": string,"status"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "completed_at"?: string | null,"confirmation_code"?: string,"email"?: string | null,"external_user_id"?: string | null,"id"?: string,"requested_at"?: string,"source"?: string,"status"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "account_deletion_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"account_metrics_daily": {
                  Row: {
                    "brand_id": string,"captured_at": string,"date": string,"followers": number | null,"following": number | null,"impressions": number | null,"profile_views": number | null,"raw": Json | null,"reach": number | null,"social_account_id": string,"website_clicks": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"captured_at"?: string,"date": string,"followers"?: number | null,"following"?: number | null,"impressions"?: number | null,"profile_views"?: number | null,"raw"?: Json | null,"reach"?: number | null,"social_account_id": string,"website_clicks"?: number | null
                  }
                  Update: {
                    "brand_id"?: string,"captured_at"?: string,"date"?: string,"followers"?: number | null,"following"?: number | null,"impressions"?: number | null,"profile_views"?: number | null,"raw"?: Json | null,"reach"?: number | null,"social_account_id"?: string,"website_clicks"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "account_metrics_daily_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "account_metrics_daily_social_account_id_fkey"
      columns: ["social_account_id"]
isOneToOne: false
      referencedRelation: "social_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "account_metrics_daily_social_account_id_fkey"
      columns: ["social_account_id"]
isOneToOne: false
      referencedRelation: "social_accounts_public"
      referencedColumns: ["id"]
    }
                  ]
                },"admin_audit_log": {
                  Row: {
                    "action": string,"admin_email": string | null,"admin_id": string,"after": Json | null,"before": Json | null,"created_at": string,"id": number,"impersonation_session_id": string | null,"ip": unknown,"request_id": string | null,"target_id": string | null,"target_type": string | null,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"admin_email"?: string | null,"admin_id": string,"after"?: Json | null,"before"?: Json | null,"created_at"?: string,"id"?: number,"impersonation_session_id"?: string | null,"ip"?: unknown,"request_id"?: string | null,"target_id"?: string | null,"target_type"?: string | null,"user_agent"?: string | null
                  }
                  Update: {
                    "action"?: string,"admin_email"?: string | null,"admin_id"?: string,"after"?: Json | null,"before"?: Json | null,"created_at"?: string,"id"?: number,"impersonation_session_id"?: string | null,"ip"?: unknown,"request_id"?: string | null,"target_id"?: string | null,"target_type"?: string | null,"user_agent"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"ai_generations": {
                  Row: {
                    "brand_id": string | null,"cost_usd": number | null,"created_at": string,"duration_ms": number | null,"error_code": string | null,"error_message": string | null,"fallback_used": boolean,"finished_at": string | null,"id": string,"idempotency_key": string | null,"inngest_run_id": string | null,"input": NonNullable<Json>,"model": string | null,"output": Json | null,"output_asset_id": string | null,"progress": Json | null,"provider": string,"provider_images": number | null,"provider_input_tokens": number | null,"provider_output_tokens": number | null,"request_id": string | null,"started_at": string | null,"status": Database["public"]['Enums']["ai_generation_status"],"token_reservation_id": string | null,"tokens_charged": number,"type": Database["public"]['Enums']["ai_generation_type"],"user_id": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id"?: string | null,"cost_usd"?: number | null,"created_at"?: string,"duration_ms"?: number | null,"error_code"?: string | null,"error_message"?: string | null,"fallback_used"?: boolean,"finished_at"?: string | null,"id"?: string,"idempotency_key"?: string | null,"inngest_run_id"?: string | null,"input"?: NonNullable<Json>,"model"?: string | null,"output"?: Json | null,"output_asset_id"?: string | null,"progress"?: Json | null,"provider"?: string,"provider_images"?: number | null,"provider_input_tokens"?: number | null,"provider_output_tokens"?: number | null,"request_id"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["ai_generation_status"],"token_reservation_id"?: string | null,"tokens_charged"?: number,"type": Database["public"]['Enums']["ai_generation_type"],"user_id"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "brand_id"?: string | null,"cost_usd"?: number | null,"created_at"?: string,"duration_ms"?: number | null,"error_code"?: string | null,"error_message"?: string | null,"fallback_used"?: boolean,"finished_at"?: string | null,"id"?: string,"idempotency_key"?: string | null,"inngest_run_id"?: string | null,"input"?: NonNullable<Json>,"model"?: string | null,"output"?: Json | null,"output_asset_id"?: string | null,"progress"?: Json | null,"provider"?: string,"provider_images"?: number | null,"provider_input_tokens"?: number | null,"provider_output_tokens"?: number | null,"request_id"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["ai_generation_status"],"token_reservation_id"?: string | null,"tokens_charged"?: number,"type"?: Database["public"]['Enums']["ai_generation_type"],"user_id"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_generations_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_generations_output_asset_id_fkey"
      columns: ["output_asset_id"]
isOneToOne: false
      referencedRelation: "media_assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_generations_reservation_fk"
      columns: ["token_reservation_id"]
isOneToOne: false
      referencedRelation: "token_reservations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_generations_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_generations_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"approval_links": {
                  Row: {
                    "brand_id": string,"client_label": string | null,"created_at": string,"created_by": string,"expires_at": string,"id": string,"max_uses": number | null,"post_ids": (string)[],"revoked_at": string | null,"token_hash": string,"use_count": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"client_label"?: string | null,"created_at"?: string,"created_by": string,"expires_at": string,"id"?: string,"max_uses"?: number | null,"post_ids": (string)[],"revoked_at"?: string | null,"token_hash": string,"use_count"?: number,"workspace_id": string
                  }
                  Update: {
                    "brand_id"?: string,"client_label"?: string | null,"created_at"?: string,"created_by"?: string,"expires_at"?: string,"id"?: string,"max_uses"?: number | null,"post_ids"?: (string)[],"revoked_at"?: string | null,"token_hash"?: string,"use_count"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "approval_links_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_links_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_links_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"approvals": {
                  Row: {
                    "approval_link_id": string | null,"approver_id": string | null,"brand_id": string,"comment": string | null,"created_at": string,"decided_at": string | null,"decision": Database["public"]['Enums']["approval_decision"] | null,"id": string,"post_id": string,"post_version": number,"requested_by": string | null,"step": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approval_link_id"?: string | null,"approver_id"?: string | null,"brand_id": string,"comment"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decision"?: Database["public"]['Enums']["approval_decision"] | null,"id"?: string,"post_id": string,"post_version": number,"requested_by"?: string | null,"step"?: number,"workspace_id": string
                  }
                  Update: {
                    "approval_link_id"?: string | null,"approver_id"?: string | null,"brand_id"?: string,"comment"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decision"?: Database["public"]['Enums']["approval_decision"] | null,"id"?: string,"post_id"?: string,"post_version"?: number,"requested_by"?: string | null,"step"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "approvals_approval_link_id_fkey"
      columns: ["approval_link_id"]
isOneToOne: false
      referencedRelation: "approval_links"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approvals_approver_id_fkey"
      columns: ["approver_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approvals_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approvals_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approvals_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approvals_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"autopilot_runs": {
                  Row: {
                    "brand_id": string,"created_at": string,"finished_at": string | null,"id": string,"kind": string,"level": number,"period_start": string,"status": string,"summary": NonNullable<Json>,"tokens_used": number,"triggered_by": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"created_at"?: string,"finished_at"?: string | null,"id"?: string,"kind": string,"level": number,"period_start": string,"status"?: string,"summary"?: NonNullable<Json>,"tokens_used"?: number,"triggered_by"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "brand_id"?: string,"created_at"?: string,"finished_at"?: string | null,"id"?: string,"kind"?: string,"level"?: number,"period_start"?: string,"status"?: string,"summary"?: NonNullable<Json>,"tokens_used"?: number,"triggered_by"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "autopilot_runs_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "autopilot_runs_triggered_by_fkey"
      columns: ["triggered_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "autopilot_runs_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"billing_customers": {
                  Row: {
                    "created_at": string,"provider": string,"provider_customer_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"provider": string,"provider_customer_id": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"provider"?: string,"provider_customer_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "billing_customers_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: true
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"brand_documents": {
                  Row: {
                    "brand_id": string,"chars": number,"chunks": number,"created_at": string,"deleted_at": string | null,"error": string | null,"id": string,"name": string,"pages": number | null,"size_bytes": number,"status": string,"storage_path": string | null,"kind": string,"content": string | null,"uploaded_by": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"chars"?: number,"chunks"?: number,"created_at"?: string,"deleted_at"?: string | null,"error"?: string | null,"id"?: string,"name": string,"pages"?: number | null,"size_bytes": number,"status"?: string,"storage_path"?: string | null,"kind"?: string,"content"?: string | null,"uploaded_by"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "brand_id"?: string,"chars"?: number,"chunks"?: number,"created_at"?: string,"deleted_at"?: string | null,"error"?: string | null,"id"?: string,"name"?: string,"pages"?: number | null,"size_bytes"?: number,"status"?: string,"storage_path"?: string | null,"kind"?: string,"content"?: string | null,"uploaded_by"?: string | null,"workspace_id"?: string
                  }
                  Relationships: []
                },"brand_profiles": {
                  Row: {
                    "brand_id": string,"crawl_id": string | null,"created_at": string,"created_by": string | null,"data": NonNullable<Json>,"id": string,"is_current": boolean,"locked_fields": (string)[],"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"crawl_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"data": NonNullable<Json>,"id"?: string,"is_current"?: boolean,"locked_fields"?: (string)[],"version": number
                  }
                  Update: {
                    "brand_id"?: string,"crawl_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"data"?: NonNullable<Json>,"id"?: string,"is_current"?: boolean,"locked_fields"?: (string)[],"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "brand_profiles_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "brand_profiles_crawl_id_fkey"
      columns: ["crawl_id"]
isOneToOne: false
      referencedRelation: "website_crawls"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "brand_profiles_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"brand_site_checks": {
                  Row: {
                    "brand_id": string,"changed_urls": (string)[],"checked_at": string,"feed_hash": string | null,"id": string,"new_urls": (string)[],"sitemap_hash": string | null,"suggested_profile_update": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"changed_urls"?: (string)[],"checked_at"?: string,"feed_hash"?: string | null,"id"?: string,"new_urls"?: (string)[],"sitemap_hash"?: string | null,"suggested_profile_update"?: boolean
                  }
                  Update: {
                    "brand_id"?: string,"changed_urls"?: (string)[],"checked_at"?: string,"feed_hash"?: string | null,"id"?: string,"new_urls"?: (string)[],"sitemap_hash"?: string | null,"suggested_profile_update"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "brand_site_checks_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    }
                  ]
                },"brands": {
                  Row: {
                    "autopilot_approval_deadline_hours": number,"autopilot_level": number,"autopilot_level3_confirmed_at": string | null,"autopilot_token_budget": number | null,"autopilot_unapproved_action": string,"content_locale": string,"created_at": string,"created_by": string | null,"design": Json,"deleted_at": string | null,"feed_hash": string | null,"id": string,"last_site_check_at": string | null,"logo_asset_id": string | null,"name": string,"paused_at": string | null,"paused_by": string | null,"report_emails": string[],"settings": NonNullable<Json>,"sitemap_hash": string | null,"status": Database["public"]['Enums']["brand_status"],"timezone": string,"updated_at": string,"setup_completed_at": string | null,"playbook": Json,"voice": Json,"website_url": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "autopilot_approval_deadline_hours"?: number,"autopilot_level"?: number,"autopilot_level3_confirmed_at"?: string | null,"autopilot_token_budget"?: number | null,"autopilot_unapproved_action"?: string,"content_locale"?: string,"created_at"?: string,"created_by"?: string | null,"design"?: Json,"deleted_at"?: string | null,"feed_hash"?: string | null,"id"?: string,"last_site_check_at"?: string | null,"logo_asset_id"?: string | null,"name": string,"paused_at"?: string | null,"paused_by"?: string | null,"report_emails"?: string[],"settings"?: NonNullable<Json>,"sitemap_hash"?: string | null,"status"?: Database["public"]['Enums']["brand_status"],"timezone"?: string,"updated_at"?: string,"setup_completed_at"?: string | null,"playbook"?: Json,"voice"?: Json,"website_url"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "autopilot_approval_deadline_hours"?: number,"autopilot_level"?: number,"autopilot_level3_confirmed_at"?: string | null,"autopilot_token_budget"?: number | null,"autopilot_unapproved_action"?: string,"content_locale"?: string,"created_at"?: string,"created_by"?: string | null,"design"?: Json,"deleted_at"?: string | null,"feed_hash"?: string | null,"id"?: string,"last_site_check_at"?: string | null,"logo_asset_id"?: string | null,"name"?: string,"paused_at"?: string | null,"paused_by"?: string | null,"report_emails"?: string[],"settings"?: NonNullable<Json>,"sitemap_hash"?: string | null,"status"?: Database["public"]['Enums']["brand_status"],"timezone"?: string,"updated_at"?: string,"setup_completed_at"?: string | null,"playbook"?: Json,"voice"?: Json,"website_url"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "brands_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "brands_logo_fk"
      columns: ["logo_asset_id"]
isOneToOne: false
      referencedRelation: "media_assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "brands_paused_by_fkey"
      columns: ["paused_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "brands_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"campaigns": {
                  Row: {
                    "brand_id": string,"created_at": string,"cta": string | null,"ends_on": string | null,"goal": string | null,"id": string,"key_message": string | null,"name": string,"offer": string | null,"starts_on": string | null,"strategy_id": string | null,"utm_campaign": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"created_at"?: string,"cta"?: string | null,"ends_on"?: string | null,"goal"?: string | null,"id"?: string,"key_message"?: string | null,"name": string,"offer"?: string | null,"starts_on"?: string | null,"strategy_id"?: string | null,"utm_campaign"?: string | null
                  }
                  Update: {
                    "brand_id"?: string,"created_at"?: string,"cta"?: string | null,"ends_on"?: string | null,"goal"?: string | null,"id"?: string,"key_message"?: string | null,"name"?: string,"offer"?: string | null,"starts_on"?: string | null,"strategy_id"?: string | null,"utm_campaign"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "campaigns_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "campaigns_strategy_id_fkey"
      columns: ["strategy_id"]
isOneToOne: false
      referencedRelation: "strategies"
      referencedColumns: ["id"]
    }
                  ]
                },"canva_connections": {
                  Row: {
                    "access_token_enc": string,"autofill_available": boolean,"canva_user_id": string,"created_at": string,"id": string,"key_version": number,"plan_hint": string | null,"refresh_token_enc": string,"scopes": (string)[],"status": Database["public"]['Enums']["social_account_status"],"team_id": string | null,"token_expires_at": string,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "access_token_enc": string,"autofill_available"?: boolean,"canva_user_id": string,"created_at"?: string,"id"?: string,"key_version"?: number,"plan_hint"?: string | null,"refresh_token_enc": string,"scopes"?: (string)[],"status"?: Database["public"]['Enums']["social_account_status"],"team_id"?: string | null,"token_expires_at": string,"updated_at"?: string,"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "access_token_enc"?: string,"autofill_available"?: boolean,"canva_user_id"?: string,"created_at"?: string,"id"?: string,"key_version"?: number,"plan_hint"?: string | null,"refresh_token_enc"?: string,"scopes"?: (string)[],"status"?: Database["public"]['Enums']["social_account_status"],"team_id"?: string | null,"token_expires_at"?: string,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "canva_connections_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "canva_connections_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"competitors": {
                  Row: {
                    "brand_id": string,"created_at": string,"id": string,"last_analyzed_at": string | null,"name": string | null,"summary": Json | null,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"created_at"?: string,"id"?: string,"last_analyzed_at"?: string | null,"name"?: string | null,"summary"?: Json | null,"url": string
                  }
                  Update: {
                    "brand_id"?: string,"created_at"?: string,"id"?: string,"last_analyzed_at"?: string | null,"name"?: string | null,"summary"?: Json | null,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "competitors_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    }
                  ]
                },"content_flow_runs": {
                  Row: {
                    "brand_id": string,"created_at": string,"error": string | null,"finished_at": string | null,"flow_id": string,"id": string,"post_id": string | null,"slot_at": string,"status": string,"step": string | null,"tokens": number,"trigger": string,"triggered_by": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"created_at"?: string,"error"?: string | null,"finished_at"?: string | null,"flow_id": string,"id"?: string,"post_id"?: string | null,"slot_at": string,"status"?: string,"step"?: string | null,"tokens"?: number,"trigger"?: string,"triggered_by"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "brand_id"?: string,"created_at"?: string,"error"?: string | null,"finished_at"?: string | null,"flow_id"?: string,"id"?: string,"post_id"?: string | null,"slot_at"?: string,"status"?: string,"step"?: string | null,"tokens"?: number,"trigger"?: string,"triggered_by"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_flow_runs_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_flow_runs_flow_id_fkey"
      columns: ["flow_id"]
isOneToOne: false
      referencedRelation: "content_flows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_flow_runs_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_flow_runs_triggered_by_fkey"
      columns: ["triggered_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_flow_runs_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"content_flows": {
                  Row: {
                    "account_ids": (string)[],"active": boolean,"auto_accounts": boolean,"auto_time": boolean,"brand_id": string,"collaborators": (string)[],"created_at": string,"created_by": string | null,"cta": string | null,"cta_mode": string,"days": (number)[],"deleted_at": string | null,"format": string,"id": string,"last_run_at": string | null,"locale": string | null,"name": string,"next_run_at": string | null,"photo_source": string | null,"slides": number | null,"style_id": string | null,"time_local": string,"topic": string,"updated_at": string,"workspace_id": string,"gallery_category_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_ids"?: (string)[],"active"?: boolean,"auto_accounts"?: boolean,"auto_time"?: boolean,"brand_id": string,"collaborators"?: (string)[],"created_at"?: string,"created_by"?: string | null,"cta"?: string | null,"cta_mode"?: string,"days"?: (number)[],"deleted_at"?: string | null,"format"?: string,"id"?: string,"last_run_at"?: string | null,"locale"?: string | null,"name": string,"next_run_at"?: string | null,"photo_source"?: string | null,"slides"?: number | null,"style_id"?: string | null,"time_local"?: string,"topic": string,"updated_at"?: string,"workspace_id": string,"gallery_category_id"?: string | null
                  }
                  Update: {
                    "account_ids"?: (string)[],"active"?: boolean,"auto_accounts"?: boolean,"auto_time"?: boolean,"brand_id"?: string,"collaborators"?: (string)[],"created_at"?: string,"created_by"?: string | null,"cta"?: string | null,"cta_mode"?: string,"days"?: (number)[],"deleted_at"?: string | null,"format"?: string,"id"?: string,"last_run_at"?: string | null,"locale"?: string | null,"name"?: string,"next_run_at"?: string | null,"photo_source"?: string | null,"slides"?: number | null,"style_id"?: string | null,"time_local"?: string,"topic"?: string,"updated_at"?: string,"workspace_id"?: string,"gallery_category_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_flows_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_flows_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_flows_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"content_pillars": {
                  Row: {
                    "brand_id": string,"color": string | null,"description": string | null,"id": string,"is_active": boolean,"name": string,"share_percent": number | null,"sort_order": number,"strategy_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"color"?: string | null,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"share_percent"?: number | null,"sort_order"?: number,"strategy_id"?: string | null
                  }
                  Update: {
                    "brand_id"?: string,"color"?: string | null,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"share_percent"?: number | null,"sort_order"?: number,"strategy_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_pillars_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_pillars_strategy_id_fkey"
      columns: ["strategy_id"]
isOneToOne: false
      referencedRelation: "strategies"
      referencedColumns: ["id"]
    }
                  ]
                },"data_exports": {
                  Row: {
                    "created_at": string,"expires_at": string | null,"id": string,"status": string,"storage_path": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at"?: string | null,"id"?: string,"status"?: string,"storage_path"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string | null,"id"?: string,"status"?: string,"storage_path"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "data_exports_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"dm_automations": {
                  Row: {
                    "active": boolean,"brand_id": string,"created_at": string,"created_by": string | null,"dm_message": string,"follow_up": string | null,"follow_up_hours": number,"id": string,"keywords": (string)[],"last_error": string | null,"link_label": string | null,"link_url": string | null,"name": string,"public_replies": (string)[],"social_account_id": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"brand_id": string,"created_at"?: string,"created_by"?: string | null,"dm_message": string,"follow_up"?: string | null,"follow_up_hours"?: number,"id"?: string,"keywords": (string)[],"last_error"?: string | null,"link_label"?: string | null,"link_url"?: string | null,"name": string,"public_replies"?: (string)[],"social_account_id": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "active"?: boolean,"brand_id"?: string,"created_at"?: string,"created_by"?: string | null,"dm_message"?: string,"follow_up"?: string | null,"follow_up_hours"?: number,"id"?: string,"keywords"?: (string)[],"last_error"?: string | null,"link_label"?: string | null,"link_url"?: string | null,"name"?: string,"public_replies"?: (string)[],"social_account_id"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: []
                },"dm_contacts": {
                  Row: {
                    "automation_id": string,"brand_id": string,"click_token": string,"clicked_at": string | null,"comment_external_id": string,"comment_text": string | null,"created_at": string,"dm_sent_at": string | null,"error": string | null,"external_user_id": string,"followed_up_at": string | null,"id": string,"stage": string,"username": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "automation_id": string,"brand_id": string,"click_token": string,"clicked_at"?: string | null,"comment_external_id": string,"comment_text"?: string | null,"created_at"?: string,"dm_sent_at"?: string | null,"error"?: string | null,"external_user_id": string,"followed_up_at"?: string | null,"id"?: string,"stage"?: string,"username"?: string | null
                  }
                  Update: {
                    "automation_id"?: string,"brand_id"?: string,"click_token"?: string,"clicked_at"?: string | null,"comment_external_id"?: string,"comment_text"?: string | null,"created_at"?: string,"dm_sent_at"?: string | null,"error"?: string | null,"external_user_id"?: string,"followed_up_at"?: string | null,"id"?: string,"stage"?: string,"username"?: string | null
                  }
                  Relationships: []
                },"feature_flags": {
                  Row: {
                    "description": string | null,"enabled": boolean,"key": string,"rollout": NonNullable<Json>,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string | null,"enabled"?: boolean,"key": string,"rollout"?: NonNullable<Json>,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "description"?: string | null,"enabled"?: boolean,"key"?: string,"rollout"?: NonNullable<Json>,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "feature_flags_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"feature_requests": {
                  Row: {
                    "author_id": string | null,"body": string,"created_at": string,"id": string,"kind": string,"status": string,"title": string,"updated_at": string,"votes": number,"workspace_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"id"?: string,"kind"?: string,"status"?: string,"title": string,"updated_at"?: string,"votes"?: number,"workspace_id"?: string | null
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"id"?: string,"kind"?: string,"status"?: string,"title"?: string,"updated_at"?: string,"votes"?: number,"workspace_id"?: string | null
                  }
                  Relationships: []
                },"feature_votes": {
                  Row: {
                    "active": boolean,"created_at": string,"request_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"request_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"request_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: []
                },"gallery_categories": {
                  Row: {
                    "brand_id": string,"created_at": string,"id": string,"name": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"created_at"?: string,"id"?: string,"name": string,"workspace_id": string
                  }
                  Update: {
                    "brand_id"?: string,"created_at"?: string,"id"?: string,"name"?: string,"workspace_id"?: string
                  }
                  Relationships: []
                },"historical_posts": {
                  Row: {
                    "brand_id": string,"external_id": string,"id": string,"imported_at": string,"media": Json | null,"metrics": NonNullable<Json>,"permalink": string | null,"post_type": string | null,"published_at": string | null,"social_account_id": string,"text_content": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"external_id": string,"id"?: string,"imported_at"?: string,"media"?: Json | null,"metrics"?: NonNullable<Json>,"permalink"?: string | null,"post_type"?: string | null,"published_at"?: string | null,"social_account_id": string,"text_content"?: string | null
                  }
                  Update: {
                    "brand_id"?: string,"external_id"?: string,"id"?: string,"imported_at"?: string,"media"?: Json | null,"metrics"?: NonNullable<Json>,"permalink"?: string | null,"post_type"?: string | null,"published_at"?: string | null,"social_account_id"?: string,"text_content"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "historical_posts_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "historical_posts_social_account_id_fkey"
      columns: ["social_account_id"]
isOneToOne: false
      referencedRelation: "social_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "historical_posts_social_account_id_fkey"
      columns: ["social_account_id"]
isOneToOne: false
      referencedRelation: "social_accounts_public"
      referencedColumns: ["id"]
    }
                  ]
                },"holidays": {
                  Row: {
                    "country": string,"date": string,"id": string,"kind": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "country": string,"date": string,"id"?: string,"kind"?: string,"name": string
                  }
                  Update: {
                    "country"?: string,"date"?: string,"id"?: string,"kind"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"idempotency_keys": {
                  Row: {
                    "created_at": string,"expires_at": string,"id": string,"key": string,"request_hash": string,"response_body": Json | null,"response_status": number | null,"scope": string,"status": string,"user_id": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at"?: string,"id"?: string,"key": string,"request_hash": string,"response_body"?: Json | null,"response_status"?: number | null,"scope": string,"status"?: string,"user_id"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"id"?: string,"key"?: string,"request_hash"?: string,"response_body"?: Json | null,"response_status"?: number | null,"scope"?: string,"status"?: string,"user_id"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "idempotency_keys_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "idempotency_keys_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"impersonation_sessions": {
                  Row: {
                    "admin_id": string,"end_reason": string | null,"ended_at": string | null,"expires_at": string,"id": string,"ip": unknown,"mode": Database["public"]['Enums']["impersonation_mode"],"reason": string,"started_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_id": string,"end_reason"?: string | null,"ended_at"?: string | null,"expires_at"?: string,"id"?: string,"ip"?: unknown,"mode"?: Database["public"]['Enums']["impersonation_mode"],"reason": string,"started_at"?: string,"user_id": string
                  }
                  Update: {
                    "admin_id"?: string,"end_reason"?: string | null,"ended_at"?: string | null,"expires_at"?: string,"id"?: string,"ip"?: unknown,"mode"?: Database["public"]['Enums']["impersonation_mode"],"reason"?: string,"started_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "impersonation_sessions_admin_id_fkey"
      columns: ["admin_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "impersonation_sessions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"inbox_messages": {
                  Row: {
                    "author_name": string | null,"body": string,"brand_id": string,"created_at": string,"direction": string,"external_id": string | null,"id": string,"sent_at": string,"sent_by": string | null,"source": string,"thread_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_name"?: string | null,"body": string,"brand_id": string,"created_at"?: string,"direction": string,"external_id"?: string | null,"id"?: string,"sent_at"?: string,"sent_by"?: string | null,"source"?: string,"thread_id": string
                  }
                  Update: {
                    "author_name"?: string | null,"body"?: string,"brand_id"?: string,"created_at"?: string,"direction"?: string,"external_id"?: string | null,"id"?: string,"sent_at"?: string,"sent_by"?: string | null,"source"?: string,"thread_id"?: string
                  }
                  Relationships: []
                },"inbox_threads": {
                  Row: {
                    "author_external_id": string | null,"author_handle": string | null,"author_name": string | null,"brand_id": string,"created_at": string,"external_id": string,"id": string,"kind": string,"last_inbound_at": string | null,"last_message_at": string,"platform": Database["public"]['Enums']["social_platform"],"post_excerpt": string | null,"post_external_id": string | null,"post_permalink": string | null,"preview": string,"rating": number | null,"social_account_id": string,"status": string,"unread": boolean,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_external_id"?: string | null,"author_handle"?: string | null,"author_name"?: string | null,"brand_id": string,"created_at"?: string,"external_id": string,"id"?: string,"kind": string,"last_inbound_at"?: string | null,"last_message_at"?: string,"platform": Database["public"]['Enums']["social_platform"],"post_excerpt"?: string | null,"post_external_id"?: string | null,"post_permalink"?: string | null,"preview"?: string,"rating"?: number | null,"social_account_id": string,"status"?: string,"unread"?: boolean,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "author_external_id"?: string | null,"author_handle"?: string | null,"author_name"?: string | null,"brand_id"?: string,"created_at"?: string,"external_id"?: string,"id"?: string,"kind"?: string,"last_inbound_at"?: string | null,"last_message_at"?: string,"platform"?: Database["public"]['Enums']["social_platform"],"post_excerpt"?: string | null,"post_external_id"?: string | null,"post_permalink"?: string | null,"preview"?: string,"rating"?: number | null,"social_account_id"?: string,"status"?: string,"unread"?: boolean,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: []
                },"insights": {
                  Row: {
                    "ai_generation_id": string | null,"brand_id": string,"created_at": string,"id": string,"items": NonNullable<Json>,"period_end": string,"period_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_generation_id"?: string | null,"brand_id": string,"created_at"?: string,"id"?: string,"items": NonNullable<Json>,"period_end": string,"period_start": string
                  }
                  Update: {
                    "ai_generation_id"?: string | null,"brand_id"?: string,"created_at"?: string,"id"?: string,"items"?: NonNullable<Json>,"period_end"?: string,"period_start"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "insights_ai_generation_id_fkey"
      columns: ["ai_generation_id"]
isOneToOne: false
      referencedRelation: "ai_generations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "insights_ai_generation_id_fkey"
      columns: ["ai_generation_id"]
isOneToOne: false
      referencedRelation: "ai_generations_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "insights_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"brand_ids": (string)[] | null,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string,"role": Database["public"]['Enums']["workspace_role"],"status": Database["public"]['Enums']["invitation_status"],"token_hash": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"brand_ids"?: (string)[] | null,"created_at"?: string,"email": string,"expires_at"?: string,"id"?: string,"invited_by": string,"role": Database["public"]['Enums']["workspace_role"],"status"?: Database["public"]['Enums']["invitation_status"],"token_hash": string,"workspace_id": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"brand_ids"?: (string)[] | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string,"role"?: Database["public"]['Enums']["workspace_role"],"status"?: Database["public"]['Enums']["invitation_status"],"token_hash"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_accepted_by_fkey"
      columns: ["accepted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"knowledge_chunks": {
                  Row: {
                    "brand_id": string,"chunk_index": number,"content": string,"content_hash": string,"created_at": string,"embedding": string,"id": string,"metadata": NonNullable<Json>,"source_id": string | null,"source_type": string,"token_count": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"chunk_index"?: number,"content": string,"content_hash": string,"created_at"?: string,"embedding": string,"id"?: string,"metadata"?: NonNullable<Json>,"source_id"?: string | null,"source_type": string,"token_count"?: number | null
                  }
                  Update: {
                    "brand_id"?: string,"chunk_index"?: number,"content"?: string,"content_hash"?: string,"created_at"?: string,"embedding"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"source_id"?: string | null,"source_type"?: string,"token_count"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "knowledge_chunks_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    }
                  ]
                },"media_assets": {
                  Row: {
                    "ai_generation_id": string | null,"alt_text": string | null,"attribution": Json | null,"brand_id": string | null,"bucket": string,"created_at": string,"deleted_at": string | null,"duration_ms": number | null,"exif_stripped": boolean,"height": number | null,"id": string,"is_ai_generated": boolean,"kind": Database["public"]['Enums']["media_kind"],"mime_type": string,"sha256": string | null,"size_bytes": number,"source": Database["public"]['Enums']["media_source"],"source_data": Json | null,"storage_path": string,"tags": (string)[],"uploaded_by": string | null,"width": number | null,"workspace_id": string,"category_id": string | null,"description": string | null,"last_used_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_generation_id"?: string | null,"alt_text"?: string | null,"attribution"?: Json | null,"brand_id"?: string | null,"bucket": string,"created_at"?: string,"deleted_at"?: string | null,"duration_ms"?: number | null,"exif_stripped"?: boolean,"height"?: number | null,"id"?: string,"is_ai_generated"?: boolean,"kind": Database["public"]['Enums']["media_kind"],"mime_type": string,"sha256"?: string | null,"size_bytes": number,"source": Database["public"]['Enums']["media_source"],"source_data"?: Json | null,"storage_path": string,"tags"?: (string)[],"uploaded_by"?: string | null,"width"?: number | null,"workspace_id": string,"category_id"?: string | null,"description"?: string | null,"last_used_at"?: string | null
                  }
                  Update: {
                    "ai_generation_id"?: string | null,"alt_text"?: string | null,"attribution"?: Json | null,"brand_id"?: string | null,"bucket"?: string,"created_at"?: string,"deleted_at"?: string | null,"duration_ms"?: number | null,"exif_stripped"?: boolean,"height"?: number | null,"id"?: string,"is_ai_generated"?: boolean,"kind"?: Database["public"]['Enums']["media_kind"],"mime_type"?: string,"sha256"?: string | null,"size_bytes"?: number,"source"?: Database["public"]['Enums']["media_source"],"source_data"?: Json | null,"storage_path"?: string,"tags"?: (string)[],"uploaded_by"?: string | null,"width"?: number | null,"workspace_id"?: string,"category_id"?: string | null,"description"?: string | null,"last_used_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "media_assets_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "media_assets_gen_fk"
      columns: ["ai_generation_id"]
isOneToOne: false
      referencedRelation: "ai_generations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "media_assets_gen_fk"
      columns: ["ai_generation_id"]
isOneToOne: false
      referencedRelation: "ai_generations_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "media_assets_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "media_assets_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"member_brand_access": {
                  Row: {
                    "brand_id": string,"created_at": string,"user_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"created_at"?: string,"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "brand_id"?: string,"created_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "member_brand_access_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "member_brand_access_workspace_id_user_id_fkey"
      columns: ["workspace_id","user_id"]
isOneToOne: false
      referencedRelation: "workspace_members"
      referencedColumns: ["workspace_id","user_id"]
    }
                  ]
                },"month_plan_items": {
                  Row: {
                    "brand_id": string,"brief": string,"created_at": string,"cta": string | null,"error": string | null,"format": string,"goal": string,"id": string,"pillar": string | null,"plan_id": string,"platforms": (string)[],"position": number,"post_id": string | null,"scheduled_for": string,"status": string,"topic": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"brief"?: string,"created_at"?: string,"cta"?: string | null,"error"?: string | null,"format": string,"goal"?: string,"id"?: string,"pillar"?: string | null,"plan_id": string,"platforms": (string)[],"position": number,"post_id"?: string | null,"scheduled_for": string,"status"?: string,"topic": string,"updated_at"?: string
                  }
                  Update: {
                    "brand_id"?: string,"brief"?: string,"created_at"?: string,"cta"?: string | null,"error"?: string | null,"format"?: string,"goal"?: string,"id"?: string,"pillar"?: string | null,"plan_id"?: string,"platforms"?: (string)[],"position"?: number,"post_id"?: string | null,"scheduled_for"?: string,"status"?: string,"topic"?: string,"updated_at"?: string
                  }
                  Relationships: []
                },"month_plans": {
                  Row: {
                    "brand_id": string,"created_at": string,"created_by": string | null,"error": string | null,"id": string,"month": string,"period_end": string,"period_start": string,"settings": Json,"status": string,"tokens_charged": number,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"created_at"?: string,"created_by"?: string | null,"error"?: string | null,"id"?: string,"month": string,"period_end": string,"period_start": string,"settings"?: Json,"status"?: string,"tokens_charged"?: number,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "brand_id"?: string,"created_at"?: string,"created_by"?: string | null,"error"?: string | null,"id"?: string,"month"?: string,"period_end"?: string,"period_start"?: string,"settings"?: Json,"status"?: string,"tokens_charged"?: number,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: []
                },"notification_preferences": {
                  Row: {
                    "channel": Database["public"]['Enums']["notification_channel"],"enabled": boolean,"type": string,"user_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "channel": Database["public"]['Enums']["notification_channel"],"enabled"?: boolean,"type": string,"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "channel"?: Database["public"]['Enums']["notification_channel"],"enabled"?: boolean,"type"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_preferences_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"brand_id": string | null,"created_at": string,"data": NonNullable<Json>,"id": string,"read_at": string | null,"title": string,"type": string,"user_id": string,"workspace_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"brand_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"read_at"?: string | null,"title": string,"type": string,"user_id": string,"workspace_id"?: string | null
                  }
                  Update: {
                    "body"?: string | null,"brand_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"read_at"?: string | null,"title"?: string,"type"?: string,"user_id"?: string,"workspace_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"oauth_states": {
                  Row: {
                    "brand_id": string | null,"code_verifier_enc": string | null,"created_at": string,"expires_at": string,"id": string,"provider": string,"redirect_to": string | null,"state_hash": string,"used_at": string | null,"user_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id"?: string | null,"code_verifier_enc"?: string | null,"created_at"?: string,"expires_at"?: string,"id"?: string,"provider": string,"redirect_to"?: string | null,"state_hash": string,"used_at"?: string | null,"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "brand_id"?: string | null,"code_verifier_enc"?: string | null,"created_at"?: string,"expires_at"?: string,"id"?: string,"provider"?: string,"redirect_to"?: string | null,"state_hash"?: string,"used_at"?: string | null,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "oauth_states_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "oauth_states_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "oauth_states_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_events": {
                  Row: {
                    "error": string | null,"event_id": string,"event_type": string,"id": string,"payload": NonNullable<Json>,"processed_at": string | null,"provider": string,"received_at": string,"status": Database["public"]['Enums']["payment_event_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "error"?: string | null,"event_id": string,"event_type": string,"id"?: string,"payload": NonNullable<Json>,"processed_at"?: string | null,"provider": string,"received_at"?: string,"status"?: Database["public"]['Enums']["payment_event_status"]
                  }
                  Update: {
                    "error"?: string | null,"event_id"?: string,"event_type"?: string,"id"?: string,"payload"?: NonNullable<Json>,"processed_at"?: string | null,"provider"?: string,"received_at"?: string,"status"?: Database["public"]['Enums']["payment_event_status"]
                  }
                  Relationships: [
                    
                  ]
                },"plans": {
                  Row: {
                    "code": string,"currency": string,"id": string,"interval": string | null,"is_active": boolean,"kind": Database["public"]['Enums']["plan_kind"],"limits": NonNullable<Json>,"name": string,"price_cents": number,"provider_price_ids": NonNullable<Json>,"regular_price_cents": number | null,"sort_order": number,"token_period": string,"tokens_per_period": number
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"currency"?: string,"id"?: string,"interval"?: string | null,"is_active"?: boolean,"kind": Database["public"]['Enums']["plan_kind"],"limits"?: NonNullable<Json>,"name": string,"price_cents"?: number,"provider_price_ids"?: NonNullable<Json>,"regular_price_cents"?: number | null,"sort_order"?: number,"token_period"?: string,"tokens_per_period": number
                  }
                  Update: {
                    "code"?: string,"currency"?: string,"id"?: string,"interval"?: string | null,"is_active"?: boolean,"kind"?: Database["public"]['Enums']["plan_kind"],"limits"?: NonNullable<Json>,"name"?: string,"price_cents"?: number,"provider_price_ids"?: NonNullable<Json>,"regular_price_cents"?: number | null,"sort_order"?: number,"token_period"?: string,"tokens_per_period"?: number
                  }
                  Relationships: [
                    
                  ]
                },"platform_admin_allowlist": {
                  Row: {
                    "created_at": string,"email": string,"note": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"note"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"note"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"platform_settings": {
                  Row: {
                    "description": string | null,"is_public": boolean,"key": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string | null,"is_public"?: boolean,"key": string,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "description"?: string | null,"is_public"?: boolean,"key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "platform_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"post_comments": {
                  Row: {
                    "approval_link_id": string | null,"author_id": string | null,"author_name": string | null,"body": string,"brand_id": string,"created_at": string,"deleted_at": string | null,"id": string,"mentions": (string)[],"post_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approval_link_id"?: string | null,"author_id"?: string | null,"author_name"?: string | null,"body": string,"brand_id": string,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"mentions"?: (string)[],"post_id": string
                  }
                  Update: {
                    "approval_link_id"?: string | null,"author_id"?: string | null,"author_name"?: string | null,"body"?: string,"brand_id"?: string,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"mentions"?: (string)[],"post_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_comments_approval_link_id_fkey"
      columns: ["approval_link_id"]
isOneToOne: false
      referencedRelation: "approval_links"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_comments_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_comments_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"post_media": {
                  Row: {
                    "crop": Json | null,"id": string,"media_asset_id": string,"post_id": string,"sort_order": number,"target_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "crop"?: Json | null,"id"?: string,"media_asset_id": string,"post_id": string,"sort_order"?: number,"target_id"?: string | null
                  }
                  Update: {
                    "crop"?: Json | null,"id"?: string,"media_asset_id"?: string,"post_id"?: string,"sort_order"?: number,"target_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_media_media_asset_id_fkey"
      columns: ["media_asset_id"]
isOneToOne: false
      referencedRelation: "media_assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_media_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_media_target_id_fkey"
      columns: ["target_id"]
isOneToOne: false
      referencedRelation: "post_targets"
      referencedColumns: ["id"]
    }
                  ]
                },"post_metrics_snapshots": {
                  Row: {
                    "brand_id": string,"captured_at": string,"comments": number | null,"engagement_rate": number | null,"horizon": string,"id": number,"impressions": number | null,"link_clicks": number | null,"raw": Json | null,"reach": number | null,"reactions": number | null,"saves": number | null,"shares": number | null,"social_account_id": string,"target_id": string,"video_views": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"captured_at"?: string,"comments"?: number | null,"engagement_rate"?: number | null,"horizon": string,"id"?: number,"impressions"?: number | null,"link_clicks"?: number | null,"raw"?: Json | null,"reach"?: number | null,"reactions"?: number | null,"saves"?: number | null,"shares"?: number | null,"social_account_id": string,"target_id": string,"video_views"?: number | null
                  }
                  Update: {
                    "brand_id"?: string,"captured_at"?: string,"comments"?: number | null,"engagement_rate"?: number | null,"horizon"?: string,"id"?: number,"impressions"?: number | null,"link_clicks"?: number | null,"raw"?: Json | null,"reach"?: number | null,"reactions"?: number | null,"saves"?: number | null,"shares"?: number | null,"social_account_id"?: string,"target_id"?: string,"video_views"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_metrics_snapshots_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_metrics_snapshots_social_account_id_fkey"
      columns: ["social_account_id"]
isOneToOne: false
      referencedRelation: "social_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_metrics_snapshots_social_account_id_fkey"
      columns: ["social_account_id"]
isOneToOne: false
      referencedRelation: "social_accounts_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_metrics_snapshots_target_id_fkey"
      columns: ["target_id"]
isOneToOne: false
      referencedRelation: "post_targets"
      referencedColumns: ["id"]
    }
                  ]
                },"post_targets": {
                  Row: {
                    "assisted": boolean,"assisted_done_at": string | null,"attempt_count": number,"brand_id": string,"created_at": string,"external_post_id": string | null,"id": string,"idempotency_key": string,"inngest_run_id": string | null,"last_attempt_at": string | null,"last_error_code": string | null,"last_error_message": string | null,"options": NonNullable<Json>,"permalink": string | null,"platform": Database["public"]['Enums']["social_platform"],"post_id": string,"publish_latency_ms": number | null,"published_at": string | null,"scheduled_at": string | null,"social_account_id": string,"status": Database["public"]['Enums']["target_status"],"text_content": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assisted"?: boolean,"assisted_done_at"?: string | null,"attempt_count"?: number,"brand_id": string,"created_at"?: string,"external_post_id"?: string | null,"id"?: string,"idempotency_key"?: string,"inngest_run_id"?: string | null,"last_attempt_at"?: string | null,"last_error_code"?: string | null,"last_error_message"?: string | null,"options"?: NonNullable<Json>,"permalink"?: string | null,"platform": Database["public"]['Enums']["social_platform"],"post_id": string,"publish_latency_ms"?: number | null,"published_at"?: string | null,"scheduled_at"?: string | null,"social_account_id": string,"status"?: Database["public"]['Enums']["target_status"],"text_content"?: string,"updated_at"?: string
                  }
                  Update: {
                    "assisted"?: boolean,"assisted_done_at"?: string | null,"attempt_count"?: number,"brand_id"?: string,"created_at"?: string,"external_post_id"?: string | null,"id"?: string,"idempotency_key"?: string,"inngest_run_id"?: string | null,"last_attempt_at"?: string | null,"last_error_code"?: string | null,"last_error_message"?: string | null,"options"?: NonNullable<Json>,"permalink"?: string | null,"platform"?: Database["public"]['Enums']["social_platform"],"post_id"?: string,"publish_latency_ms"?: number | null,"published_at"?: string | null,"scheduled_at"?: string | null,"social_account_id"?: string,"status"?: Database["public"]['Enums']["target_status"],"text_content"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_targets_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_targets_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_targets_social_account_id_fkey"
      columns: ["social_account_id"]
isOneToOne: false
      referencedRelation: "social_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_targets_social_account_id_fkey"
      columns: ["social_account_id"]
isOneToOne: false
      referencedRelation: "social_accounts_public"
      referencedColumns: ["id"]
    }
                  ]
                },"post_versions": {
                  Row: {
                    "change_summary": string | null,"changed_by": string | null,"created_at": string,"id": string,"post_id": string,"snapshot": NonNullable<Json>,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "change_summary"?: string | null,"changed_by"?: string | null,"created_at"?: string,"id"?: string,"post_id": string,"snapshot": NonNullable<Json>,"version": number
                  }
                  Update: {
                    "change_summary"?: string | null,"changed_by"?: string | null,"created_at"?: string,"id"?: string,"post_id"?: string,"snapshot"?: NonNullable<Json>,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_versions_changed_by_fkey"
      columns: ["changed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_versions_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"posts": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"brand_id": string,"campaign_id": string | null,"created_at": string,"created_by": string | null,"deleted_at": string | null,"design": Json | null,"evergreen_interval_days": number | null,"first_comment": string | null,"flow_id": string | null,"id": string,"is_evergreen": boolean,"language": string | null,"link_url": string | null,"locked_at": string | null,"master_text": string,"parent_post_id": string | null,"pillar_id": string | null,"qa_report": Json | null,"scheduled_for": string | null,"similarity_warning": Json | null,"source": Database["public"]['Enums']["post_source"],"status": Database["public"]['Enums']["post_status"],"strategy_id": string | null,"submitted_at": string | null,"suggestion_id": string | null,"title": string | null,"updated_at": string,"utm": Json | null,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"brand_id": string,"campaign_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"design"?: Json | null,"evergreen_interval_days"?: number | null,"first_comment"?: string | null,"flow_id"?: string | null,"id"?: string,"is_evergreen"?: boolean,"language"?: string | null,"link_url"?: string | null,"locked_at"?: string | null,"master_text"?: string,"parent_post_id"?: string | null,"pillar_id"?: string | null,"qa_report"?: Json | null,"scheduled_for"?: string | null,"similarity_warning"?: Json | null,"source"?: Database["public"]['Enums']["post_source"],"status"?: Database["public"]['Enums']["post_status"],"strategy_id"?: string | null,"submitted_at"?: string | null,"suggestion_id"?: string | null,"title"?: string | null,"updated_at"?: string,"utm"?: Json | null,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"brand_id"?: string,"campaign_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"design"?: Json | null,"evergreen_interval_days"?: number | null,"first_comment"?: string | null,"flow_id"?: string | null,"id"?: string,"is_evergreen"?: boolean,"language"?: string | null,"link_url"?: string | null,"locked_at"?: string | null,"master_text"?: string,"parent_post_id"?: string | null,"pillar_id"?: string | null,"qa_report"?: Json | null,"scheduled_for"?: string | null,"similarity_warning"?: Json | null,"source"?: Database["public"]['Enums']["post_source"],"status"?: Database["public"]['Enums']["post_status"],"strategy_id"?: string | null,"submitted_at"?: string | null,"suggestion_id"?: string | null,"title"?: string | null,"updated_at"?: string,"utm"?: Json | null,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "posts_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_parent_post_id_fkey"
      columns: ["parent_post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_pillar_id_fkey"
      columns: ["pillar_id"]
isOneToOne: false
      referencedRelation: "content_pillars"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_strategy_id_fkey"
      columns: ["strategy_id"]
isOneToOne: false
      referencedRelation: "strategies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_suggestion_fk"
      columns: ["suggestion_id"]
isOneToOne: false
      referencedRelation: "suggestions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"banned_at": string | null,"banned_reason": string | null,"created_at": string,"email": string,"email_verified_at": string | null,"full_name": string | null,"id": string,"is_banned": boolean,"last_seen_at": string | null,"locale": string,"onboarding_completed_at": string | null,"platform_role": Database["public"]['Enums']["platform_role"],"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"banned_at"?: string | null,"banned_reason"?: string | null,"created_at"?: string,"email": string,"email_verified_at"?: string | null,"full_name"?: string | null,"id": string,"is_banned"?: boolean,"last_seen_at"?: string | null,"locale"?: string,"onboarding_completed_at"?: string | null,"platform_role"?: Database["public"]['Enums']["platform_role"],"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"banned_at"?: string | null,"banned_reason"?: string | null,"created_at"?: string,"email"?: string,"email_verified_at"?: string | null,"full_name"?: string | null,"id"?: string,"is_banned"?: boolean,"last_seen_at"?: string | null,"locale"?: string,"onboarding_completed_at"?: string | null,"platform_role"?: Database["public"]['Enums']["platform_role"],"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"publish_attempts": {
                  Row: {
                    "attempt_no": number,"brand_id": string,"error_code": string | null,"error_message": string | null,"finished_at": string | null,"http_status": number | null,"id": number,"inngest_run_id": string | null,"outcome": string | null,"response_excerpt": Json | null,"started_at": string,"target_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_no": number,"brand_id": string,"error_code"?: string | null,"error_message"?: string | null,"finished_at"?: string | null,"http_status"?: number | null,"id"?: number,"inngest_run_id"?: string | null,"outcome"?: string | null,"response_excerpt"?: Json | null,"started_at"?: string,"target_id": string
                  }
                  Update: {
                    "attempt_no"?: number,"brand_id"?: string,"error_code"?: string | null,"error_message"?: string | null,"finished_at"?: string | null,"http_status"?: number | null,"id"?: number,"inngest_run_id"?: string | null,"outcome"?: string | null,"response_excerpt"?: Json | null,"started_at"?: string,"target_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "publish_attempts_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "publish_attempts_target_id_fkey"
      columns: ["target_id"]
isOneToOne: false
      referencedRelation: "post_targets"
      referencedColumns: ["id"]
    }
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"id": string,"last_sent_at": string | null,"p256dh": string,"user_agent": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"id"?: string,"last_sent_at"?: string | null,"p256dh": string,"user_agent"?: string | null,"user_id": string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"last_sent_at"?: string | null,"p256dh"?: string,"user_agent"?: string | null,"user_id"?: string
                  }
                  Relationships: []
                },"queue_slots": {
                  Row: {
                    "brand_id": string,"id": string,"is_active": boolean,"social_account_id": string,"source": string,"time_local": string,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"id"?: string,"is_active"?: boolean,"social_account_id": string,"source"?: string,"time_local": string,"weekday": number
                  }
                  Update: {
                    "brand_id"?: string,"id"?: string,"is_active"?: boolean,"social_account_id"?: string,"source"?: string,"time_local"?: string,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "queue_slots_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "queue_slots_social_account_id_fkey"
      columns: ["social_account_id"]
isOneToOne: false
      referencedRelation: "social_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "queue_slots_social_account_id_fkey"
      columns: ["social_account_id"]
isOneToOne: false
      referencedRelation: "social_accounts_public"
      referencedColumns: ["id"]
    }
                  ]
                },"reports": {
                  Row: {
                    "brand_id": string,"created_at": string,"created_by": string | null,"id": string,"period_end": string,"period_start": string,"sent_to": (string)[] | null,"status": string,"storage_path": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"period_end": string,"period_start": string,"sent_to"?: (string)[] | null,"status"?: string,"storage_path"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "brand_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"period_end"?: string,"period_start"?: string,"sent_to"?: (string)[] | null,"status"?: string,"storage_path"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reports_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"social_accounts": {
                  Row: {
                    "access_token_enc": string | null,"account_type": string,"assisted_only": boolean,"avatar_url": string | null,"brand_id": string,"capabilities": NonNullable<Json>,"connected_by": string | null,"created_at": string,"external_id": string,"external_parent_id": string | null,"id": string,"key_version": number,"last_error": string | null,"last_synced_at": string | null,"metadata": NonNullable<Json>,"name": string,"platform": Database["public"]['Enums']["social_platform"],"refresh_token_enc": string | null,"refresh_token_expires_at": string | null,"scopes": (string)[],"status": Database["public"]['Enums']["social_account_status"],"status_reason": string | null,"token_expires_at": string | null,"updated_at": string,"username": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "access_token_enc"?: string | null,"account_type": string,"assisted_only"?: boolean,"avatar_url"?: string | null,"brand_id": string,"capabilities"?: NonNullable<Json>,"connected_by"?: string | null,"created_at"?: string,"external_id": string,"external_parent_id"?: string | null,"id"?: string,"key_version"?: number,"last_error"?: string | null,"last_synced_at"?: string | null,"metadata"?: NonNullable<Json>,"name": string,"platform": Database["public"]['Enums']["social_platform"],"refresh_token_enc"?: string | null,"refresh_token_expires_at"?: string | null,"scopes"?: (string)[],"status"?: Database["public"]['Enums']["social_account_status"],"status_reason"?: string | null,"token_expires_at"?: string | null,"updated_at"?: string,"username"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "access_token_enc"?: string | null,"account_type"?: string,"assisted_only"?: boolean,"avatar_url"?: string | null,"brand_id"?: string,"capabilities"?: NonNullable<Json>,"connected_by"?: string | null,"created_at"?: string,"external_id"?: string,"external_parent_id"?: string | null,"id"?: string,"key_version"?: number,"last_error"?: string | null,"last_synced_at"?: string | null,"metadata"?: NonNullable<Json>,"name"?: string,"platform"?: Database["public"]['Enums']["social_platform"],"refresh_token_enc"?: string | null,"refresh_token_expires_at"?: string | null,"scopes"?: (string)[],"status"?: Database["public"]['Enums']["social_account_status"],"status_reason"?: string | null,"token_expires_at"?: string | null,"updated_at"?: string,"username"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "social_accounts_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "social_accounts_connected_by_fkey"
      columns: ["connected_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "social_accounts_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"status_transitions": {
                  Row: {
                    "from_status": string,"scope": string,"service_only": boolean,"to_status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "from_status": string,"scope": string,"service_only"?: boolean,"to_status": string
                  }
                  Update: {
                    "from_status"?: string,"scope"?: string,"service_only"?: boolean,"to_status"?: string
                  }
                  Relationships: [
                    
                  ]
                },"strategies": {
                  Row: {
                    "ai_generation_id": string | null,"approved_at": string | null,"approved_by": string | null,"assumptions": NonNullable<Json>,"best_times": NonNullable<Json>,"brand_id": string,"created_at": string,"created_by": string | null,"goals": NonNullable<Json>,"hashtag_strategy": NonNullable<Json>,"id": string,"network_mix": NonNullable<Json>,"period_end": string,"period_start": string,"status": Database["public"]['Enums']["strategy_status"],"summary": string | null,"updated_at": string,"uses_assumptions": boolean,"version": number,"weekly_themes": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_generation_id"?: string | null,"approved_at"?: string | null,"approved_by"?: string | null,"assumptions"?: NonNullable<Json>,"best_times"?: NonNullable<Json>,"brand_id": string,"created_at"?: string,"created_by"?: string | null,"goals"?: NonNullable<Json>,"hashtag_strategy"?: NonNullable<Json>,"id"?: string,"network_mix"?: NonNullable<Json>,"period_end": string,"period_start": string,"status"?: Database["public"]['Enums']["strategy_status"],"summary"?: string | null,"updated_at"?: string,"uses_assumptions"?: boolean,"version"?: number,"weekly_themes"?: NonNullable<Json>
                  }
                  Update: {
                    "ai_generation_id"?: string | null,"approved_at"?: string | null,"approved_by"?: string | null,"assumptions"?: NonNullable<Json>,"best_times"?: NonNullable<Json>,"brand_id"?: string,"created_at"?: string,"created_by"?: string | null,"goals"?: NonNullable<Json>,"hashtag_strategy"?: NonNullable<Json>,"id"?: string,"network_mix"?: NonNullable<Json>,"period_end"?: string,"period_start"?: string,"status"?: Database["public"]['Enums']["strategy_status"],"summary"?: string | null,"updated_at"?: string,"uses_assumptions"?: boolean,"version"?: number,"weekly_themes"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "strategies_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "strategies_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "strategies_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "strategies_gen_fk"
      columns: ["ai_generation_id"]
isOneToOne: false
      referencedRelation: "ai_generations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "strategies_gen_fk"
      columns: ["ai_generation_id"]
isOneToOne: false
      referencedRelation: "ai_generations_public"
      referencedColumns: ["id"]
    }
                  ]
                },"studio_messages": {
                  Row: {
                    "action": string | null,"attachments": Json,"body": string,"brand_id": string,"created_at": string,"id": string,"meta": Json,"post_id": string | null,"role": string,"user_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action"?: string | null,"attachments"?: Json,"body": string,"brand_id": string,"created_at"?: string,"id"?: string,"meta"?: Json,"post_id"?: string | null,"role": string,"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "action"?: string | null,"attachments"?: Json,"body"?: string,"brand_id"?: string,"created_at"?: string,"id"?: string,"meta"?: Json,"post_id"?: string | null,"role"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: []
                },"subscriptions": {
                  Row: {
                    "cancel_at_period_end": boolean,"canceled_at": string | null,"created_at": string,"current_period_end": string | null,"current_period_start": string | null,"dunning_step": number,"grace_until": string | null,"id": string,"last_invoice_id": string | null,"plan_id": string,"provider": string,"provider_customer_id": string,"provider_subscription_id": string,"raw": Json | null,"status": Database["public"]['Enums']["subscription_status"],"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancel_at_period_end"?: boolean,"canceled_at"?: string | null,"created_at"?: string,"current_period_end"?: string | null,"current_period_start"?: string | null,"dunning_step"?: number,"grace_until"?: string | null,"id"?: string,"last_invoice_id"?: string | null,"plan_id": string,"provider": string,"provider_customer_id": string,"provider_subscription_id": string,"raw"?: Json | null,"status": Database["public"]['Enums']["subscription_status"],"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "cancel_at_period_end"?: boolean,"canceled_at"?: string | null,"created_at"?: string,"current_period_end"?: string | null,"current_period_start"?: string | null,"dunning_step"?: number,"grace_until"?: string | null,"id"?: string,"last_invoice_id"?: string | null,"plan_id"?: string,"provider"?: string,"provider_customer_id"?: string,"provider_subscription_id"?: string,"raw"?: Json | null,"status"?: Database["public"]['Enums']["subscription_status"],"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscriptions_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"suggestions": {
                  Row: {
                    "accepted_post_id": string | null,"body": string | null,"brand_id": string,"created_at": string,"decided_at": string | null,"decided_by": string | null,"evidence": Json | null,"expires_at": string | null,"id": string,"kind": string,"payload": NonNullable<Json>,"score": number | null,"source": Database["public"]['Enums']["suggestion_source"],"status": Database["public"]['Enums']["suggestion_status"],"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_post_id"?: string | null,"body"?: string | null,"brand_id": string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"evidence"?: Json | null,"expires_at"?: string | null,"id"?: string,"kind": string,"payload"?: NonNullable<Json>,"score"?: number | null,"source": Database["public"]['Enums']["suggestion_source"],"status"?: Database["public"]['Enums']["suggestion_status"],"title": string
                  }
                  Update: {
                    "accepted_post_id"?: string | null,"body"?: string | null,"brand_id"?: string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"evidence"?: Json | null,"expires_at"?: string | null,"id"?: string,"kind"?: string,"payload"?: NonNullable<Json>,"score"?: number | null,"source"?: Database["public"]['Enums']["suggestion_source"],"status"?: Database["public"]['Enums']["suggestion_status"],"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "suggestions_accepted_post_id_fkey"
      columns: ["accepted_post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "suggestions_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "suggestions_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"token_grants": {
                  Row: {
                    "amount": number,"created_at": string,"created_by": string | null,"expires_at": string | null,"id": string,"note": string | null,"reference": string | null,"reference_type": string | null,"remaining": number,"source": Database["public"]['Enums']["token_grant_source"],"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"note"?: string | null,"reference"?: string | null,"reference_type"?: string | null,"remaining": number,"source": Database["public"]['Enums']["token_grant_source"],"workspace_id": string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"note"?: string | null,"reference"?: string | null,"reference_type"?: string | null,"remaining"?: number,"source"?: Database["public"]['Enums']["token_grant_source"],"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "token_grants_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "token_grants_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"token_ledger": {
                  Row: {
                    "actor_id": string | null,"balance_after": number,"created_at": string,"delta": number,"generation_id": string | null,"grant_id": string | null,"id": number,"note": string | null,"reason": Database["public"]['Enums']["ledger_reason"],"reference": string | null,"reservation_id": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"balance_after": number,"created_at"?: string,"delta": number,"generation_id"?: string | null,"grant_id"?: string | null,"id"?: number,"note"?: string | null,"reason": Database["public"]['Enums']["ledger_reason"],"reference"?: string | null,"reservation_id"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"balance_after"?: number,"created_at"?: string,"delta"?: number,"generation_id"?: string | null,"grant_id"?: string | null,"id"?: number,"note"?: string | null,"reason"?: Database["public"]['Enums']["ledger_reason"],"reference"?: string | null,"reservation_id"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "token_ledger_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "token_ledger_generation_id_fkey"
      columns: ["generation_id"]
isOneToOne: false
      referencedRelation: "ai_generations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "token_ledger_generation_id_fkey"
      columns: ["generation_id"]
isOneToOne: false
      referencedRelation: "ai_generations_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "token_ledger_grant_id_fkey"
      columns: ["grant_id"]
isOneToOne: false
      referencedRelation: "token_grants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "token_ledger_reservation_id_fkey"
      columns: ["reservation_id"]
isOneToOne: false
      referencedRelation: "token_reservations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "token_ledger_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"token_reservations": {
                  Row: {
                    "allocations": NonNullable<Json>,"amount": number,"brand_id": string | null,"created_at": string,"expires_at": string,"generation_id": string | null,"id": string,"resolved_at": string | null,"status": Database["public"]['Enums']["token_reservation_status"],"user_id": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allocations"?: NonNullable<Json>,"amount": number,"brand_id"?: string | null,"created_at"?: string,"expires_at"?: string,"generation_id"?: string | null,"id"?: string,"resolved_at"?: string | null,"status"?: Database["public"]['Enums']["token_reservation_status"],"user_id"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "allocations"?: NonNullable<Json>,"amount"?: number,"brand_id"?: string | null,"created_at"?: string,"expires_at"?: string,"generation_id"?: string | null,"id"?: string,"resolved_at"?: string | null,"status"?: Database["public"]['Enums']["token_reservation_status"],"user_id"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "token_reservations_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "token_reservations_generation_id_fkey"
      columns: ["generation_id"]
isOneToOne: false
      referencedRelation: "ai_generations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "token_reservations_generation_id_fkey"
      columns: ["generation_id"]
isOneToOne: false
      referencedRelation: "ai_generations_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "token_reservations_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "token_reservations_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"user_flags": {
                  Row: {
                    "count": number,"id": string,"kind": string,"last_at": string,"note": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count"?: number,"id"?: string,"kind": string,"last_at"?: string,"note"?: string | null,"user_id": string
                  }
                  Update: {
                    "count"?: number,"id"?: string,"kind"?: string,"last_at"?: string,"note"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_flags_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"website_crawls": {
                  Row: {
                    "ai_generation_id": string | null,"brand_id": string,"created_at": string,"created_by": string | null,"error_code": string | null,"error_message": string | null,"finished_at": string | null,"id": string,"idempotency_key": string | null,"page_limit": number,"pages_fetched": number,"pages_found": number,"phase": string | null,"progress": NonNullable<Json>,"robots_blocked": boolean,"started_at": string | null,"status": Database["public"]['Enums']["crawl_status"],"url": string,"used_firecrawl": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_generation_id"?: string | null,"brand_id": string,"created_at"?: string,"created_by"?: string | null,"error_code"?: string | null,"error_message"?: string | null,"finished_at"?: string | null,"id"?: string,"idempotency_key"?: string | null,"page_limit"?: number,"pages_fetched"?: number,"pages_found"?: number,"phase"?: string | null,"progress"?: NonNullable<Json>,"robots_blocked"?: boolean,"started_at"?: string | null,"status"?: Database["public"]['Enums']["crawl_status"],"url": string,"used_firecrawl"?: boolean
                  }
                  Update: {
                    "ai_generation_id"?: string | null,"brand_id"?: string,"created_at"?: string,"created_by"?: string | null,"error_code"?: string | null,"error_message"?: string | null,"finished_at"?: string | null,"id"?: string,"idempotency_key"?: string | null,"page_limit"?: number,"pages_fetched"?: number,"pages_found"?: number,"phase"?: string | null,"progress"?: NonNullable<Json>,"robots_blocked"?: boolean,"started_at"?: string | null,"status"?: Database["public"]['Enums']["crawl_status"],"url"?: string,"used_firecrawl"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "website_crawls_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "website_crawls_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "website_crawls_gen_fk"
      columns: ["ai_generation_id"]
isOneToOne: false
      referencedRelation: "ai_generations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "website_crawls_gen_fk"
      columns: ["ai_generation_id"]
isOneToOne: false
      referencedRelation: "ai_generations_public"
      referencedColumns: ["id"]
    }
                  ]
                },"website_pages": {
                  Row: {
                    "brand_id": string,"canonical_url": string | null,"content_hash": string,"crawl_id": string,"fetched_at": string,"headings": Json | null,"http_status": number | null,"id": string,"images": Json | null,"json_ld": Json | null,"lang": string | null,"meta_description": string | null,"open_graph": Json | null,"page_type": Database["public"]['Enums']["page_type"],"published_at": string | null,"social_links": Json | null,"text_content": string | null,"title": string | null,"url": string,"word_count": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_id": string,"canonical_url"?: string | null,"content_hash": string,"crawl_id": string,"fetched_at"?: string,"headings"?: Json | null,"http_status"?: number | null,"id"?: string,"images"?: Json | null,"json_ld"?: Json | null,"lang"?: string | null,"meta_description"?: string | null,"open_graph"?: Json | null,"page_type"?: Database["public"]['Enums']["page_type"],"published_at"?: string | null,"social_links"?: Json | null,"text_content"?: string | null,"title"?: string | null,"url": string,"word_count"?: number | null
                  }
                  Update: {
                    "brand_id"?: string,"canonical_url"?: string | null,"content_hash"?: string,"crawl_id"?: string,"fetched_at"?: string,"headings"?: Json | null,"http_status"?: number | null,"id"?: string,"images"?: Json | null,"json_ld"?: Json | null,"lang"?: string | null,"meta_description"?: string | null,"open_graph"?: Json | null,"page_type"?: Database["public"]['Enums']["page_type"],"published_at"?: string | null,"social_links"?: Json | null,"text_content"?: string | null,"title"?: string | null,"url"?: string,"word_count"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "website_pages_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "website_pages_crawl_id_fkey"
      columns: ["crawl_id"]
isOneToOne: false
      referencedRelation: "website_crawls"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_members": {
                  Row: {
                    "all_brands": boolean,"created_at": string,"invited_by": string | null,"role": Database["public"]['Enums']["workspace_role"],"user_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "all_brands"?: boolean,"created_at"?: string,"invited_by"?: string | null,"role"?: Database["public"]['Enums']["workspace_role"],"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "all_brands"?: boolean,"created_at"?: string,"invited_by"?: string | null,"role"?: Database["public"]['Enums']["workspace_role"],"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_members_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workspace_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workspace_members_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspaces": {
                  Row: {
                    "billing_email": string | null,"country": string | null,"created_at": string,"deleted_at": string | null,"id": string,"name": string,"owner_id": string,"type": Database["public"]['Enums']["workspace_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "billing_email"?: string | null,"country"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"name": string,"owner_id": string,"type"?: Database["public"]['Enums']["workspace_type"],"updated_at"?: string
                  }
                  Update: {
                    "billing_email"?: string | null,"country"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"name"?: string,"owner_id"?: string,"type"?: Database["public"]['Enums']["workspace_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspaces_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "ai_generations_public": {
                  Row: {
                    "brand_id": string | null,"created_at": string,"duration_ms": number | null,"error_code": string | null,"error_message": string | null,"fallback_used": boolean,"finished_at": string | null,"id": string,"model": string | null,"output_asset_id": string | null,"progress": Json | null,"started_at": string | null,"status": Database["public"]['Enums']["ai_generation_status"],"tokens_charged": number,"type": Database["public"]['Enums']["ai_generation_type"],"user_id": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                           "brand_id"?: string | null,"created_at"?: string | null,"duration_ms"?: number | null,"error_code"?: string | null,"error_message"?: string | null,"fallback_used"?: boolean | null,"finished_at"?: string | null,"id"?: string | null,"model"?: string | null,"output_asset_id"?: string | null,"progress"?: Json | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["ai_generation_status"] | null,"tokens_charged"?: number | null,"type"?: Database["public"]['Enums']["ai_generation_type"] | null,"user_id"?: string | null,"workspace_id"?: string | null
                         }
                        Update: {
                           "brand_id"?: string | null,"created_at"?: string | null,"duration_ms"?: number | null,"error_code"?: string | null,"error_message"?: string | null,"fallback_used"?: boolean | null,"finished_at"?: string | null,"id"?: string | null,"model"?: string | null,"output_asset_id"?: string | null,"progress"?: Json | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["ai_generation_status"] | null,"tokens_charged"?: number | null,"type"?: Database["public"]['Enums']["ai_generation_type"] | null,"user_id"?: string | null,"workspace_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "ai_generations_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_generations_output_asset_id_fkey"
      columns: ["output_asset_id"]
isOneToOne: false
      referencedRelation: "media_assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_generations_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_generations_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"canva_connections_public": {
                  Row: {
                    "autofill_available": boolean,"canva_user_id": string,"created_at": string,"id": string,"plan_hint": string | null,"scopes": (string)[],"status": Database["public"]['Enums']["social_account_status"],"team_id": string | null,"token_expires_at": string,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                           "autofill_available"?: boolean | null,"canva_user_id"?: string | null,"created_at"?: string | null,"id"?: string | null,"plan_hint"?: string | null,"scopes"?: (string)[] | null,"status"?: Database["public"]['Enums']["social_account_status"] | null,"team_id"?: string | null,"token_expires_at"?: string | null,"updated_at"?: string | null,"user_id"?: string | null,"workspace_id"?: string | null
                         }
                        Update: {
                           "autofill_available"?: boolean | null,"canva_user_id"?: string | null,"created_at"?: string | null,"id"?: string | null,"plan_hint"?: string | null,"scopes"?: (string)[] | null,"status"?: Database["public"]['Enums']["social_account_status"] | null,"team_id"?: string | null,"token_expires_at"?: string | null,"updated_at"?: string | null,"user_id"?: string | null,"workspace_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "canva_connections_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "canva_connections_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_settings_public": {
                  Row: {
                    "key": string,"updated_at": string,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                           "key"?: string | null,"updated_at"?: string | null,"value"?: Json | null
                         }
                        Update: {
                           "key"?: string | null,"updated_at"?: string | null,"value"?: Json | null
                         }
                        Relationships: [
                    
                  ]
                },"social_accounts_public": {
                  Row: {
                    "account_type": string,"assisted_only": boolean,"avatar_url": string | null,"brand_id": string,"capabilities": NonNullable<Json>,"connected_by": string | null,"created_at": string,"external_id": string,"external_parent_id": string | null,"id": string,"key_version": number,"last_error": string | null,"last_synced_at": string | null,"metadata": NonNullable<Json>,"name": string,"platform": Database["public"]['Enums']["social_platform"],"scopes": (string)[],"status": Database["public"]['Enums']["social_account_status"],"status_reason": string | null,"token_expires_at": string | null,"updated_at": string,"username": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                           "account_type"?: string | null,"assisted_only"?: boolean | null,"avatar_url"?: string | null,"brand_id"?: string | null,"capabilities"?: Json | null,"connected_by"?: string | null,"created_at"?: string | null,"external_id"?: string | null,"external_parent_id"?: string | null,"id"?: string | null,"key_version"?: number | null,"last_error"?: string | null,"last_synced_at"?: string | null,"metadata"?: Json | null,"name"?: string | null,"platform"?: Database["public"]['Enums']["social_platform"] | null,"scopes"?: (string)[] | null,"status"?: Database["public"]['Enums']["social_account_status"] | null,"status_reason"?: string | null,"token_expires_at"?: string | null,"updated_at"?: string | null,"username"?: string | null,"workspace_id"?: string | null
                         }
                        Update: {
                           "account_type"?: string | null,"assisted_only"?: boolean | null,"avatar_url"?: string | null,"brand_id"?: string | null,"capabilities"?: Json | null,"connected_by"?: string | null,"created_at"?: string | null,"external_id"?: string | null,"external_parent_id"?: string | null,"id"?: string | null,"key_version"?: number | null,"last_error"?: string | null,"last_synced_at"?: string | null,"metadata"?: Json | null,"name"?: string | null,"platform"?: Database["public"]['Enums']["social_platform"] | null,"scopes"?: (string)[] | null,"status"?: Database["public"]['Enums']["social_account_status"] | null,"status_reason"?: string | null,"token_expires_at"?: string | null,"updated_at"?: string | null,"username"?: string | null,"workspace_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "social_accounts_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "social_accounts_connected_by_fkey"
      columns: ["connected_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "social_accounts_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_token": string }; Returns: Json
                           },
"toggle_feature_vote":
{ Args: { "p_request_id": string,"p_user_id": string }; Returns: Json
                           },
"admin_activity_counts":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_adjust_tokens":
{ Args: { "p_admin_id": string,"p_audit"?: Json,"p_delta": number,"p_reason": string,"p_workspace_id": string }; Returns: number
                           },
"admin_ai_costs":
{ Args: { "p_days"?: number }; Returns: Json
                           },
"admin_auth_users":
{ Args: { "p_ids": (string)[] }; Returns: {
              "banned_until": string,"email_confirmed_at": string,"factors": number,"id": string,"last_sign_in_at": string
            }[]
                           },
"admin_dashboard_stats":
{ Args: { "p_days"?: number }; Returns: Json
                           },
"admin_revoke_user_sessions":
{ Args: { "p_user_id": string }; Returns: number
                           },
"brand_knowledge_count":
{ Args: { "p_brand_id": string }; Returns: number
                           },
"brand_workspace":
{ Args: { "b": string }; Returns: string
                           },
"can_admin":
{ Args: { "ws": string }; Returns: boolean
                           },
"can_admin_brand":
{ Args: { "b": string }; Returns: boolean
                           },
"can_approve":
{ Args: { "ws": string }; Returns: boolean
                           },
"can_edit":
{ Args: { "ws": string }; Returns: boolean
                           },
"can_edit_brand":
{ Args: { "b": string }; Returns: boolean
                           },
"confirm_reservation":
{ Args: { "p_actual_amount"?: number,"p_reservation_id": string }; Returns: number
                           },
"create_workspace":
{ Args: { "p_brand_name"?: string,"p_name": string,"p_type"?: Database["public"]['Enums']["workspace_type"],"p_website_url"?: string }; Returns: Json
                           },
"decide_post":
{ Args: { "p_actor"?: string,"p_comment": string,"p_decision": Database["public"]['Enums']["approval_decision"],"p_link_id"?: string,"p_post_id": string,"p_post_version": number,"p_step"?: number }; Returns: number
                           },
"expire_grants":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"expire_reservations":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"grant_tokens":
{ Args: { "p_actor_id"?: string,"p_amount": number,"p_expires_at"?: string,"p_note"?: string,"p_reference": string,"p_reference_type": string,"p_source": Database["public"]['Enums']["token_grant_source"],"p_workspace_id": string }; Returns: string
                           },
"has_brand_access":
{ Args: { "b": string }; Returns: boolean
                           },
"is_impersonation_readonly":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_platform_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_workspace_member":
{ Args: { "ws": string }; Returns: boolean
                           },
"match_knowledge_chunks":
{ Args: { "p_brand_id": string,"p_embedding": string,"p_limit"?: number,"p_source_types"?: (string)[] }; Returns: {
              "chunk_index": number,"content": string,"id": string,"metadata": Json,"similarity": number,"source_id": string,"source_type": string
            }[]
                           },
"minute_bucket":
{ Args: { "ts": string }; Returns: number
                           },
"next_brand_profile_version":
{ Args: { "p_brand_id": string }; Returns: number
                           },
"release_reservation":
{ Args: { "p_reason"?: string,"p_reservation_id": string }; Returns: undefined
                           },
"request_account_deletion":
{ Args: { "p_email"?: string,"p_external_user_id"?: string,"p_source": string,"p_user_id"?: string }; Returns: Json
                           },
"reserve_tokens":
{ Args: { "p_amount": number,"p_brand_id"?: string,"p_generation_id"?: string,"p_ttl_minutes"?: number,"p_user_id"?: string,"p_workspace_id": string }; Returns: string
                           },
"revoke_tokens_to":
{ Args: { "p_grant_id"?: string,"p_note"?: string,"p_reference": string,"p_target": number,"p_workspace_id": string }; Returns: number
                           },
"shares_workspace_with":
{ Args: { "other": string }; Returns: boolean
                           },
"stale_incoming_uploads":
{ Args: { "p_before": string,"p_limit"?: number }; Returns: {
              "name": string
            }[]
                           },
"storage_brand_id":
{ Args: { "p_name": string }; Returns: string
                           },
"storage_workspace_id":
{ Args: { "p_name": string }; Returns: string
                           },
"transfer_workspace_ownership":
{ Args: { "p_new_owner": string,"p_workspace_id": string }; Returns: undefined
                           },
"transition_post":
{ Args: { "p_actor": string,"p_expected_version": number,"p_post_id": string,"p_summary"?: string,"p_to": Database["public"]['Enums']["post_status"] }; Returns: number
                           },
"workspace_role":
{ Args: { "ws": string }; Returns: Database["public"]['Enums']["workspace_role"]
                           },
"workspace_token_balance":
{ Args: { "p_workspace_id": string }; Returns: Json
                           },
"workspace_token_totals":
{ Args: { "p_workspace_id": string }; Returns: {
              "available": number,"reserved": number,"total": number
            }[]
                           }
          }
          Enums: {
            "ai_generation_status": "queued"|"running"|"succeeded"|"failed"|"canceled","ai_generation_type": "text"|"rewrite"|"translate"|"hashtags"|"repurpose"|"variants"|"image_from_photo"|"image_from_prompt"|"visual_template"|"vision_describe"|"unsplash_rank"|"strategy"|"insights"|"brand_profile"|"photo_style"|"embedding"|"quality_check"|"canva_design"|"canva_export"|"studio_chat"|"inbox_reply"|"month_plan","approval_decision": "approved"|"rejected"|"changes_requested","brand_status": "active"|"paused"|"archived","crawl_status": "queued"|"running"|"succeeded"|"partial"|"failed"|"canceled","impersonation_mode": "read_only"|"full","invitation_status": "pending"|"accepted"|"expired"|"revoked","ledger_reason": "grant"|"consume"|"refund"|"admin_adjust"|"expire","media_kind": "image"|"video","media_source": "upload"|"canva"|"unsplash"|"template"|"gemini"|"pexels","notification_channel": "in_app"|"email"|"push","page_type": "home"|"about"|"services"|"products"|"pricing"|"portfolio"|"case_study"|"blog_index"|"blog_post"|"reviews"|"faq"|"contact"|"team"|"careers"|"legal"|"other","payment_event_status": "received"|"processing"|"processed"|"failed"|"ignored","plan_kind": "subscription"|"topup","platform_role": "user"|"platform_admin","post_source": "manual"|"ai"|"autopilot"|"suggestion"|"evergreen"|"import","post_status": "draft"|"in_review"|"approved"|"scheduled"|"publishing"|"published"|"partially_published"|"failed"|"rejected"|"paused"|"canceled","social_account_status": "active"|"needs_reauth"|"disabled"|"revoked","social_platform": "facebook"|"instagram"|"linkedin"|"tiktok"|"x"|"youtube"|"pinterest"|"google_business","strategy_status": "draft"|"active"|"archived","subscription_status": "trialing"|"active"|"past_due"|"canceled"|"unpaid"|"incomplete"|"paused","suggestion_source": "blog"|"site_change"|"holiday"|"analytics"|"insight"|"evergreen"|"manual","suggestion_status": "new"|"accepted"|"dismissed"|"expired","target_status": "pending"|"scheduled"|"publishing"|"published"|"failed"|"paused"|"needs_reauth"|"canceled"|"deleted_externally"|"assisted_pending"|"assisted_done","token_grant_source": "signup"|"subscription"|"topup"|"admin"|"refund","token_reservation_status": "reserved"|"confirmed"|"released"|"expired","workspace_role": "owner"|"admin"|"editor"|"approver"|"viewer","workspace_type": "business"|"agency"
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
            "ai_generation_status": ["queued", "running", "succeeded", "failed", "canceled"],"ai_generation_type": ["text", "rewrite", "translate", "hashtags", "repurpose", "variants", "image_from_photo", "image_from_prompt", "visual_template", "vision_describe", "unsplash_rank", "strategy", "insights", "brand_profile", "photo_style", "embedding", "quality_check", "canva_design", "canva_export", "studio_chat", "inbox_reply", "month_plan"],"approval_decision": ["approved", "rejected", "changes_requested"],"brand_status": ["active", "paused", "archived"],"crawl_status": ["queued", "running", "succeeded", "partial", "failed", "canceled"],"impersonation_mode": ["read_only", "full"],"invitation_status": ["pending", "accepted", "expired", "revoked"],"ledger_reason": ["grant", "consume", "refund", "admin_adjust", "expire"],"media_kind": ["image", "video"],"media_source": ["upload", "canva", "unsplash", "template", "gemini", "pexels"],"notification_channel": ["in_app", "email", "push"],"page_type": ["home", "about", "services", "products", "pricing", "portfolio", "case_study", "blog_index", "blog_post", "reviews", "faq", "contact", "team", "careers", "legal", "other"],"payment_event_status": ["received", "processing", "processed", "failed", "ignored"],"plan_kind": ["subscription", "topup"],"platform_role": ["user", "platform_admin"],"post_source": ["manual", "ai", "autopilot", "suggestion", "evergreen", "import"],"post_status": ["draft", "in_review", "approved", "scheduled", "publishing", "published", "partially_published", "failed", "rejected", "paused", "canceled"],"social_account_status": ["active", "needs_reauth", "disabled", "revoked"],"social_platform": ["facebook", "instagram", "linkedin", "tiktok", "x", "youtube", "pinterest", "google_business"],"strategy_status": ["draft", "active", "archived"],"subscription_status": ["trialing", "active", "past_due", "canceled", "unpaid", "incomplete", "paused"],"suggestion_source": ["blog", "site_change", "holiday", "analytics", "insight", "evergreen", "manual"],"suggestion_status": ["new", "accepted", "dismissed", "expired"],"target_status": ["pending", "scheduled", "publishing", "published", "failed", "paused", "needs_reauth", "canceled", "deleted_externally", "assisted_pending", "assisted_done"],"token_grant_source": ["signup", "subscription", "topup", "admin", "refund"],"token_reservation_status": ["reserved", "confirmed", "released", "expired"],"workspace_role": ["owner", "admin", "editor", "approver", "viewer"],"workspace_type": ["business", "agency"]
          }
        }
} as const
